/**
 * Contratti da recuperare nello spazio Area Partner (18/10/2026) — lato server.
 * Regole in hr-contract-milestone-core.js. KV `hr:contracts:milestone` =
 * { parentId, items: { personId: { taskId, state, at } } }. Gira di notte (dispatcher) e,
 * per la singola persona, subito dopo una modifica alla scheda (app o webhook ClickUp).
 */
import { kv } from "@vercel/kv";
import { createTask, updateTask, getTask, hrSyncConfig, isTaskGone } from "./clickup-hr-api.js";
import { listPeople, getPerson, savePerson, appendLog } from "./hr-people.js";
import { planMilestones, subtaskName, subtaskDescription, subtaskSig, contractChecks, RESET_TO, PARENT_NAME, DONE_STATUS } from "./hr-contract-milestone-core.js";

// ⭐️ Area Partner → Milestone (Human Resources). Variabile d'ambiente solo per cambiarla.
export const MILESTONE_LIST_ID = () => String(process.env.HR_MILESTONE_LIST_ID || "901222833798").trim();
const KEY = "hr:contracts:milestone";
const LOCK = "hr:contracts:milestone:lock";

const load = async () => ({ snaps: {}, reasons: {}, ...((await kv.get(KEY).catch(() => null)) || { parentId: null, items: {} }) });

/**
 * 19/10/2026 — contratto «Firmato» ma non più valido (rientro dopo un'uscita, cambio di mansione):
 * lo stato torna «Da preparare» (su ClickUp «To Do») e il motivo finisce nel sottotask. Regola in
 * contractChecks (core). Ritorna le schede aggiornate, con il motivo attaccato per la descrizione.
 */
async function applyContractChecks(rec, people, { only = null } = {}) {
  const { resets, snaps } = contractChecks(people, rec.snaps || {});
  rec.snaps = only ? { ...(rec.snaps || {}), ...Object.fromEntries(Object.entries(snaps).filter(([id]) => id === only)) } : snaps;
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const r of resets) {
    try {
      const res = await savePerson({ id: r.id, input: { hvContractStatus: RESET_TO }, allowed: ["hvContractStatus"], actor: "sistema", source: "sistema" });
      if (res?.ok && res.person) byId.set(r.id, res.person);
      await appendLog(r.id, [{ at: Date.now(), by: "sistema", source: "sistema", action: "update", field: "hvContractStatus", from: null, to: `${RESET_TO} — serve un contratto nuovo: ${r.reason}` }]).catch(() => {});
      rec.reasons = { ...(rec.reasons || {}), [r.id]: r.reason };
    } catch { /* si riprova al giro dopo */ }
  }
  return [...byId.values()].map((p) => (rec.reasons?.[p.id] ? { ...p, contractReason: rec.reasons[p.id] } : p));
}
const save = (rec) => kv.set(KEY, rec);

async function ensureParent(rec) {
  if (rec.parentId) {
    try {
      const t = await getTask(rec.parentId);
      if (t?.id && !t.deleted) return rec.parentId;
    } catch (e) { if (!isTaskGone(e)) throw e; }
    rec.items = {}; // task padre cancellato: si riparte da zero
  }
  const t = await createTask(MILESTONE_LIST_ID(), {
    name: PARENT_NAME,
    status: "in lavorazione",
    description: "Creato e aggiornato da HOC Pro. Un sottotask per ogni persona del CRM senza contratto firmato. Si chiude da solo quando nella scheda del CRM «HV Contract Status» diventa «Signed» (o la persona va in «Uscita»).",
  });
  rec.parentId = String(t.id);
  return rec.parentId;
}

async function apply(rec, plan, { deadline, by }) {
  const out = { created: 0, closed: 0, updated: 0, pending: 0, errors: [] };
  for (const pid of plan.close) {
    if (Date.now() > deadline) { out.pending++; continue; }
    const it = rec.items[pid];
    try { await updateTask(it.taskId, { status: DONE_STATUS }); } catch (e) { if (!isTaskGone(e)) { out.errors.push(`${pid}: ${e.message}`); continue; } }
    rec.items[pid] = { ...it, state: "done", at: Date.now() };
    if (rec.reasons?.[pid]) { const { [pid]: _gone, ...rest } = rec.reasons; rec.reasons = rest; }
    out.closed++;
  }
  for (const p of plan.update || []) {
    if (Date.now() > deadline) { out.pending++; continue; }
    const it = rec.items[p.id];
    try { await updateTask(it.taskId, { name: subtaskName(p), description: subtaskDescription(p) }); }
    catch (e) { if (!isTaskGone(e)) { out.errors.push(`${subtaskName(p)}: ${e.message}`.slice(0, 160)); continue; } }
    rec.items[p.id] = { ...it, sig: subtaskSig(p), at: Date.now() };
    out.updated++;
  }
  if (plan.create.length) await ensureParent(rec);
  for (const p of plan.create) {
    if (Date.now() > deadline) { out.pending++; continue; }
    try {
      const t = await createTask(MILESTONE_LIST_ID(), { name: subtaskName(p), parent: rec.parentId, status: "backlog", description: subtaskDescription(p) });
      rec.items[p.id] = { taskId: String(t.id), state: "open", sig: subtaskSig(p), at: Date.now() };
      out.created++;
    } catch (e) { out.errors.push(`${subtaskName(p)}: ${e.message}`.slice(0, 160)); }
  }
  await save(rec);
  return out;
}

/** Giro completo (notte, o bottone). */
export async function syncContractMilestones({ budgetMs = 45_000, by = "sistema", waitMs = 0 } = {}) {
  if (!hrSyncConfig().enabled) return { ok: false, reason: "sincronizzazione ClickUp spenta" };
  // 19/10/2026: dal bottone si aspetta qualche secondo che finisca il giro della singola persona
  // (parte da solo dopo ogni modifica alla scheda), invece di rinunciare subito
  let got = null;
  for (const until = Date.now() + waitMs; ; ) {
    got = await kv.set(LOCK, Date.now(), { nx: true, ex: Math.ceil(budgetMs / 1000) + 30 }).catch(() => "OK");
    if (got || Date.now() > until) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!got) return { ok: false, reason: "un altro giro è in corso" };
  try {
    const rec = await load();
    const people0 = await listPeople({ archived: "include" }).catch(() => listPeople());
    const people = await applyContractChecks(rec, people0);
    const plan = planMilestones(people, rec.items);
    const r = await apply(rec, plan, { deadline: Date.now() + budgetMs, by });
    const open = Object.values(rec.items).filter((x) => x.state === "open").length;
    return { ok: true, ...r, open, parentId: rec.parentId };
  } finally {
    await kv.del(LOCK).catch(() => {});
  }
}

/** Solo una persona, subito dopo una modifica alla sua scheda. */
export async function syncContractMilestoneFor(personId) {
  if (!personId || !hrSyncConfig().enabled) return null;
  const got = await kv.set(LOCK, Date.now(), { nx: true, ex: 40 }).catch(() => "OK");
  if (!got) return null; // c'è un giro completo in corso: lo prende lui (o la notte)
  try {
    const rec = await load();
    const p0 = await getPerson(personId);
    const people = p0 ? await applyContractChecks(rec, [p0], { only: personId }) : [];
    const items = rec.items[personId] ? { [personId]: rec.items[personId] } : {};
    const plan = planMilestones(people, items);
    if (!plan.create.length && !plan.close.length && !plan.update.length) { await save(rec); return { ok: true, noop: true }; }
    return await apply(rec, plan, { deadline: Date.now() + 20_000, by: "sistema" });
  } finally {
    await kv.del(LOCK).catch(() => {});
  }
}

export const milestoneStatus = async () => {
  const rec = await load();
  return { parentId: rec.parentId, open: Object.values(rec.items || {}).filter((x) => x.state === "open").length, done: Object.values(rec.items || {}).filter((x) => x.state === "done").length };
};
