/**
 * Contratti Dropbox Sign ↔ Centro HR — lato server (09/10/2026).
 *
 * Giro di sincronizzazione (cron notturno via dispatcher + bottone in /admin/hr/contratti):
 *  1. elenco di tutte le richieste di firma da Dropbox Sign (sola lettura);
 *  2. per i contratti nuovi o appena firmati: PDF → testo → tipo e mansione
 *     (`classifyContract`). La lettura è immutabile una volta fatta sul testo firmato;
 *  3. abbinamento alle schede (email, poi nome; le scelte a mano vincono sempre);
 *  4. per ogni persona: stato (firmato / manca / mansione cambiata …) e, se serve,
 *     aggiornamento del campo «Stato del contratto» (va anche su ClickUp);
 *  5. il PDF firmato si ALLEGA al task ClickUp della persona, una volta sola.
 *
 * Dove stanno i file: come per i documenti del modulo, il file sta su ClickUp (e resta su
 * Dropbox Sign, che è la fonte); in KV solo metadati (titolo, date, chi firma, mansione
 * letta). Il PDF in app si apre passando da Dropbox Sign (`/api/admin/hr/contracts/[id]/pdf`),
 * senza copie in HOC Pro.
 *
 * Lo STATO si calcola sempre alla lettura dai dati correnti della scheda: se l'HR cambia
 * la mansione nel CRM, la scheda dice subito "mansione cambiata"; il campo su ClickUp
 * segue al giro successivo (o subito, dalla PATCH della scheda: `reconcilePerson`).
 */
import { kv } from "@vercel/kv";
import { listAllSignatureRequests, downloadContractPdf, pdfText, dropboxSignConfigured } from "./dropbox-sign.js";
import { requestToContract, classifyContract, matchContracts, contractStatus, desiredContractField, PERSONNEL_KINDS, KIND } from "./hr-contracts-core.js";
import { listPeople, getPerson, savePerson, appendLog, hrSyncConfig } from "./hr-people.js";
import { uploadAttachment } from "./clickup-hr-api.js";

const K = {
  store: "hr:contracts:store",       // { syncedAt, contracts: [...], lastError }
  links: "hr:contracts:links",       // hash contractId → personId | "none" (scelte a mano)
  attached: "hr:contracts:attached", // hash contractId → { personId, taskId, attachmentId, at }
  lock: "hr:contracts:lock",
  heartbeat: "cron:heartbeat:hr-contracts",
};
const ACTOR = "Dropbox Sign";

const parse = (v) => { if (v == null) return null; if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v; };

export async function getStore() {
  return parse(await kv.get(K.store)) || { syncedAt: null, contracts: [] };
}
export async function getLinks() {
  return (await kv.hgetall(K.links)) || {};
}
export async function getAttached() {
  const h = (await kv.hgetall(K.attached)) || {};
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, parse(v)]));
}

/** Persone in forma minima per l'abbinamento. */
const toMatchPerson = (p) => ({ id: p.id, firstName: p.fields?.firstName || "", surname: p.fields?.surname || "", emails: [p.fields?.personalEmail, p.fields?.companyEmail] });
const fullName = (p) => `${p.fields?.firstName || ""} ${p.fields?.surname || ""}`.replace(/\s+/g, " ").trim() || "Senza nome";

/**
 * Vista completa: stato per persona + contratti senza scheda. Pura sui dati passati
 * (le route caricano una volta persone e contratti e la riusano).
 */
export function buildView(people, store, links = {}, attached = {}) {
  const contracts = store?.contracts || [];
  const byId = Object.fromEntries(contracts.map((c) => [c.id, c]));
  const active = people.filter((p) => !p.archived);
  const { byContract, ambiguous } = matchContracts(contracts, active.map(toMatchPerson), links);
  const perPerson = {};
  for (const [cid, m] of Object.entries(byContract)) (perPerson[m.personId] ||= []).push(cid);
  const persons = {};
  for (const p of active) {
    const ids = (perPerson[p.id] || []).sort((a, b) => (byId[a].createdAt || 0) - (byId[b].createdAt || 0));
    const status = contractStatus(p.fields?.mansioni, ids.map((id) => byId[id]));
    persons[p.id] = { ...status, contracts: ids, current: p.fields?.hvContractStatus || null };
  }
  const linked = new Set(Object.keys(byContract));
  const unmatched = contracts
    .filter((c) => !linked.has(c.id) && links[c.id] !== "none")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((c) => c.id);
  return {
    syncedAt: store?.syncedAt || null,
    lastError: store?.lastError || null,
    contracts: Object.fromEntries(contracts.map((c) => [c.id, { ...c, match: byContract[c.id] || null, ambiguous: ambiguous[c.id] || null, attached: Boolean(attached[c.id]), excluded: links[c.id] === "none" }])),
    persons,
    unmatched,
    names: Object.fromEntries(active.map((p) => [p.id, fullName(p)])),
  };
}

export async function getView() {
  const [people, store, links, attached] = await Promise.all([listPeople(), getStore(), getLinks(), getAttached()]);
  return { view: buildView(people, store, links, attached), people };
}

// ── Sincronizzazione ─────────────────────────────────────────────────────────

/**
 * Un giro completo a budget. `pdfSource(id)` → bytes (di base: download da Dropbox Sign;
 * lo script del primo caricamento passa i PDF già scaricati).
 */
export async function syncContracts({ budgetMs = 45_000, pdfSource = downloadContractPdf, by = "sistema" } = {}) {
  if (!dropboxSignConfigured()) return { ok: false, reason: "DROPBOX_SIGN_API_KEY non configurata" };
  const got = await kv.set(K.lock, Date.now(), { nx: true, ex: Math.ceil(budgetMs / 1000) + 30 }).catch(() => "OK");
  if (!got) return { ok: false, reason: "un altro aggiornamento è in corso" };
  const deadline = Date.now() + budgetMs;
  const stats = { requests: 0, classified: 0, pending: 0, statusSet: 0, attached: 0, attachPending: 0, errors: [] };
  try {
    const store = await getStore();
    const prev = Object.fromEntries((store.contracts || []).map((c) => [c.id, c]));
    let reqs;
    try {
      reqs = await listAllSignatureRequests();
    } catch (e) {
      await kv.set(K.store, { ...store, lastError: { at: Date.now(), message: e.message } });
      return { ok: false, reason: e.message };
    }
    stats.requests = reqs.length;
    const contracts = [];
    for (const r of reqs) {
      const base = requestToContract(r);
      const old = prev[base.id];
      // lettura dal testo firmato = definitiva; dal titolo = da rifare quando arriva la firma
      const keep = old && old.kind && (old.readFrom === "testo" || (old.readFrom === "titolo" && (base.state !== "firmato" || old.pdfMissing)));
      contracts.push(keep ? { ...base, kind: old.kind, role: old.role, mansione: old.mansione, readFrom: old.readFrom, pdfMissing: old.pdfMissing || false } : { ...base, kind: null });
    }
    // lettura dei contratti nuovi: i non firmati dal titolo (il PDF non c'è), i firmati dal testo
    for (const c of contracts) {
      if (c.kind) continue;
      if (c.state !== "firmato") { Object.assign(c, classifyContract({ title: c.title })); stats.classified++; continue; }
      if (Date.now() > deadline - 4000) { stats.pending++; continue; }
      let bytes = null;
      try { bytes = await pdfSource(c.id); } catch (e) {
        if (e?.status === 429) { stats.pending++; continue; }
        stats.errors.push(`${c.title}: ${e.message}`.slice(0, 160));
      }
      const text = bytes ? await pdfText(bytes) : "";
      Object.assign(c, classifyContract({ text, title: c.title }), { pdfMissing: !bytes });
      stats.classified++;
    }
    // quelli non ancora letti restano fuori dallo stato fino al prossimo giro (mai una mansione inventata)
    const ready = contracts.filter((c) => c.kind);
    const next = { syncedAt: Date.now(), contracts: ready, lastError: null, pendingRead: stats.pending };
    await kv.set(K.store, next);
    const applied = await applyToCrm({ store: next, deadline, pdfSource, by });
    Object.assign(stats, applied);
    return { ok: true, ...stats };
  } finally {
    await kv.del(K.lock).catch(() => {});
  }
}

/** Campo «Stato del contratto» + PDF allegati su ClickUp, per tutte le persone abbinate. */
async function applyToCrm({ store, deadline, pdfSource, by, onlyPersonId = null }) {
  const out = { statusSet: 0, attached: 0, attachPending: 0, errors: [] };
  const [people, links, attached] = await Promise.all([listPeople(), getLinks(), getAttached()]);
  const view = buildView(people, store, links, attached);
  const byPersonId = Object.fromEntries(people.map((p) => [p.id, p]));
  const syncOn = hrSyncConfig().enabled;
  for (const [pid, st] of Object.entries(view.persons)) {
    if (onlyPersonId && pid !== onlyPersonId) continue;
    if (Date.now() > deadline) break;
    const want = desiredContractField(st, st.current);
    if (want) {
      const r = await savePerson({ id: pid, input: { hvContractStatus: want }, allowed: ["hvContractStatus"], actor: ACTOR, source: "sistema" });
      if (r.ok) out.statusSet++; else out.errors.push(`${view.names[pid]}: ${r.errors?.join(" ")}`);
    }
    // PDF firmati (contratti del personale e risoluzioni) sul task ClickUp, una volta sola per task
    const person = byPersonId[pid];
    if (!syncOn || !person?.clickupTaskId) continue;
    for (const cid of st.contracts) {
      const c = view.contracts[cid];
      if (c.state !== "firmato" || !(PERSONNEL_KINDS.has(c.kind) || c.kind === KIND.risoluzione)) continue;
      const done = attached[cid];
      if (done && done.taskId === person.clickupTaskId) continue;
      if (Date.now() > deadline - 6000) { out.attachPending++; continue; }
      try {
        const bytes = await pdfSource(cid);
        if (!bytes) continue;
        const day = new Date(c.signedAt || c.createdAt).toISOString().slice(0, 10);
        const filename = `${c.title.replace(/[^\p{L}\p{N} .\-]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 90)} (firmato ${day}).pdf`;
        const res = await uploadAttachment(person.clickupTaskId, { filename, bytes, contentType: "application/pdf" });
        const rec = { personId: pid, taskId: person.clickupTaskId, attachmentId: String(res?.id || ""), at: Date.now() };
        await kv.hset(K.attached, { [cid]: JSON.stringify(rec) });
        attached[cid] = rec;
        await appendLog(pid, [{ at: rec.at, by: by === "sistema" ? ACTOR : by, source: "sistema", action: "contract_attached", field: "contractFiles", from: null, to: filename }]);
        out.attached++;
      } catch (e) {
        if (e?.status === 429) { out.attachPending++; continue; }
        out.errors.push(`${view.names[pid]} · ${c.title}: ${e.message}`.slice(0, 160));
      }
    }
  }
  return out;
}

/** Dopo una modifica alla scheda (es. mansione cambiata): riallinea solo quella persona. */
export async function reconcilePerson(personId, { budgetMs = 20_000 } = {}) {
  const store = await getStore();
  if (!store.contracts?.length) return null;
  return applyToCrm({ store, deadline: Date.now() + budgetMs, pdfSource: downloadContractPdf, by: "sistema", onlyPersonId: personId });
}

/** Scelta a mano: `personId` = collega, "none" = non è del personale, null = torna all'automatico. */
export async function setContractLink(contractId, personId, { actor } = {}) {
  const store = await getStore();
  const c = (store.contracts || []).find((x) => x.id === contractId);
  if (!c) return { ok: false, status: 404, error: "Contratto non trovato: aggiorna da Dropbox Sign." };
  if (personId && personId !== "none" && !(await getPerson(personId))) return { ok: false, status: 404, error: "Persona non trovata." };
  const before = (await kv.hget(K.links, contractId)) || null;
  if (personId) await kv.hset(K.links, { [contractId]: personId });
  else await kv.hdel(K.links, contractId);
  const at = Date.now();
  const note = personId === "none" ? "segnato come non del personale" : personId ? "collegato a mano" : "tornato all'abbinamento automatico";
  for (const pid of new Set([before, personId].filter((x) => x && x !== "none"))) {
    await appendLog(pid, [{ at, by: actor, source: "app", action: "contract_link", field: null, from: null, to: `${c.title}: ${pid === personId ? note : "scollegato"}` }]).catch(() => {});
  }
  // stato e allegato della persona interessata subito (senza aspettare la notte)
  let applied = null;
  if (personId && personId !== "none") applied = await applyToCrm({ store, deadline: Date.now() + 25_000, pdfSource: downloadContractPdf, by: actor, onlyPersonId: personId });
  return { ok: true, applied };
}

export async function beat(result) {
  await kv.set(K.heartbeat, { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
}
