/**
 * Centro HR, fase 1 — CRM persone (29/09/2026). HOC Pro è il MASTER, ClickUp
 * lo specchio operativo, sincronizzato nei due sensi.
 *
 * KV:
 *   hr:person:{id}          scheda (fields in chiaro TRANNE il codice fiscale → cfEnc)
 *   hr:people:index         SET degli id
 *   hr:person:{id}:log      LIST storico (chi/cosa/quando/da dove), cap 500
 *   hr:task2person:{taskId} task ClickUp → id persona
 *   hr:echo:{taskId}        le nostre ultime scritture verso ClickUp (anti-loop, TTL 60s)
 *   hr:form:{token}         link del modulo pubblico (monouso, 14 giorni)
 *   hr:webhook              { id, secret, endpoint, … } del webhook registrato
 *   hr:import:last          esito dell'ultimo import/riconciliazione
 *   hr:conflicts            LIST degli ultimi conflitti (cap 200)
 *
 * Regole:
 *  - salvare in app non fallisce MAI per colpa di ClickUp: la sync è best-effort,
 *    l'esito resta sulla scheda (`sync`) e i campi non spinti in `pendingKeys`
 *    (la riconciliazione notturna li riprova e NON li sovrascrive da ClickUp).
 *  - conflitto = vince l'ultima modifica per campo (resolveFieldConflicts).
 *  - nessuna cancellazione: un task cancellato su ClickUp stacca la scheda, non
 *    la elimina; doppioni e schede spazzatura si segnalano e basta.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import {
  FIELDS, FIELD_BY_KEY, FORM_KEYS, EDITABLE_KEYS, FORM_TTL_DAYS, PRIVACY_VERSION, UPLOAD_MAX_BYTES,
  normalizePersonInput, applyChanges, resolveFieldConflicts, filterEchoes, recordEcho, computeCleanup,
  valuesEqual, maskCf, logValue, formTokenState, sniffFileType, fullName, valueHash, dropUnchangedSinceBase,
} from "./hr-people-core.js";
import { taskToPerson, personToClickup, createTaskPayload, incomingTimestamps, expectedFieldNames, fieldsByName } from "./hr-clickup-map.js";
import {
  hrSyncConfig, getListFields, getListInfo, listAllTasks, getTask, createTask, updateTask, setField, removeField,
  uploadAttachment, resolveTeamId, createWebhook, deleteWebhook, ClickupError,
} from "./clickup-hr-api.js";
import { hrCryptoConfigured, encryptHr, decryptHr } from "./hr-crypto.js";

const K = {
  person: (id) => `hr:person:${id}`,
  log: (id) => `hr:person:${id}:log`,
  index: "hr:people:index",
  task: (tid) => `hr:task2person:${tid}`,
  echo: (tid) => `hr:echo:${tid}`,
  form: (t) => `hr:form:${t}`,
  webhook: "hr:webhook",
  lastImport: "hr:import:last",
  conflicts: "hr:conflicts",
  lock: "hr:import:lock",
};
const LOG_CAP = 500;
const DAY = 24 * 3600 * 1000;

export { hrSyncConfig };
export const newPersonId = () => "p_" + randomBytes(8).toString("hex");

// ── Lettura / scrittura ─────────────────────────────────────────────────────
export async function getPerson(id) {
  if (!id || typeof id !== "string" || !/^p_[a-f0-9]{16}$/.test(id)) return null;
  return (await kv.get(K.person(id))) || null;
}

export async function listPeople() {
  const ids = (await kv.smembers(K.index)) || [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const recs = chunk.length ? await kv.mget(...chunk.map(K.person)) : [];
    out.push(...recs.filter(Boolean));
  }
  return out;
}

async function putPerson(p) {
  await kv.set(K.person(p.id), p);
  await kv.sadd(K.index, p.id);
  if (p.clickupTaskId) await kv.set(K.task(p.clickupTaskId), p.id);
}

export async function appendLog(id, entries) {
  if (!entries?.length) return;
  await kv.lpush(K.log(id), ...entries.map((e) => JSON.stringify(e)));
  await kv.ltrim(K.log(id), 0, LOG_CAP - 1);
}
export async function getLog(id, limit = 200) {
  const rows = (await kv.lrange(K.log(id), 0, limit - 1)) || [];
  return rows.map((r) => (typeof r === "string" ? safeJson(r) : r)).filter(Boolean);
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

function readCf(person) {
  if (!person?.cfEnc) return null;
  if (!hrCryptoConfigured()) return undefined; // c'è ma non si può leggere
  try { return decryptHr(person.cfEnc); } catch { return undefined; }
}

/** Vista per le API admin: mai il cifrato, mai il CF in chiaro. */
export function publicPerson(p, { withCfMask = false } = {}) {
  if (!p) return null;
  const { cfEnc, cuBase, ...rest } = p;
  const out = { ...rest, hasCf: Boolean(cfEnc), name: fullName(p.fields) || "Senza nome" };
  if (withCfMask && cfEnc) {
    const cf = readCf(p);
    out.cfMasked = cf ? maskCf(cf) : null;
    out.cfUnreadable = cf === undefined;
  }
  return out;
}

// ── Salvataggio (app e modulo) ──────────────────────────────────────────────
/**
 * @param opts.id       id persona (null = nuova)
 * @param opts.input    valori grezzi
 * @param opts.allowed  chiavi ammesse (EDITABLE_KEYS per l'admin, FORM_KEYS per il modulo)
 * @param opts.actor    chi (userId Clerk, "modulo", …)
 * @param opts.source   "app" | "modulo"
 */
export async function savePerson({ id = null, input = {}, allowed = EDITABLE_KEYS, actor, source = "app", sync = true, extra = null }) {
  const at = Date.now();
  const { values, cf, errors } = normalizePersonInput(input, allowed);
  let person = id ? await getPerson(id) : null;
  if (id && !person) return { ok: false, status: 404, errors: ["Persona non trovata."] };
  const creating = !person;
  if (creating && !values.firstName) errors.push("Nome: obbligatorio.");
  if (errors.length) return { ok: false, status: 400, errors: [...new Set(errors)] };
  if (creating) {
    person = { id: newPersonId(), createdAt: at, updatedAt: at, source, fields: {}, fieldUpdatedAt: {}, clickupTaskId: null, sync: { status: "pending" } };
  }
  const r = applyChanges(person, values, { at, by: actor, source });
  person = r.person;
  const changed = [...r.changed];
  const log = [...r.log];
  let cfNote = null;
  if (cf !== undefined) {
    if (!hrCryptoConfigured()) {
      cfNote = "Codice fiscale NON salvato: manca la chiave di cifratura (HR_ENCRYPTION_KEY). Il resto è salvato.";
    } else {
      const prev = readCf(person);
      if ((prev || null) !== (cf || null)) {
        person = { ...person, cfEnc: cf ? encryptHr(cf) : null, fieldUpdatedAt: { ...person.fieldUpdatedAt, codiceFiscale: at }, updatedAt: at };
        changed.push("codiceFiscale");
        log.push({ at, by: actor, source, action: "update", field: "codiceFiscale", from: logValue("codiceFiscale", prev), to: logValue("codiceFiscale", cf) });
      }
    }
  }
  if (extra) person = { ...person, ...extra(person, at) };
  if (creating) log.unshift({ at, by: actor, source, action: "create", field: null });
  if (!creating && !changed.length && !extra) return { ok: true, person, changed: [], cfNote, sync: null };
  person.pendingKeys = [...new Set([...(person.pendingKeys || []), ...changed])];
  await putPerson(person);
  await appendLog(person.id, log);
  let syncRes = null;
  if (sync) {
    syncRes = await pushPersonSafe(person, creating ? null : changed, { actor });
    person = syncRes.person || person;
  }
  return { ok: true, person, changed, cfNote, sync: syncRes && { status: syncRes.status, errors: syncRes.errors, skipped: syncRes.skipped, message: syncRes.message } };
}

// ── App → ClickUp ────────────────────────────────────────────────────────────
/**
 * Porta la persona su ClickUp (crea il task se manca). `keys` = campi da
 * spingere (null = tutti). Non lancia: l'esito finisce sulla scheda.
 */
export async function pushPersonSafe(person, keys, { actor = "sistema" } = {}) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) {
    const p = { ...person, sync: { status: "off", at: Date.now(), message: "Sincronizzazione spenta (HR_CLICKUP_LIST_ID o token mancante)." } };
    await kv.set(K.person(p.id), p);
    return { status: "off", person: p, errors: [], skipped: [], message: p.sync.message };
  }
  try {
    return await pushPerson(person, keys, cfg);
  } catch (e) {
    const at = Date.now();
    const message = e instanceof ClickupError || e?.message ? e.message : "errore sconosciuto";
    const p = { ...person, sync: { status: "error", at, message } };
    await kv.set(K.person(p.id), p);
    await appendLog(p.id, [{ at, by: actor, source: "sistema", action: "sync_error", field: null, to: message.slice(0, 300) }]);
    return { status: "error", person: p, errors: [message], skipped: [], message };
  }
}

async function pushPerson(person, keys, cfg) {
  const [fieldsMeta, info] = await Promise.all([getListFields(cfg.listId), getListInfo(cfg.listId)]);
  const cfPlain = readCf(person);
  let task = null;
  if (person.clickupTaskId) {
    try {
      task = await getTask(person.clickupTaskId);
    } catch (e) {
      if (e?.status !== 404 && e?.status !== 401) throw e;
      // task sparito su ClickUp: l'app è master → si ricrea
      await kv.del(K.task(person.clickupTaskId)).catch(() => {});
      task = null;
    }
  }
  const plan = personToClickup(person, fieldsMeta, {
    keys: task ? keys : null, cfPlain, statuses: info.statuses, currentDescription: task?.description || "",
  });
  const at = Date.now();
  const errors = [];
  let p = { ...person };
  // Eco registrata PRIMA di scrivere (il webhook può arrivare mentre scriviamo),
  // coi valori che ClickUp terrà DAVVERO (etichette sconosciute già tolte)
  const pushedValues = {};
  for (const op of plan.fieldOps) pushedValues[op.key] = op.effective;
  for (const k of plan.blockKeys) pushedValues[k] = p.fields?.[k] ?? null;
  if (!task) {
    const created = await createTask(cfg.listId, createTaskPayload(plan));
    p.clickupTaskId = String(created.id);
    p.clickupUrl = created.url || `https://app.clickup.com/t/${created.id}`;
    await kv.set(K.echo(p.clickupTaskId), recordEcho({}, pushedValues, at), { ex: 60 });
  } else {
    const echo = (await kv.get(K.echo(task.id)).catch(() => null)) || {};
    await kv.set(K.echo(task.id), recordEcho(echo, pushedValues, at), { ex: 60 });
    const upd = {};
    if (String(task.name || "") !== plan.name && (!keys || keys.includes("firstName") || keys.includes("surname"))) upd.name = plan.name;
    if (String(task.description || "").trim() !== plan.description.trim()) upd.description = plan.description;
    if (plan.status && String(task.status?.status || "").toLowerCase() !== plan.status.toLowerCase()) upd.status = plan.status;
    if (Object.keys(upd).length) await updateTask(task.id, upd);
    for (const op of plan.fieldOps) {
      try {
        if (op.remove) await removeField(task.id, op.fieldId);
        else await setField(task.id, op.fieldId, op.body);
      } catch (e) {
        errors.push({ key: op.key, error: e?.message || "errore" });
      }
    }
    p.clickupUrl = task.url || p.clickupUrl || `https://app.clickup.com/t/${task.id}`;
  }
  const failed = new Set(errors.map((e) => e.key));
  const done = new Set(task ? (keys || FIELDS.map((f) => f.key)) : FIELDS.map((f) => f.key));
  p.pendingKeys = (p.pendingKeys || []).filter((k) => !done.has(k) || failed.has(k));
  // base = ciò che ora c'è su ClickUp per i campi scritti (mai il CF: niente impronta del dato sensibile)
  const cuBase = { ...(p.cuBase || {}) };
  for (const [k, v] of Object.entries(pushedValues)) if (k !== "codiceFiscale" && !failed.has(k)) cuBase[k] = valueHash(v);
  p.cuBase = cuBase;
  p.sync = {
    status: errors.length ? "partial" : "ok", at,
    message: errors.length ? `${errors.length} campi non aggiornati su ClickUp` : null,
    errors: errors.slice(0, 20), skipped: plan.skipped.slice(0, 30),
  };
  await putPerson(p);
  return { status: p.sync.status, person: p, errors: errors.map((e) => `${FIELD_BY_KEY[e.key]?.label || e.key}: ${e.error}`), skipped: plan.skipped, message: p.sync.message };
}

// ── ClickUp → app ────────────────────────────────────────────────────────────
/**
 * Porta un task nella scheda (crea se nuovo). `incomingAt` = timestamp per
 * campo (webhook) o numero unico (import: date_updated del task).
 * @returns {{ kind: "created"|"updated"|"unchanged", personId, pushBack: string[] }}
 */
export async function ingestTask(task, { incomingAt, by = "clickup", useEcho = false, allowPushBack = true, onlyKeys = null, now = Date.now() } = {}) {
  const m = taskToPerson(task);
  const { codiceFiscale: cfIncomingRaw, ...incomingAll } = m.fields;
  // webhook: si guardano SOLO i campi che l'evento dice cambiati
  const cfIncoming = onlyKeys && !onlyKeys.includes("codiceFiscale") ? undefined : cfIncomingRaw;
  const canCf = hrCryptoConfigured();
  const at = now;
  const readOnlyKeys = FIELDS.filter((f) => f.readOnly && f.cu).map((f) => f.key);
  const incoming = {};
  const incomingRo = {};
  for (const [k, v] of Object.entries(incomingAll)) {
    if (readOnlyKeys.includes(k)) incomingRo[k] = v;
    else if (!onlyKeys || onlyKeys.includes(k)) incoming[k] = v;
  }
  // nuova base = valori ClickUp visti ora (tutti, anche quelli fuori dall'evento)
  const nextBase = Object.fromEntries(Object.entries(incomingAll).filter(([k]) => !readOnlyKeys.includes(k)).map(([k, v]) => [k, valueHash(v)]));

  let personId = (await kv.get(K.task(m.clickupTaskId))) || null;
  if (!personId && m.hocPersonId) {
    const byBlock = await getPerson(m.hocPersonId);
    // stesso id HOC su un task diverso = task duplicato su ClickUp → scheda nuova
    if (byBlock && (!byBlock.clickupTaskId || byBlock.clickupTaskId === m.clickupTaskId)) personId = byBlock.id;
  }
  const clickupMeta = { nameIncludesSurname: m.nameIncludesSurname, status: m.clickupStatus, pulledAt: at, dateUpdated: m.dateUpdated };

  if (!personId) {
    const ts = typeof incomingAt === "number" ? incomingAt : m.dateUpdated || at;
    const fields = {};
    const fieldUpdatedAt = {};
    for (const [k, v] of Object.entries({ ...incoming, ...incomingRo })) { fields[k] = v; fieldUpdatedAt[k] = ts; }
    const person = {
      id: newPersonId(), createdAt: at, updatedAt: at, source: "clickup", fields, fieldUpdatedAt,
      clickupTaskId: m.clickupTaskId, clickupUrl: m.clickupUrl, clickup: clickupMeta,
      sync: { status: "ok", at, message: null }, pendingKeys: [], cuBase: nextBase,
    };
    const log = [{ at, by, source: "clickup", action: "create", field: null, to: "importata da ClickUp" }];
    if (cfIncoming && canCf) { person.cfEnc = encryptHr(cfIncoming); fieldUpdatedAt.codiceFiscale = ts; }
    else if (cfIncoming) log.push({ at, by: "sistema", source: "sistema", action: "cf_skipped", field: "codiceFiscale", to: "manca HR_ENCRYPTION_KEY: codice fiscale non importato" });
    await putPerson(person);
    await appendLog(person.id, log);
    return { kind: "created", personId: person.id, pushBack: [] };
  }

  let person = await getPerson(personId);
  if (!person) return { kind: "unchanged", personId, pushBack: [] };
  const cfPrev = readCf(person);
  const current = { fields: { ...person.fields }, fieldUpdatedAt: person.fieldUpdatedAt || {} };
  const inc = { ...incoming };
  if (cfIncoming !== undefined && canCf && cfPrev !== undefined) { inc.codiceFiscale = cfIncoming || null; current.fields.codiceFiscale = cfPrev; }

  // campi che su ClickUp non sono cambiati dall'ultima sincronizzazione: non toccano l'app
  let { incoming: fresh } = dropUnchangedSinceBase(inc, person.cuBase || {});
  let echoes = [];
  if (useEcho) {
    const echo = (await kv.get(K.echo(m.clickupTaskId)).catch(() => null)) || {};
    ({ incoming: fresh, echoes } = filterEchoes(current.fields, fresh, echo, at));
  }
  // campi con scrittura verso ClickUp ancora in sospeso: l'app resta la fonte
  const pending = new Set(person.pendingKeys || []);
  for (const k of Object.keys(fresh)) if (pending.has(k)) delete fresh[k];
  const { apply, keepApp } = resolveFieldConflicts(current, fresh, incomingAt ?? m.dateUpdated ?? at);

  const { codiceFiscale: cfApply, ...applyRest } = apply;
  const r = applyChanges(person, { ...applyRest, ...incomingRo }, { at, by, source: "clickup" });
  person = r.person;
  const log = [...r.log];
  // timestamp del campo = quello della modifica su ClickUp, non dell'import
  for (const k of r.changed) {
    const tIn = typeof incomingAt === "number" ? incomingAt : Number(incomingAt?.[k] ?? incomingAt?._default ?? at);
    person.fieldUpdatedAt[k] = Math.min(at, tIn || at);
  }
  if ("codiceFiscale" in apply) {
    person.cfEnc = cfApply ? encryptHr(cfApply) : null;
    person.fieldUpdatedAt = { ...person.fieldUpdatedAt, codiceFiscale: at };
    log.push({ at, by, source: "clickup", action: "update", field: "codiceFiscale", from: logValue("codiceFiscale", cfPrev), to: logValue("codiceFiscale", cfApply) });
  }
  const conflicts = keepApp.map((k) => ({ at, personId, field: k, winner: "app", clickupValue: logValue(k, fresh[k]), appValue: logValue(k, current.fields[k]) }));
  for (const c of conflicts) log.push({ at, by: "sistema", source: "sistema", action: "conflict", field: c.field, from: c.clickupValue, to: `${c.appValue ?? "vuoto"} (vince HOC Pro: modifica più recente)` });
  if (echoes.length) log.push({ at, by: "sistema", source: "sistema", action: "echo_ignored", field: null, to: echoes.join(", ") });
  person.clickupTaskId = m.clickupTaskId;
  person.clickupUrl = m.clickupUrl || person.clickupUrl;
  person.clickup = { ...(person.clickup || {}), ...clickupMeta };
  person.cuBase = { ...(person.cuBase || {}), ...nextBase };
  const changedAny = r.changed.length || "codiceFiscale" in apply;
  await putPerson(person);
  if (log.length) await appendLog(person.id, log);
  if (conflicts.length) {
    await kv.lpush(K.conflicts, ...conflicts.map((c) => JSON.stringify(c)));
    await kv.ltrim(K.conflicts, 0, 199);
  }
  if (keepApp.length && allowPushBack) await pushPersonSafe(person, keepApp, { actor: "sistema" });
  else if (keepApp.length) {
    person.pendingKeys = [...new Set([...(person.pendingKeys || []), ...keepApp])];
    await kv.set(K.person(person.id), person);
  }
  return { kind: changedAny ? "updated" : "unchanged", personId: person.id, pushBack: keepApp };
}

// ── Import completo / riconciliazione ───────────────────────────────────────
/**
 * Legge TUTTA la lista e allinea. mode "import" (manuale) o "reconcile"
 * (notturna). Rispetta un tempo massimo: ciò che non entra resta in
 * `pendingKeys` e passa alla prossima esecuzione.
 */
export async function importFromClickup({ mode = "import", by = "sistema", budgetMs = 45_000 } = {}) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, skipped: true, reason: "Sincronizzazione spenta: imposta HR_CLICKUP_LIST_ID e CLICKUP_API_TOKEN." };
  const got = await kv.set(K.lock, Date.now(), { nx: true, ex: 120 });
  if (!got) return { ok: false, busy: true, reason: "Un import è già in corso: riprova tra un paio di minuti." };
  const start = Date.now();
  const deadline = start + budgetMs;
  const stats = { mode, at: start, by, tasks: 0, created: 0, updated: 0, unchanged: 0, pushedBack: 0, createdOnClickup: 0, missingOnClickup: 0, deferred: 0, errors: [] };
  try {
    await getListFields(cfg.listId, { force: true });
    await getListInfo(cfg.listId, { force: true });
    const tasks = await listAllTasks(cfg.listId);
    stats.tasks = tasks.length;
    const seen = new Set();
    for (const t of tasks) {
      seen.add(String(t.id));
      try {
        const r = await ingestTask(t, { incomingAt: Number(t.date_updated) || start, by: `clickup (${mode === "import" ? "import" : "riconciliazione"})`, allowPushBack: Date.now() < deadline });
        stats[r.kind] += 1;
        stats.pushedBack += r.pushBack.length;
      } catch (e) {
        stats.errors.push({ taskId: String(t.id), error: e?.message || "errore" });
      }
    }
    // Schede in app: task spariti dalla lista, persone mai portate su ClickUp, push in sospeso
    const people = await listPeople();
    for (const p of people) {
      if (p.clickupTaskId && !seen.has(String(p.clickupTaskId))) {
        stats.missingOnClickup += 1;
        if (p.sync?.status !== "missing") {
          await kv.set(K.person(p.id), { ...p, sync: { status: "missing", at: Date.now(), message: "Il task non è più nella lista ClickUp configurata." } });
        }
        continue;
      }
      const needsCreate = !p.clickupTaskId;
      const needsPush = (p.pendingKeys || []).length > 0;
      if (!needsCreate && !needsPush) continue;
      if (Date.now() >= deadline) { stats.deferred += 1; continue; }
      const r = await pushPersonSafe(p, needsCreate ? null : p.pendingKeys, { actor: "sistema" });
      if (needsCreate && r.person?.clickupTaskId) stats.createdOnClickup += 1;
    }
    const cleanup = computeCleanup(await listPeople());
    stats.duplicates = cleanup.duplicates.length;
    stats.junk = cleanup.junk.length;
    stats.durationMs = Date.now() - start;
    stats.errors = stats.errors.slice(0, 30);
    await kv.set(K.lastImport, stats);
    return { ok: true, ...stats };
  } catch (e) {
    const out = { ...stats, ok: false, fatal: e?.message || "errore", durationMs: Date.now() - start };
    await kv.set(K.lastImport, out).catch(() => {});
    return out;
  } finally {
    await kv.del(K.lock).catch(() => {});
  }
}

// ── Webhook ─────────────────────────────────────────────────────────────────
export async function getWebhookRecord() {
  return (await kv.get(K.webhook)) || null;
}

/** Evento ClickUp già verificato (firma) dalla route. */
export async function handleWebhookEvent(payload) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ignored: "sincronizzazione spenta" };
  const event = String(payload?.event || "");
  const taskId = String(payload?.task_id || "");
  if (!taskId) return { ignored: "evento senza task" };
  const at = Date.now();
  const first = (payload.history_items || [])[0];
  const by = first?.user?.username ? `clickup: ${String(first.user.username).slice(0, 80)}` : "clickup";

  if (event === "taskDeleted") {
    const pid = await kv.get(K.task(taskId));
    if (!pid) return { ignored: "task non collegato" };
    const p = await getPerson(pid);
    if (p) {
      await kv.set(K.person(pid), { ...p, clickupTaskId: null, sync: { status: "deleted", at, message: "Task cancellato su ClickUp: la scheda resta in HOC Pro. Al prossimo salvataggio si ricrea." } });
      await appendLog(pid, [{ at, by, source: "clickup", action: "clickup_deleted", field: null, to: `task ${taskId} cancellato` }]);
    }
    await kv.del(K.task(taskId));
    return { ok: true, event, personId: pid };
  }
  if (event !== "taskCreated" && event !== "taskUpdated") return { ignored: `evento ${event}` };

  const task = await getTask(taskId);
  if (String(task?.list?.id || "") !== cfg.listId) return { ignored: "task di un'altra lista" };
  const fieldsMeta = await getListFields(cfg.listId);
  const incomingAt = incomingTimestamps(payload.history_items || [], fieldsMeta, Number(task.date_updated) || at);
  // taskUpdated: solo i campi nominati negli history_items (gli altri non sono cambiati in questo evento)
  const eventKeys = Object.keys(incomingAt).filter((k) => k !== "_default");
  const onlyKeys = event === "taskUpdated" && eventKeys.length ? eventKeys : null;
  const r = await ingestTask(task, { incomingAt, by, useEcho: true, onlyKeys });
  return { ok: true, event, ...r };
}

/** Registra (o sostituisce) il webhook della lista. Il secret resta in KV. */
export async function registerWebhook({ endpoint, actor }) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, error: "Sincronizzazione spenta: imposta HR_CLICKUP_LIST_ID e CLICKUP_API_TOKEN." };
  const teamId = await resolveTeamId();
  const old = await getWebhookRecord();
  if (old?.id) await deleteWebhook(old.id).catch(() => {});
  const res = await createWebhook(teamId, { endpoint, listId: cfg.listId });
  const wh = res.webhook || res;
  const id = String(res.id || wh.id || "");
  const secret = String(wh.secret || res.secret || "");
  if (!id || !secret) return { ok: false, error: "ClickUp non ha restituito id e secret del webhook." };
  const rec = { id, secret, endpoint, listId: cfg.listId, teamId, at: Date.now(), by: actor };
  await kv.set(K.webhook, rec);
  const { secret: _s, ...pub } = rec;
  return { ok: true, webhook: pub };
}

// ── Codice fiscale: "mostra" (loggato) ──────────────────────────────────────
export async function revealCf(id, actor) {
  const p = await getPerson(id);
  if (!p) return { ok: false, status: 404, error: "Persona non trovata." };
  if (!p.cfEnc) return { ok: false, status: 404, error: "Codice fiscale non inserito." };
  if (!hrCryptoConfigured()) return { ok: false, status: 503, error: "Chiave di cifratura assente: il codice fiscale non si può leggere." };
  const cf = readCf(p);
  if (!cf) return { ok: false, status: 500, error: "Codice fiscale illeggibile (chiave cambiata?)." };
  await appendLog(id, [{ at: Date.now(), by: actor, source: "app", action: "cf_revealed", field: "codiceFiscale", to: "mostrato in chiaro" }]);
  return { ok: true, value: cf };
}

// ── Modulo pubblico ─────────────────────────────────────────────────────────
export async function createFormLink({ personId = null, label = "", actor }) {
  let person = null;
  if (personId) {
    person = await getPerson(personId);
    if (!person) return { ok: false, status: 404, error: "Persona non trovata." };
  }
  const now = Date.now();
  const token = randomBytes(24).toString("base64url");
  const rec = { token, personId: person?.id || null, label: String(label || "").slice(0, 120), createdAt: now, expiresAt: now + FORM_TTL_DAYS * DAY, createdBy: actor, uploads: 0 };
  await kv.set(K.form(token), rec, { ex: Math.ceil((FORM_TTL_DAYS + 1) * DAY / 1000) });
  if (person) {
    await kv.set(K.person(person.id), { ...person, formLink: { createdAt: now, expiresAt: rec.expiresAt, submittedAt: null } });
    await appendLog(person.id, [{ at: now, by: actor, source: "app", action: "form_link", field: null, to: `link di compilazione creato (scade il ${new Date(rec.expiresAt).toLocaleDateString("it-IT")})` }]);
  }
  return { ok: true, token, path: `/hr/modulo/${token}`, expiresAt: rec.expiresAt };
}

async function getFormRec(token) {
  if (!token || typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return (await kv.get(K.form(token))) || null;
}

/**
 * Opzioni dei campi a scelta (drop_down / labels): quelle vere della lista
 * ClickUp se la sync è accesa, altrimenti quelle note in codice (o nessuna →
 * testo libero). Chiave → [nomi].
 */
export async function fieldOptions(keys = null) {
  const cfg = hrSyncConfig();
  const out = {};
  const wanted = FIELDS.filter((f) => (f.type === "option" || f.type === "labels") && (!keys || keys.includes(f.key)));
  for (const f of wanted) out[f.key] = f.options ? [...f.options] : [];
  if (!cfg.enabled) return out;
  try {
    const byName = fieldsByName(await getListFields(cfg.listId));
    for (const f of wanted) {
      const meta = byName.get(f.cu.toLowerCase());
      const opts = (meta?.type_config?.options || []).map((o) => String(o.label ?? o.name ?? "")).filter(Boolean);
      if (opts.length) out[f.key] = opts;
    }
  } catch { /* senza opzioni ClickUp restano quelle note / testo libero */ }
  return out;
}
const formOptions = () => fieldOptions(FORM_KEYS);

export async function getFormContext(token) {
  const rec = await getFormRec(token);
  const now = Date.now();
  const state = formTokenState(rec, now);
  if (state === "invalid") return { ok: false, status: 404, error: "Link non valido." };
  if (state === "expired") return { ok: false, status: 410, error: "Questo link è scaduto. Chiedi a HR un link nuovo." };
  if (state === "closed") return { ok: true, state, done: true };
  const person = rec.personId ? await getPerson(rec.personId) : null;
  const prefill = {};
  for (const k of FORM_KEYS) if (k !== "codiceFiscale" && person?.fields?.[k] != null) prefill[k] = person.fields[k];
  return {
    ok: true, state, done: state === "submitted",
    uploadsEnabled: hrSyncConfig().enabled,
    cfEnabled: hrCryptoConfigured(),
    cfPresent: Boolean(person?.cfEnc),
    prefill,
    options: await formOptions(),
    privacyVersion: PRIVACY_VERSION,
    expiresAt: rec.expiresAt,
    maxUploadBytes: UPLOAD_MAX_BYTES,
  };
}

export async function submitForm(token, body) {
  const rec = await getFormRec(token);
  const now = Date.now();
  const state = formTokenState(rec, now);
  if (state === "invalid") return { ok: false, status: 404, error: "Link non valido." };
  if (state === "expired") return { ok: false, status: 410, error: "Questo link è scaduto." };
  if (state !== "open") return { ok: false, status: 409, error: "Questo modulo è già stato inviato." };
  if (body?.consent !== true) return { ok: false, status: 400, error: "Serve il consenso all'informativa privacy." };
  const input = {};
  for (const k of FORM_KEYS) if (k in (body?.data || {})) input[k] = body.data[k];
  // il CF vuoto dal modulo non cancella quello già inserito
  if (!String(input.codiceFiscale || "").trim()) delete input.codiceFiscale;
  const consent = { at: now, version: PRIVACY_VERSION, via: "modulo" };
  const res = await savePerson({
    id: rec.personId, input, allowed: FORM_KEYS, actor: "modulo", source: "modulo",
    extra: () => ({ consent, formLink: { createdAt: rec.createdAt, expiresAt: rec.expiresAt, submittedAt: now } }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.errors.join(" ") };
  await appendLog(res.person.id, [{ at: now, by: "modulo", source: "modulo", action: "consent", field: null, to: `consenso privacy (versione ${PRIVACY_VERSION})` }]);
  const ttl = Math.max(60, Math.ceil((rec.expiresAt - now) / 1000));
  await kv.set(K.form(token), { ...rec, personId: res.person.id, submittedAt: now }, { ex: ttl });
  return { ok: true, cfNote: res.cfNote, uploadsEnabled: hrSyncConfig().enabled };
}

const UPLOAD_KIND = {
  document: { key: "idDocument", title: "Documento d'identità" },
  cv: { key: "cvUpload", title: "CV" },
};

/** Un file dal modulo → allegato del task ClickUp. In app solo il riferimento. */
export async function uploadFormFile(token, { kind, bytes, declaredType }) {
  const spec = UPLOAD_KIND[kind];
  if (!spec) return { ok: false, status: 400, error: "Tipo di documento non previsto." };
  const rec = await getFormRec(token);
  const state = formTokenState(rec, Date.now());
  if (state !== "submitted") return { ok: false, status: state === "open" ? 409 : 410, error: state === "open" ? "Prima invia il modulo, poi i file." : "Il tempo per caricare i file è scaduto." };
  if ((rec.uploads || 0) >= 4) return { ok: false, status: 429, error: "Hai già caricato il numero massimo di file." };
  if (!bytes?.length) return { ok: false, status: 400, error: "File vuoto." };
  if (bytes.length > UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: "File troppo grande (massimo 10 MB)." };
  const sniff = sniffFileType(bytes);
  if (!sniff) return { ok: false, status: 415, error: "Formato non ammesso: solo PDF, JPG o PNG." };
  if (declaredType && !["application/pdf", "image/jpeg", "image/png"].includes(declaredType)) return { ok: false, status: 415, error: "Formato non ammesso: solo PDF, JPG o PNG." };
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, status: 503, error: "Il caricamento dei documenti non è attivo in questo momento." };
  let person = await getPerson(rec.personId);
  if (!person) return { ok: false, status: 404, error: "Scheda non trovata." };
  if (!person.clickupTaskId) {
    const r = await pushPersonSafe(person, null, { actor: "modulo" });
    person = r.person;
    if (!person.clickupTaskId) return { ok: false, status: 502, error: "Non riesco a preparare la cartella per i documenti. Riprova tra poco." };
  }
  const safeName = (fullName(person.fields) || "persona").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]+/g, "").trim().slice(0, 60);
  const filename = `${spec.title.replace(/'/g, "")} - ${safeName}.${sniff.ext}`;
  let res;
  try {
    res = await uploadAttachment(person.clickupTaskId, { filename, bytes, contentType: sniff.type });
  } catch (e) {
    return { ok: false, status: 502, error: "Caricamento non riuscito. Riprova tra poco." };
  }
  const now = Date.now();
  await kv.set(K.form(token), { ...rec, uploads: (rec.uploads || 0) + 1 }, { ex: 3600 });
  const ref = { title: filename, attachmentId: String(res?.id || ""), at: now, via: "modulo" };
  const prev = person.fields?.[spec.key];
  person = {
    ...person,
    fields: { ...person.fields, [spec.key]: ref },
    fieldUpdatedAt: { ...person.fieldUpdatedAt, [spec.key]: now },
    updatedAt: now,
  };
  await putPerson(person);
  await appendLog(person.id, [{ at: now, by: "modulo", source: "modulo", action: "upload", field: spec.key, from: logValue(spec.key, prev), to: filename }]);
  // aggiorna il blocco in descrizione ("Documento d'identità: allegato il …")
  if (kind === "document") await pushPersonSafe(person, [spec.key], { actor: "modulo" });
  return { ok: true, title: filename };
}

// ── Stato della sincronizzazione (pagina /admin/hr/sync) ─────────────────────
export async function getSyncStatus() {
  const cfg = hrSyncConfig();
  const [webhook, lastImport, conflictsRaw, people] = await Promise.all([
    getWebhookRecord(), kv.get(K.lastImport), kv.lrange(K.conflicts, 0, 49), listPeople(),
  ]);
  let list = null;
  let fields = null;
  let listError = null;
  if (cfg.enabled) {
    try {
      const [info, meta] = await Promise.all([getListInfo(cfg.listId), getListFields(cfg.listId)]);
      list = { name: info.name, statuses: info.statuses.map((s) => s.status) };
      const byName = fieldsByName(meta);
      fields = expectedFieldNames().map((f) => ({ ...f, present: byName.has(f.name.toLowerCase()), type: byName.get(f.name.toLowerCase())?.type || null }));
    } catch (e) {
      listError = e?.message || "errore";
    }
  }
  const conflicts = (conflictsRaw || []).map((r) => (typeof r === "string" ? safeJson(r) : r)).filter(Boolean);
  const bySync = {};
  for (const p of people) { const st = p.sync?.status || "pending"; bySync[st] = (bySync[st] || 0) + 1; }
  let webhookPub = null;
  if (webhook) { const { secret: _s, ...rest } = webhook; webhookPub = { ...rest, sameList: webhook.listId === cfg.listId }; }
  return {
    config: { listId: cfg.listId, token: cfg.token, enabled: cfg.enabled, isRealList: cfg.isRealList },
    crypto: hrCryptoConfigured(),
    webhook: webhookPub,
    lastImport: lastImport || null,
    conflicts,
    list, fields, listError,
    people: { total: people.length, bySync, pending: people.filter((p) => (p.pendingKeys || []).length).length },
  };
}

export { computeCleanup, valuesEqual };
