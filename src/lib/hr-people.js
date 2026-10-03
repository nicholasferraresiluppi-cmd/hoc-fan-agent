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
 *   hr:form:{token}         link del modulo pubblico: personale (monouso, 14 giorni),
 *                           condiviso (`shared: true`, senza scadenza) o figlio del
 *                           condiviso (`child: true`, solo per i file, 1 ora)
 *   hr:form:shared          token dell'UNICO link condiviso attivo (03/10/2026)
 *   hr:webhook              { id, secret, endpoint, … } del webhook registrato
 *   hr:import:last          esito dell'ultimo import/riconciliazione
 *   hr:conflicts            LIST degli ultimi conflitti (cap 200)
 *   hr:clickup:delete-queue SET dei task ClickUp da mettere nel cestino (Elimina in app
 *                           con ClickUp che non rispondeva): ritentati di notte
 *   hr:purge:log            LIST delle schede eliminate per sempre: solo id/chi/quando/perché (cap 200)
 *
 * Regole:
 *  - salvare in app non fallisce MAI per colpa di ClickUp: la sync è best-effort,
 *    l'esito resta sulla scheda (`sync`) e i campi non spinti in `pendingKeys`
 *    (la riconciliazione notturna li riprova e NON li sovrascrive da ClickUp).
 *  - conflitto = vince l'ultima modifica per campo (resolveFieldConflicts).
 *  - archivio (03/10/2026, approvato dal titolare): un task cancellato su ClickUp
 *    (webhook o riconciliazione) e il pulsante "Elimina" in app mettono la scheda
 *    tra le ARCHIVIATE: non si sincronizza più (nessun task ricreato), non conta in
 *    doppioni e statistiche, si ripristina o si elimina per sempre dall'elenco
 *    "Archiviate"; dopo 30 giorni la riconciliazione notturna la cancella davvero.
 *    Doppioni e schede spazzatura invece si segnalano e basta.
 *  - campi specchio (03/10/2026): a due vie, letti dal testo ClickUp (hr-mirror.js).
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  FIELDS, FIELD_BY_KEY, FORM_KEYS, EDITABLE_KEYS, FORM_TTL_DAYS, PRIVACY_VERSION, UPLOAD_MAX_BYTES,
  normalizePersonInput, applyChanges, resolveFieldConflicts, filterEchoes, recordEcho, computeCleanup,
  valuesEqual, maskCf, logValue, formTokenState, sniffFileType, fullName, valueHash, dropUnchangedSinceBase,
  FORM_UPLOAD_GRACE_MS, isOwnEcho, isEmptyValue, archiveExpiresAt, isArchiveExpired, ARCHIVE_RETENTION_DAYS,
} from "./hr-people-core.js";
import { taskToPerson, personToClickup, createTaskPayload, incomingTimestamps, expectedFieldNames, fieldsByName } from "./hr-clickup-map.js";
import { mirrorIssueText, mirrorText, mirrorPrint } from "./hr-mirror.js";
import { clickupSkillLabels } from "./hr-skills.js";
import {
  hrSyncConfig, getListFields, getListInfo, listAllTasks, getTask, createTask, updateTask, setField, removeField,
  uploadAttachment, resolveTeamId, createWebhook, deleteWebhook, deleteTask, isTaskGone, ClickupError,
} from "./clickup-hr-api.js";
import { hrCryptoConfigured, encryptHr, decryptHr } from "./hr-crypto.js";
import { checkRateLimit } from "./rate-limit.js";

const K = {
  person: (id) => `hr:person:${id}`,
  log: (id) => `hr:person:${id}:log`,
  index: "hr:people:index",
  task: (tid) => `hr:task2person:${tid}`,
  echo: (tid) => `hr:echo:${tid}`,
  form: (t) => `hr:form:${t}`,
  sharedForm: "hr:form:shared",
  webhook: "hr:webhook",
  lastImport: "hr:import:last",
  conflicts: "hr:conflicts",
  lock: "hr:import:lock",
  deleteQueue: "hr:clickup:delete-queue",
  purgeLog: "hr:purge:log",
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

/**
 * Schede in KV. `archived`: "exclude" (default: l'elenco normale, statistiche,
 * doppioni) · "only" (vista Archiviate) · "include" (tutte, per la riconciliazione).
 */
export async function listPeople({ archived = "exclude" } = {}) {
  const ids = (await kv.smembers(K.index)) || [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const recs = chunk.length ? await kv.mget(...chunk.map(K.person)) : [];
    out.push(...recs.filter(Boolean));
  }
  if (archived === "include") return out;
  return out.filter((p) => (archived === "only" ? Boolean(p.archived) : !p.archived));
}

// ── Elenco ISTAT dei comuni (lato server, per leggere i campi specchio) ─────────
// Letto con fs da public/data/comuni-istat.json (mai importato: finirebbe nel
// bundle) e tenuto in memoria per la vita della funzione. Se manca → null: i
// luoghi scritti su ClickUp non si riconoscono e vale il valore di HOC Pro.
let comuniCache = null;
let comuniPromise = null;
export async function loadComuni() {
  if (comuniCache) return comuniCache;
  if (!comuniPromise) {
    comuniPromise = readFile(path.join(process.cwd(), "public", "data", "comuni-istat.json"), "utf8")
      .then((txt) => { const list = JSON.parse(txt); comuniCache = Array.isArray(list) ? list : null; return comuniCache; })
      .catch(() => { comuniPromise = null; return null; });
  }
  return comuniPromise;
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
  if (p.archived) out.archiveExpiresAt = archiveExpiresAt(p);
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
  // un'archiviata non si modifica dalla scheda (prima si ripristina); dal modulo si salva ma non si sincronizza
  if (person?.archived && source === "app") return { ok: false, status: 409, errors: ["Scheda archiviata: ripristinala per modificarla."] };
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
  if (sync && !person.archived) {
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
  // archiviata: non si sincronizza (e soprattutto non si ricrea il task)
  if (person?.archived) return { status: "archived", person, errors: [], skipped: [], message: "Scheda archiviata: non si sincronizza con ClickUp." };
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
      if (task?.deleted === true) throw Object.assign(new Error("task nel cestino"), { status: 404 });
    } catch (e) {
      if (!isTaskGone(e)) throw e;
      // task cancellato su ClickUp (03/10/2026): la scheda va in archivio, il task NON si ricrea
      const archived = await archiveRecord(person, {
        by: "sistema", source: "sistema", taskId: person.clickupTaskId, taskGone: true,
        reason: "Il task collegato non esiste più su ClickUp",
      });
      return { status: "archived", person: archived, errors: [], skipped: [], message: archived.sync.message };
    }
  }
  // campi specchio che su ClickUp hanno un testo non riconosciuto: al primo push si riscrive il testo dell'app
  const stale = (person.mirrorStale || []).filter((k) => FIELD_BY_KEY[k]?.mirror);
  const pushKeys = task && keys ? [...new Set([...keys, ...stale])] : null;
  const plan = personToClickup(person, fieldsMeta, {
    keys: pushKeys, cfPlain, statuses: info.statuses, currentDescription: task?.description || "",
  });
  const at = Date.now();
  const errors = [];
  let p = { ...person };
  // Eco registrata PRIMA di scrivere (il webhook può arrivare mentre scriviamo),
  // coi valori che ClickUp terrà DAVVERO (etichette sconosciute già tolte)
  const pushedValues = {};
  const pushedPrints = {}; // campi specchio: impronta del TESTO scritto (non dell'oggetto)
  for (const op of plan.fieldOps) { pushedValues[op.key] = op.effective; if (op.print) pushedPrints[op.key] = op.print; }
  for (const k of plan.blockKeys) pushedValues[k] = p.fields?.[k] ?? null;
  if (!task) {
    const created = await createTask(cfg.listId, createTaskPayload(plan));
    p.clickupTaskId = String(created.id);
    p.clickupUrl = created.url || `https://app.clickup.com/t/${created.id}`;
    await kv.set(K.echo(p.clickupTaskId), recordEcho({}, pushedValues, at, pushedPrints), { ex: 60 });
  } else {
    const echo = (await kv.get(K.echo(task.id)).catch(() => null)) || {};
    await kv.set(K.echo(task.id), recordEcho(echo, pushedValues, at, pushedPrints), { ex: 60 });
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
  const done = new Set(task ? (pushKeys || FIELDS.map((f) => f.key)) : FIELDS.map((f) => f.key));
  p.pendingKeys = (p.pendingKeys || []).filter((k) => !done.has(k) || failed.has(k));
  // base = ciò che ora c'è su ClickUp per i campi scritti (mai il CF: niente impronta del dato sensibile)
  const cuBase = { ...(p.cuBase || {}) };
  for (const [k, v] of Object.entries(pushedValues)) if (k !== "codiceFiscale" && !failed.has(k)) cuBase[k] = pushedPrints[k] ?? valueHash(v);
  p.cuBase = cuBase;
  // testo riscritto (o campo dedicato assente sulla lista): resta "da riscrivere" solo ciò che è fallito
  if ((p.mirrorStale || []).length) p.mirrorStale = p.mirrorStale.filter((k) => failed.has(k));
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
 *
 * Campi specchio (03/10/2026) — perché eco e base si confrontano sul TESTO:
 * il valore dell'app è spesso più ricco del testo che ne scriviamo (il comune ha
 * codice e regione, "Altro che sa fare" perde gli a capo, il CAP si taglia a 20,
 * le chiavi vecchie delle competenze si riscrivono col nome nuovo). Confrontando
 * l'oggetto riletto dal NOSTRO testo con quello dell'app si vedrebbero differenze
 * che nessuno ha fatto, e l'eco finirebbe per cancellare dati veri. Un testo che
 * non si riesce a leggere, poi, non ha proprio un oggetto, ma ha comunque bisogno
 * di una base, altrimenti ogni notte ricomparirebbe come "modifica nuova". Quindi:
 * impronta del testo normalizzato (mirrorPrint) sia nell'eco sia in cuBase; il
 * testo si interpreta SOLO quando è davvero cambiato rispetto a ciò che abbiamo
 * scritto o visto l'ultima volta.
 *
 * @param opts.comuni elenco ISTAT (default: letto dal server; null = non disponibile)
 * @returns {{ kind: "created"|"updated"|"unchanged"|"ignored", personId, pushBack: string[] }}
 */
export async function ingestTask(task, { incomingAt, by = "clickup", useEcho = false, allowPushBack = true, onlyKeys = null, now = Date.now(), comuni } = {}) {
  const list = comuni !== undefined ? comuni : await loadComuni();
  const m = taskToPerson(task, { comuni: list });
  const { codiceFiscale: cfIncomingRaw, ...incomingAll } = m.fields;
  // webhook: si guardano SOLO i campi che l'evento dice cambiati
  const inScope = (k) => !onlyKeys || onlyKeys.includes(k);
  const cfIncoming = inScope("codiceFiscale") ? cfIncomingRaw : undefined;
  const canCf = hrCryptoConfigured();
  const at = now;
  const readOnlyKeys = FIELDS.filter((f) => f.readOnly && f.cu).map((f) => f.key);
  const incoming = {};
  const incomingRo = {};
  for (const [k, v] of Object.entries(incomingAll)) {
    if (readOnlyKeys.includes(k)) incomingRo[k] = v;
    else if (inScope(k)) incoming[k] = v;
  }
  // campi specchio: impronta del testo (anche di quelli che non si sono potuti leggere)
  const mirrors = m.mirrors || {};
  const prints = Object.fromEntries(Object.entries(mirrors).map(([k, x]) => [k, x.print]));
  // nuova base = valori ClickUp visti ora (tutti, anche quelli fuori dall'evento)
  const nextBase = Object.fromEntries(Object.entries(incomingAll).filter(([k]) => !readOnlyKeys.includes(k)).map(([k, v]) => [k, prints[k] ?? valueHash(v)]));
  Object.assign(nextBase, prints);

  let personId = (await kv.get(K.task(m.clickupTaskId))) || null;
  if (!personId && m.hocPersonId) {
    const byBlock = await getPerson(m.hocPersonId);
    // stesso id HOC su un task diverso = task duplicato su ClickUp → scheda nuova
    // (un'archiviata invece si riconosce sempre: mai una scheda nuova dal suo task)
    if (byBlock && (byBlock.archived || !byBlock.clickupTaskId || byBlock.clickupTaskId === m.clickupTaskId)) personId = byBlock.id;
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
    // testo specchio illeggibile su una scheda nuova: il campo resta vuoto in app (il testo resta su ClickUp), lo si dice nello storico
    for (const [k, x] of Object.entries(mirrors)) {
      if (!x.ok && inScope(k)) log.push({ at, by: "sistema", source: "sistema", action: "mirror_unrecognized", field: k, from: null, to: mirrorIssueText(x.text, x).replace("tenuto il valore di HOC Pro", "campo lasciato vuoto in HOC Pro") });
    }
    await putPerson(person);
    await appendLog(person.id, log);
    return { kind: "created", personId: person.id, pushBack: [] };
  }

  let person = await getPerson(personId);
  if (!person) return { kind: "unchanged", personId, pushBack: [] };
  // archiviata: non riceve più niente da ClickUp (il suo task è cancellato o in attesa di cancellazione)
  if (person.archived) return { kind: "ignored", personId, pushBack: [] };
  const cfPrev = readCf(person);
  const current = { fields: { ...person.fields }, fieldUpdatedAt: person.fieldUpdatedAt || {} };
  const inc = { ...incoming };
  if (cfIncoming !== undefined && canCf && cfPrev !== undefined) { inc.codiceFiscale = cfIncoming || null; current.fields.codiceFiscale = cfPrev; }

  // campi che su ClickUp non sono cambiati dall'ultima sincronizzazione: non toccano l'app
  const base = person.cuBase || {};
  let { incoming: fresh } = dropUnchangedSinceBase(inc, base, prints);
  let echoes = [];
  let echo = {};
  if (useEcho) {
    echo = (await kv.get(K.echo(m.clickupTaskId)).catch(() => null)) || {};
    ({ incoming: fresh, echoes } = filterEchoes(current.fields, fresh, echo, at, undefined, prints));
  }
  // campi con scrittura verso ClickUp ancora in sospeso: l'app resta la fonte
  const pending = new Set(person.pendingKeys || []);
  for (const k of Object.keys(fresh)) if (pending.has(k)) delete fresh[k];

  // campi specchio: testo cambiato ma non leggibile → si tiene l'app, lo si scrive nello storico
  // e al push successivo si riscrive il testo dell'app (mirrorStale)
  const log = [];
  const stale = new Set(person.mirrorStale || []);
  for (const [k, x] of Object.entries(mirrors)) {
    if (!inScope(k) || pending.has(k)) continue;
    const changed = base[k] !== x.print && !(useEcho && isOwnEcho(echo, k, null, at, undefined, x.print));
    if (!changed) continue;
    // il testo su ClickUp è proprio quello che l'app scriverebbe adesso → niente da fare
    // (copre anche le basi vecchie, impronte dell'oggetto scritte prima del 03/10)
    if (mirrorPrint(mirrorText(k, current.fields)) === x.print) { delete fresh[k]; stale.delete(k); continue; }
    if (!x.ok) {
      log.push({ at, by, source: "clickup", action: "mirror_unrecognized", field: k, from: logValue(k, current.fields[k]), to: mirrorIssueText(x.text, x) });
      stale.add(k);
      continue;
    }
    stale.delete(k); // testo di nuovo leggibile
    // campo dedicato mai scritto né visto (base assente) e vuoto su ClickUp: non svuota l'app, ci si scrive il testo dell'app
    if (base[k] === undefined && k in fresh && isEmptyValue(fresh[k]) && !isEmptyValue(current.fields[k])) { delete fresh[k]; stale.add(k); }
  }
  const { apply, keepApp } = resolveFieldConflicts(current, fresh, incomingAt ?? m.dateUpdated ?? at);

  const { codiceFiscale: cfApply, ...applyRest } = apply;
  // competenze cambiate da ClickUp: le etichette "Skills" seguono, come quando si salva in app
  const derivedPush = [];
  if ("skillLevels" in applyRest && !("skills" in fresh)) {
    const labels = clickupSkillLabels(applyRest.skillLevels);
    if (!valuesEqual(current.fields.skills, labels)) { applyRest.skills = labels; derivedPush.push("skills"); }
  }
  const r = applyChanges(person, { ...applyRest, ...incomingRo }, { at, by, source: "clickup" });
  person = r.person;
  log.unshift(...r.log);
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
  person.mirrorStale = [...stale];
  const changedAny = r.changed.length || "codiceFiscale" in apply;
  await putPerson(person);
  if (log.length) await appendLog(person.id, log);
  if (conflicts.length) {
    await kv.lpush(K.conflicts, ...conflicts.map((c) => JSON.stringify(c)));
    await kv.ltrim(K.conflicts, 0, 199);
  }
  const pushBack = [...new Set([...keepApp, ...derivedPush])];
  if (pushBack.length && allowPushBack) await pushPersonSafe(person, pushBack, { actor: "sistema" });
  else if (pushBack.length) {
    person.pendingKeys = [...new Set([...(person.pendingKeys || []), ...pushBack])];
    await kv.set(K.person(person.id), person);
  }
  return { kind: changedAny ? "updated" : "unchanged", personId: person.id, pushBack };
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
  const stats = { mode, at: start, by, tasks: 0, created: 0, updated: 0, unchanged: 0, ignored: 0, pushedBack: 0, createdOnClickup: 0, missingOnClickup: 0, archived: 0, trashed: 0, deferred: 0, errors: [] };
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
    // Schede in app: task spariti dalla lista, persone mai portate su ClickUp, push in sospeso.
    // Le archiviate non si sincronizzano (e non fanno ricreare il task).
    const people = await listPeople();
    for (const p of people) {
      // schede "task cancellato" di prima del 03/10 (regola vecchia: si ricreava il task) → archivio, come vuole la regola nuova
      if (!p.clickupTaskId && p.sync?.status === "deleted") {
        await archiveRecord(p, { by: "riconciliazione notturna", source: "sistema", reason: "Task cancellato su ClickUp (prima dell'archivio)", taskId: null });
        stats.archived += 1;
        continue;
      }
      if (p.clickupTaskId && !seen.has(String(p.clickupTaskId))) {
        // fuori dalla lista: cancellato (→ archivio) o spostato/archiviato su ClickUp (→ solo segnalato)?
        if (Date.now() >= deadline) { stats.deferred += 1; continue; }
        let gone = false;
        try {
          const t = await getTask(p.clickupTaskId);
          gone = t?.deleted === true;
        } catch (e) {
          if (isTaskGone(e)) gone = true;
          else { stats.errors.push({ taskId: String(p.clickupTaskId), error: e?.message || "errore" }); continue; }
        }
        if (gone) {
          await archiveRecord(p, { by: "riconciliazione notturna", source: "sistema", taskId: p.clickupTaskId, taskGone: true, reason: "Il task collegato non esiste più su ClickUp" });
          stats.archived += 1;
          continue;
        }
        stats.missingOnClickup += 1;
        if (p.sync?.status !== "missing") {
          await kv.set(K.person(p.id), { ...p, sync: { status: "missing", at: Date.now(), message: "Il task non è più nella lista ClickUp configurata." } });
        }
        continue;
      }
      const needsCreate = !p.clickupTaskId;
      const needsPush = (p.pendingKeys || []).length > 0 || (p.mirrorStale || []).length > 0;
      if (!needsCreate && !needsPush) continue;
      if (Date.now() >= deadline) { stats.deferred += 1; continue; }
      const r = await pushPersonSafe(p, needsCreate ? null : (p.pendingKeys || []), { actor: "sistema" });
      if (needsCreate && r.person?.clickupTaskId) stats.createdOnClickup += 1;
    }
    // task da mettere nel cestino rimasti in coda ("Elimina" con ClickUp che non rispondeva)
    const r = await drainDeleteQueue({ deadline });
    stats.trashed = r.trashed;
    stats.deferred += r.deferred;
    stats.errors.push(...r.errors);
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

// ── Archivio: cancellazioni sincronizzate (03/10/2026, approvato dal titolare) ──
// Stato `archived` = { at, by, source, reason, taskId, taskDeletedAt?, pendingTaskDelete? }.
// Un'archiviata: fuori dall'elenco normale, dai doppioni e dalle statistiche; non
// si sincronizza (pushPersonSafe non fa nulla) e non riceve dati dai webhook del
// suo vecchio task (ingestTask la ignora). Si ripristina o si elimina per sempre;
// dopo ARCHIVE_RETENTION_DAYS la riconciliazione notturna la cancella davvero.

/**
 * Mette la scheda in archivio (interno: chiamato dal webhook, dalla riconciliazione,
 * dal push che trova il task sparito e da "Elimina").
 * @param opts.taskGone true = il task su ClickUp non c'è già più (niente da cancellare)
 */
async function archiveRecord(person, { by, source, reason, taskId = null, taskGone = false, at = Date.now() }) {
  const tid = taskId ? String(taskId) : null;
  const archived = { at, by: by || null, source, reason, taskId: tid };
  if (tid && taskGone) archived.taskDeletedAt = at;
  const message = source === "app" ? "Scheda archiviata (eliminata in HOC Pro): non si sincronizza più con ClickUp." : "Scheda archiviata: il task su ClickUp è stato cancellato. Non si sincronizza più.";
  const p = { ...person, archived, clickupTaskId: null, pendingKeys: [], mirrorStale: [], sync: { status: "archived", at, message } };
  await kv.set(K.person(p.id), p);
  // il collegamento task → scheda resta finché il task esiste (così i suoi webhook vengono riconosciuti e ignorati)
  if (tid && taskGone) await kv.del(K.task(tid)).catch(() => {});
  await appendLog(p.id, [{ at, by: by || "sistema", source, action: "archived", field: null, to: `${reason}${tid ? ` (task ${tid})` : ""}. Scheda tra le archiviate: si cancella per sempre tra ${ARCHIVE_RETENTION_DAYS} giorni.` }]);
  return p;
}

/** Cestino ClickUp per un task: { ok } | { ok:false, error }. Un task che non c'è più vale come cestinato. */
async function trashTask(taskId) {
  try {
    await deleteTask(taskId);
    return { ok: true };
  } catch (e) {
    if (isTaskGone(e)) return { ok: true, alreadyGone: true };
    return { ok: false, error: e?.message || "errore" };
  }
}

async function markTaskTrashed(personId, taskId, { at, by, source, note }) {
  await kv.srem(K.deleteQueue, String(taskId)).catch(() => {});
  if ((await kv.get(K.task(taskId))) === personId) await kv.del(K.task(taskId)).catch(() => {});
  const p = await getPerson(personId);
  if (!p?.archived || String(p.archived.taskId || "") !== String(taskId)) return;
  const { pendingTaskDelete: _p, ...rest } = p.archived;
  await kv.set(K.person(p.id), { ...p, archived: { ...rest, taskDeletedAt: at } });
  await appendLog(p.id, [{ at, by, source, action: "task_trashed", field: null, to: note }]);
}

/**
 * "Elimina" dalla scheda: archivio + task ClickUp nel cestino (recuperabile 30
 * giorni su ClickUp). Se ClickUp non risponde la scheda va comunque in archivio
 * e la cancellazione resta in coda per la riconciliazione notturna.
 */
export async function archivePerson(id, actor) {
  const person = await getPerson(id);
  if (!person) return { ok: false, status: 404, error: "Persona non trovata." };
  if (person.archived) return { ok: true, already: true, person };
  const at = Date.now();
  const taskId = person.clickupTaskId ? String(person.clickupTaskId) : null;
  let p = await archiveRecord(person, { by: actor, source: "app", reason: "Eliminata in HOC Pro", taskId, at });
  if (!taskId) return { ok: true, person: p, task: "none" };
  const cfg = hrSyncConfig();
  const res = cfg.enabled ? await trashTask(taskId) : { ok: false, error: "sincronizzazione spenta" };
  if (res.ok) {
    await markTaskTrashed(p.id, taskId, { at: Date.now(), by: actor, source: "app", note: res.alreadyGone ? `il task ${taskId} su ClickUp non c'era già più` : `task ${taskId} messo nel cestino di ClickUp (recuperabile per 30 giorni da ClickUp)` });
    return { ok: true, person: await getPerson(p.id), task: "trashed" };
  }
  await kv.sadd(K.deleteQueue, taskId);
  p = { ...p, archived: { ...p.archived, pendingTaskDelete: taskId } };
  await kv.set(K.person(p.id), p);
  await appendLog(p.id, [{ at: Date.now(), by: "sistema", source: "sistema", action: "task_delete_queued", field: null, to: `ClickUp non ha risposto (${String(res.error).slice(0, 160)}): il task ${taskId} verrà messo nel cestino dalla riconciliazione notturna` }]);
  return { ok: true, person: p, task: "queued", error: res.error };
}

/** Riprova le cancellazioni in coda (riconciliazione notturna). */
async function drainDeleteQueue({ deadline }) {
  const out = { trashed: 0, deferred: 0, errors: [] };
  const queue = ((await kv.smembers(K.deleteQueue)) || []).map(String);
  for (const taskId of queue) {
    if (Date.now() >= deadline) { out.deferred += 1; continue; }
    const pid = await kv.get(K.task(taskId));
    const p = pid ? await getPerson(pid) : null;
    // ripristinata nel frattempo (ha ripreso questo task): non si cancella più
    if (p && !p.archived) { await kv.srem(K.deleteQueue, taskId); continue; }
    const res = await trashTask(taskId);
    if (!res.ok) { out.errors.push({ taskId, error: res.error }); continue; }
    out.trashed += 1;
    if (p) await markTaskTrashed(p.id, taskId, { at: Date.now(), by: "riconciliazione notturna", source: "sistema", note: `task ${taskId} messo nel cestino di ClickUp (era in coda)` });
    else { await kv.srem(K.deleteQueue, taskId); await kv.del(K.task(taskId)).catch(() => {}); }
  }
  return out;
}

/**
 * "Ripristina": la scheda torna attiva. Se il suo task non era ancora stato
 * cancellato lo riprende; altrimenti alla prima sincronizzazione ne crea uno
 * NUOVO (quello nel cestino di ClickUp non si recupera da qui).
 */
export async function restorePerson(id, actor) {
  const person = await getPerson(id);
  if (!person) return { ok: false, status: 404, error: "Persona non trovata." };
  if (!person.archived) return { ok: false, status: 409, error: "La scheda non è archiviata." };
  const at = Date.now();
  const { archived, ...rest } = person;
  const keepTask = archived.pendingTaskDelete && !archived.taskDeletedAt ? String(archived.pendingTaskDelete) : null;
  if (keepTask) await kv.srem(K.deleteQueue, keepTask);
  let p = {
    ...rest, updatedAt: at, restoredAt: at,
    clickupTaskId: keepTask, cuBase: keepTask ? person.cuBase || {} : {}, pendingKeys: [], mirrorStale: [],
    sync: { status: "pending", at, message: keepTask ? "Ripristinata: si riallinea il task ClickUp di prima." : "Ripristinata: alla prima sincronizzazione si crea un task nuovo su ClickUp." },
  };
  await putPerson(p);
  await appendLog(p.id, [{ at, by: actor, source: "app", action: "restored", field: null, to: keepTask ? `scheda ripristinata, di nuovo collegata al task ${keepTask}` : "scheda ripristinata: su ClickUp si crea un task nuovo (quello nel cestino di ClickUp non viene recuperato)" }]);
  const sync = await pushPersonSafe(p, null, { actor });
  p = sync.person || p;
  return { ok: true, person: p, sync: { status: sync.status, message: sync.message } };
}

/** Cancella per sempre una scheda ARCHIVIATA e il suo storico. */
export async function purgePerson(id, { actor, reason = "eliminata definitivamente" } = {}) {
  const person = await getPerson(id);
  if (!person) return { ok: false, status: 404, error: "Persona non trovata." };
  if (!person.archived) return { ok: false, status: 409, error: "Si eliminano per sempre solo le schede archiviate." };
  const tid = person.archived.taskId;
  // la coda di cancellazione del task NON si tocca: se il task era ancora da cestinare, lo farà la riconciliazione
  if (tid && (await kv.get(K.task(tid))) === id && !(person.archived.pendingTaskDelete)) await kv.del(K.task(tid)).catch(() => {});
  await kv.del(K.person(id));
  await kv.del(K.log(id));
  await kv.srem(K.index, id);
  // traccia minima della cancellazione (nessun dato della persona: solo id, chi, quando, perché)
  const entry = { id, at: Date.now(), by: actor || null, reason };
  await kv.lpush(K.purgeLog, JSON.stringify(entry));
  await kv.ltrim(K.purgeLog, 0, 199);
  return { ok: true, ...entry };
}

/** Pulizia automatica: archiviate da più di ARCHIVE_RETENTION_DAYS giorni (dal cron notturno). */
export async function purgeExpiredArchived({ budgetMs = 5_000, now = Date.now() } = {}) {
  const deadline = Date.now() + budgetMs;
  const out = { purged: 0, deferred: 0 };
  for (const p of await listPeople({ archived: "only" })) {
    if (!isArchiveExpired(p, now)) continue;
    if (Date.now() >= deadline) { out.deferred += 1; continue; }
    const r = await purgePerson(p.id, { actor: "pulizia automatica", reason: `archiviata da più di ${ARCHIVE_RETENTION_DAYS} giorni` });
    if (r.ok) out.purged += 1;
  }
  return out;
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
    // 03/10/2026: task cancellato su ClickUp = scheda in ARCHIVIO (non si ricrea più il task)
    const pid = await kv.get(K.task(taskId));
    if (!pid) return { ignored: "task non collegato" };
    const p = await getPerson(pid);
    if (!p) { await kv.del(K.task(taskId)); return { ignored: "scheda non trovata" }; }
    if (p.archived) {
      // già archiviata (di solito: "Elimina" in app che ha appena cestinato il task) → conferma
      await markTaskTrashed(p.id, taskId, { at, by, source: "clickup", note: `ClickUp conferma: task ${taskId} cancellato` });
      return { ok: true, event, personId: pid, already: true };
    }
    if (String(p.clickupTaskId || "") !== taskId) { await kv.del(K.task(taskId)); return { ignored: "collegamento vecchio" }; }
    await archiveRecord(p, { by, source: "clickup", reason: "Task cancellato su ClickUp", taskId, taskGone: true, at });
    return { ok: true, event, personId: pid, archived: true };
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

const validTokenShape = (token) => typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token);

async function getFormRec(token) {
  if (!validTokenShape(token)) return null;
  const rec = (await kv.get(K.form(token))) || null;
  // il link condiviso vale solo se è ANCORA quello puntato da hr:form:shared
  // (difesa se una rigenerazione si è fermata a metà: mai due link condivisi attivi)
  if (rec?.shared && !rec.disabledAt && (await kv.get(K.sharedForm)) !== token) return { ...rec, disabledAt: rec.createdAt || 1 };
  return rec;
}

// ── Link condiviso (03/10/2026) ──────────────────────────────────────────────
// Decisione del titolare: UN solo link per il modulo, uguale per tutti. Niente
// scadenza: vale finché un admin non lo disattiva o lo rigenera (il vecchio
// smette subito di funzionare). Mai dati precompilati: chiunque abbia il link
// lo apre. Ogni invio crea una scheda NUOVA (mai abbinata in automatico per
// email/telefono: chiunque potrebbe scrivere l'email di un altro e sovrascriverne
// i dati); i doppioni li segnala la vista "Da ripulire".

const sharedPath = (token) => `/hr/modulo/${token}`;

/** Il link condiviso attivo, o null. */
export async function getSharedFormLink() {
  const token = await kv.get(K.sharedForm);
  if (!validTokenShape(token)) return null;
  const rec = await kv.get(K.form(token));
  if (!rec?.shared || rec.disabledAt) return null;
  return { token, path: sharedPath(token), createdAt: rec.createdAt, createdBy: rec.createdBy || null };
}

/** È il token del link condiviso attivo? (per scegliere i tetti di richieste nella route) */
export async function isSharedFormToken(token) {
  if (!validTokenShape(token)) return false;
  return (await kv.get(K.sharedForm)) === token;
}

// il vecchio record resta 30 giorni marcato "disattivato": chi apre il vecchio link legge un messaggio chiaro
async function retireSharedToken(token, actor, now) {
  if (!validTokenShape(token)) return;
  const old = await kv.get(K.form(token));
  if (old) await kv.set(K.form(token), { ...old, disabledAt: now, disabledBy: actor || null }, { ex: 30 * 24 * 3600 });
}

/** Crea (o rigenera) il link condiviso: il precedente smette di funzionare. */
export async function regenerateSharedFormLink({ actor }) {
  const now = Date.now();
  const prev = await kv.get(K.sharedForm);
  const token = randomBytes(24).toString("base64url");
  await kv.set(K.form(token), { token, shared: true, personId: null, createdAt: now, createdBy: actor || null, expiresAt: null });
  await kv.set(K.sharedForm, token);
  if (prev && prev !== token) await retireSharedToken(prev, actor, now);
  return { ok: true, token, path: sharedPath(token), createdAt: now, replaced: Boolean(prev) };
}

/** Disattiva il link condiviso (nessun link attivo finché non se ne crea uno nuovo). */
export async function disableSharedFormLink({ actor }) {
  const prev = await kv.get(K.sharedForm);
  if (!prev) return { ok: true, disabled: false };
  await retireSharedToken(prev, actor, Date.now());
  await kv.del(K.sharedForm);
  return { ok: true, disabled: true };
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
  if (state === "disabled") return { ok: false, status: 410, error: "Questo link non è più attivo. Chiedi a HR quello nuovo." };
  if (state === "expired") return { ok: false, status: 410, error: "Questo link è scaduto. Chiedi a HR un link nuovo." };
  if (state === "closed") return { ok: true, state, done: true };
  // token figlio (solo file): niente dati della scheda, nemmeno a chi l'ha appena inviata
  if (rec.child) return { ok: true, state, done: true };
  if (rec.shared) {
    // link uguale per tutti: MAI dati di persone (niente prefill, cfPresent sempre false)
    return {
      ok: true, state: "open", done: false, shared: true,
      uploadsEnabled: hrSyncConfig().enabled,
      cfEnabled: hrCryptoConfigured(),
      cfPresent: false,
      prefill: {},
      options: await formOptions(),
      privacyVersion: PRIVACY_VERSION,
      expiresAt: null,
      maxUploadBytes: UPLOAD_MAX_BYTES,
    };
  }
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
  if (state === "disabled") return { ok: false, status: 410, error: "Questo link non è più attivo. Chiedi a HR quello nuovo." };
  if (state === "expired") return { ok: false, status: 410, error: "Questo link è scaduto." };
  if (state !== "open") return { ok: false, status: 409, error: "Questo modulo è già stato inviato." };
  if (body?.consent !== true) return { ok: false, status: 400, error: "Serve il consenso all'informativa privacy." };
  if (rec.shared) return submitShared(token, rec, body, now);
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
  return { ok: true, cfNote: res.cfNote, uploadsEnabled: hrSyncConfig().enabled, uploadToken: token };
}

/**
 * Invio dal link condiviso: SEMPRE una scheda nuova (id null). Il link resta
 * aperto; per i file nasce un token figlio monouso legato solo a questa scheda
 * (già "inviato", 1 ora), che la pagina usa per il passo documenti.
 */
async function submitShared(token, rec, body, now) {
  // tetto giornaliero di invii sul link condiviso (oltre ai limiti per IP della route)
  const cap = await checkRateLimit("hr_form_shared_submit", token.slice(0, 64));
  if (!cap.ok) return { ok: false, status: 429, error: "Oggi il modulo ha ricevuto troppi invii. Riprova domani o scrivi a chi ti ha mandato il link." };
  const input = {};
  for (const k of FORM_KEYS) if (k in (body?.data || {})) input[k] = body.data[k];
  if (!String(input.codiceFiscale || "").trim()) delete input.codiceFiscale;
  const consent = { at: now, version: PRIVACY_VERSION, via: "modulo" };
  const res = await savePerson({
    id: null, input, allowed: FORM_KEYS, actor: "modulo", source: "modulo",
    extra: () => ({ consent, formLink: { shared: true, createdAt: rec.createdAt, expiresAt: null, submittedAt: now } }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.errors.join(" ") };
  await appendLog(res.person.id, [{ at: now, by: "modulo", source: "modulo", action: "consent", field: null, to: `consenso privacy (versione ${PRIVACY_VERSION}), dal link condiviso` }]);
  const child = randomBytes(24).toString("base64url");
  await kv.set(K.form(child), {
    token: child, child: true, personId: res.person.id, createdAt: now, createdBy: "modulo",
    expiresAt: now + FORM_UPLOAD_GRACE_MS, submittedAt: now, uploads: 0,
  }, { ex: Math.ceil(FORM_UPLOAD_GRACE_MS / 1000) + 60 });
  return { ok: true, cfNote: res.cfNote, uploadsEnabled: hrSyncConfig().enabled, uploadToken: child };
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
  // il link condiviso non porta a nessuna scheda: i file passano solo dal token figlio
  if (rec?.shared) return { ok: false, status: 403, error: "Con questo link i documenti si caricano subito dopo l'invio del modulo." };
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
  const [webhook, lastImport, conflictsRaw, all] = await Promise.all([
    getWebhookRecord(), kv.get(K.lastImport), kv.lrange(K.conflicts, 0, 49), listPeople({ archived: "include" }),
  ]);
  // le archiviate non contano nelle statistiche: solo il loro numero
  const archivedCount = all.filter((p) => p.archived).length;
  const people = all.filter((p) => !p.archived);
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
    people: { total: people.length, bySync, pending: people.filter((p) => (p.pendingKeys || []).length).length, archived: archivedCount },
  };
}

export { computeCleanup, valuesEqual };
