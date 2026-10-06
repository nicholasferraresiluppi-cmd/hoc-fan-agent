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
 *   hr:push:lock:{id}       un push verso ClickUp alla volta per scheda (03/10/2026)
 *   hr:sync:retry           SET di schede con scritture verso ClickUp da riprovare (ripresa in
 *                           background con after() e riconciliazione notturna)
 *   (documenti dal modulo: chiavi hr:upload:* in hr-uploads.js)
 *   (hr:clickup:delete-queue e hr:purge:log: chiavi del vecchio "Elimina" del 03/10 mattina,
 *    non più scritte; dalla coda si toglie solo il task di una scheda ripristinata)
 *
 * Regole:
 *  - salvare in app non fallisce MAI per colpa di ClickUp: la sync è best-effort,
 *    l'esito resta sulla scheda (`sync`) e i campi non spinti in `pendingKeys`
 *    (la riconciliazione notturna li riprova e NON li sovrascrive da ClickUp).
 *  - conflitto = vince l'ultima modifica per campo (resolveFieldConflicts).
 *  - da procedura non si elimina MAI una persona (decisione del titolare, 03/10/2026):
 *    chi va via resta nel CRM con la fase "Uscita" ("Segna come uscita" in scheda).
 *    Niente "Elimina", niente cancellazioni definitive, niente pulizia automatica.
 *  - archivio = solo rete di sicurezza: se un task viene cancellato su ClickUp (anche
 *    per errore; webhook o riconciliazione) la scheda va tra le ARCHIVIATE: non si
 *    sincronizza (nessun task ricreato), non conta in doppioni e statistiche, e si
 *    ripristina dall'elenco "Archiviate". Doppioni e schede spazzatura si segnalano e basta.
 *  - fase della persona (03/10/2026): tendina "Collaboration Status" E stato del task,
 *    allineati nei due sensi (tabella PERSON_PHASES in hr-fields.js). Uno stato del
 *    task estraneo alle 5 fasi (es. "to do") non tocca la fase.
 *  - campi specchio (03/10/2026): a due vie, letti dal testo ClickUp (hr-mirror.js).
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  FIELDS, FIELD_BY_KEY, FORM_KEYS, EDITABLE_KEYS, stripLangNo, FORM_TTL_DAYS, PRIVACY_VERSION, UPLOAD_MAX_BYTES,
  normalizePersonInput, applyChanges, resolveFieldConflicts, filterEchoes, recordEcho, computeCleanup,
  valuesEqual, maskCf, logValue, formTokenState, fullName, valueHash, dropUnchangedSinceBase,
  FORM_UPLOAD_GRACE_MS, isOwnEcho, isEmptyValue, normalizeChoiceFields, PHASE_ENTRY, PHASE_ACTIVE, PHASE_EXITED,
  isIsoDate,
} from "./hr-people-core.js";
import { taskToPerson, personToClickup, createTaskPayload, incomingTimestamps, expectedFieldNames, fieldsByName, msToIsoDate, statusForCollaboration, clickupDrift } from "./hr-clickup-map.js";
import { notifyWhatsApp } from "./whatsapp-notify.js";
import { mirrorIssueText, mirrorText, mirrorPrint } from "./hr-mirror.js";
import { clickupSkillLabels } from "./hr-skills.js";
import {
  hrSyncConfig, getListFields, getListInfo, getListMembers, listAllTasks, getTask, createTask, updateTask, setField, removeField,
  resolveTeamId, createWebhook, deleteWebhook, isTaskGone, ClickupError, HR_WEBHOOK_EVENTS, listWebhooks, getView, updateView,
} from "./clickup-hr-api.js";
import { hrCryptoConfigured, encryptHr, decryptHr } from "./hr-crypto.js";
import { checkRateLimit } from "./rate-limit.js";
import { missingRequired } from "./hr-form-experience.js";
import { blobConfigured } from "./hr-blob.js";

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
  legacyDeleteQueue: "hr:clickup:delete-queue", // solo per ripulirla al ripristino (non si scrive più)
  pushLock: (id) => `hr:push:lock:${id}`,        // un push alla volta per persona (03/10/2026)
  syncRetry: "hr:sync:retry",                    // SET di schede con scritture verso ClickUp da riprovare
};
/** Pseudo-chiave di eco/base per lo STATO del task (porta la fase, non è un campo). */
const STATUS_KEY = "_status";
const LOG_CAP = 500;
const DAY = 24 * 3600 * 1000;

export { hrSyncConfig };
/** Caricamento documenti attivo: serve la sync ClickUp (destinazione) e il Blob (transito). */
export const uploadsEnabled = () => hrSyncConfig().enabled && blobConfigured();
export const newPersonId = () => "p_" + randomBytes(8).toString("hex");

// ── Lettura / scrittura ─────────────────────────────────────────────────────
export async function getPerson(id) {
  if (!id || typeof id !== "string" || !/^p_[a-f0-9]{16}$/.test(id)) return null;
  return normalizeRecord((await kv.get(K.person(id))) || null);
}

/** Fase e contratto sempre col nome italiano (le schede di prima del 03/10 hanno l'opzione ClickUp). */
function normalizeRecord(p) {
  if (!p?.fields) return p;
  const fields = normalizeChoiceFields(p.fields);
  return fields === p.fields ? p : { ...p, fields };
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
    out.push(...recs.filter(Boolean).map(normalizeRecord));
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

// ── Scritture concorrenti sulla stessa scheda (fix 03/10/2026, test di carico) ──
// Il webhook di ClickUp (scatta anche quando alleghiamo un file), il push verso
// ClickUp e il riferimento al documento arrivano nello stesso istante: chi aveva
// letto la scheda un attimo prima la riscriveva intera e cancellava il campo
// appena scritto dall'altro (visto: 2 documenti su 30 senza riferimento in app,
// file regolarmente su ClickUp). Ora la lettura-fusione-scrittura finale passa
// da un lucchetto breve per scheda, e i campi cambiati da altri dopo la nostra
// lettura (fieldUpdatedAt più recente) si conservano.
async function withPersonWriteLock(id, fn) {
  const key = `hr:person:wlock:${id}`;
  const until = Date.now() + 5000;
  let got = null;
  while (!got) {
    got = await kv.set(key, Date.now(), { nx: true, ex: 10 }).catch(() => "OK");
    if (got || Date.now() > until) break;
    await new Promise((r) => setTimeout(r, 60 + Math.random() * 60));
  }
  try { return await fn(); } finally { if (got) await kv.del(key).catch(() => {}); }
}
/** Campi cambiati da altri dopo `readSnap` (letto all'inizio) e non toccati da `next`: si tengono quelli di `cur`. */
export function keepNewerFields(next, readSnap, cur) {
  if (!cur || !readSnap) return next;
  const out = { ...next, fields: { ...next.fields }, fieldUpdatedAt: { ...(next.fieldUpdatedAt || {}) } };
  for (const [k, t] of Object.entries(cur.fieldUpdatedAt || {})) {
    const seen = Number(readSnap.fieldUpdatedAt?.[k] || 0);
    const ours = Number(next.fieldUpdatedAt?.[k] || 0);
    if (Number(t) > seen && ours <= seen) { out.fields[k] = cur.fields?.[k]; out.fieldUpdatedAt[k] = t; }
  }
  if (Number(cur.updatedAt || 0) > Number(out.updatedAt || 0)) out.updatedAt = cur.updatedAt;
  return out;
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
  // un'archiviata non si modifica dalla scheda (prima si ripristina); dal modulo si salva ma non si sincronizza
  if (person?.archived && source === "app") return { ok: false, status: 409, errors: ["Scheda archiviata: ripristinala per modificarla."] };
  const creating = !person;
  if (creating && !values.firstName) errors.push("Nome: obbligatorio.");
  if (errors.length) return { ok: false, status: 400, errors: [...new Set(errors)] };
  if (creating) {
    person = { id: newPersonId(), createdAt: at, updatedAt: at, source, fields: {}, fieldUpdatedAt: {}, clickupTaskId: null, sync: { status: "pending" } };
    // persona nuova dal modulo (link condiviso o personale): fase "In ingresso" se non indicata
    if (source === "modulo" && !values.collaborationStatus) values.collaborationStatus = PHASE_ENTRY;
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
  if (person?.archived) {
    await kv.srem(K.syncRetry, person.id).catch(() => {});
    return { status: "archived", person, errors: [], skipped: [], message: "Scheda archiviata: non si sincronizza con ClickUp." };
  }
  const cfg = hrSyncConfig();
  if (!cfg.enabled) {
    const p = { ...person, sync: { status: "off", at: Date.now(), message: "Sincronizzazione spenta (HR_CLICKUP_LIST_ID o token mancante)." } };
    await kv.set(K.person(p.id), p);
    return { status: "off", person: p, errors: [], skipped: [], message: p.sync.message };
  }
  // Un push alla volta per persona (03/10/2026, carico da 300 persone): l'invio del
  // modulo, la coda e la riconciliazione possono arrivare insieme; due push sulla
  // stessa scheda senza task creerebbero DUE task. Chi trova il lucchetto lascia
  // i campi in sospeso e la scheda nell'insieme "da riprovare".
  const lockKey = K.pushLock(person.id);
  const got = await kv.set(lockKey, Date.now(), { nx: true, ex: 90 }).catch(() => "OK");
  if (!got) {
    await kv.sadd(K.syncRetry, person.id).catch(() => {});
    return { status: "busy", person, errors: [], skipped: [], message: "Sincronizzazione già in corso: riprovo tra poco." };
  }
  let res;
  try {
    // la scheda potrebbe essere cambiata mentre aspettavamo (es. task appena creato da un altro push)
    const fresh = (await getPerson(person.id)) || person;
    res = await pushPerson(fresh, keys, cfg);
  } catch (e) {
    const at = Date.now();
    const message = e instanceof ClickupError || e?.message ? e.message : "errore sconosciuto";
    const cur = (await getPerson(person.id).catch(() => null)) || person;
    const p = { ...cur, sync: { status: "error", at, message } };
    await kv.set(K.person(p.id), p);
    await appendLog(p.id, [{ at, by: actor, source: "sistema", action: "sync_error", field: null, to: message.slice(0, 300) }]);
    res = { status: "error", person: p, errors: [message], skipped: [], message };
  } finally {
    await kv.del(lockKey).catch(() => {});
  }
  const p = res.person;
  const needsRetry = !p?.archived && (res.status === "error" || res.status === "partial" || !p?.clickupTaskId || (p?.pendingKeys || []).length > 0);
  if (needsRetry) await kv.sadd(K.syncRetry, person.id).catch(() => {});
  else await kv.srem(K.syncRetry, person.id).catch(() => {});
  return res;
}

/** Schede con scritture verso ClickUp ancora da fare (svuotate dalla coda e di notte). */
export async function listSyncRetry() {
  return ((await kv.smembers(K.syncRetry)) || []).filter((id) => /^p_[a-f0-9]{16}$/.test(id));
}
export async function markSyncRetry(id) {
  await kv.sadd(K.syncRetry, id).catch(() => {});
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
    keys: pushKeys, cfPlain, statuses: info.statuses, currentDescription: task?.description || "", currentTask: task,
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
  // stato del task = fase: si allinea solo se la fase è tra i campi da spingere (o push completo),
  // così un push di altri campi non riporta indietro uno stato appena cambiato su ClickUp.
  // Eco e base dello stato col NOME DELLA FASE (non dello stato), come per i campi.
  const statusWanted = Boolean(plan.status) && (!task || !pushKeys || pushKeys.includes("collaborationStatus"));
  if (statusWanted) pushedValues[STATUS_KEY] = p.fields?.collaborationStatus ?? null;
  if (!task) {
    let created;
    try {
      created = await createTask(cfg.listId, createTaskPayload(plan));
    } catch (e) {
      // 06/10/2026: ClickUp rifiuta TUTTO il task per un telefono che giudica non valido (il nostro
      // controllo è più largo del suo). Si riprova senza i telefoni: la scheda nasce, il numero resta
      // in app e il campo risulta «non scritto» come gli altri saltati.
      if (!(e?.status === 400 && /phone/i.test(String(e?.message || "")))) throw e;
      const phoneKeys = new Set(["personalPhone", "companyPhone"]);
      created = await createTask(cfg.listId, createTaskPayload({ ...plan, fieldOps: plan.fieldOps.filter((o) => !phoneKeys.has(o.key)) }));
    }
    p.clickupTaskId = String(created.id);
    p.clickupUrl = created.url || `https://app.clickup.com/t/${created.id}`;
    await kv.set(K.echo(p.clickupTaskId), recordEcho({}, pushedValues, at, pushedPrints), { ex: 60 });
  } else {
    const echo = (await kv.get(K.echo(task.id)).catch(() => null)) || {};
    await kv.set(K.echo(task.id), recordEcho(echo, pushedValues, at, pushedPrints), { ex: 60 });
    const upd = {};
    if (String(task.name || "") !== plan.name && (!keys || keys.includes("firstName") || keys.includes("surname"))) upd.name = plan.name;
    if (String(task.description || "").trim() !== plan.description.trim()) upd.description = plan.description;
    if (statusWanted && String(task.status?.status || "").toLowerCase() !== plan.status.toLowerCase()) upd.status = plan.status;
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
  // Mentre scrivevamo su ClickUp la scheda può essere cambiata (es. un documento appena
  // arrivato dal modulo): si riprende quella in KV e si aggiornano SOLO i dati di sync.
  // Un campo cambiato dopo l'inizio del push resta in sospeso anche se l'abbiamo spinto.
  p = await withPersonWriteLock(p.id, async () => {
    const cur = await getPerson(p.id);
    let out = p;
    if (cur && cur.updatedAt !== person.updatedAt) {
      out = {
        ...cur,
        clickupTaskId: p.clickupTaskId, clickupUrl: p.clickupUrl, cuBase: p.cuBase, mirrorStale: p.mirrorStale, sync: p.sync,
        pendingKeys: (cur.pendingKeys || []).filter((k) => !done.has(k) || failed.has(k) || Number(cur.fieldUpdatedAt?.[k] || 0) > Number(person.updatedAt || 0)),
      };
    }
    await putPerson(out);
    return out;
  });
  return { status: p.sync.status, person: p, errors: errors.map((e) => `${FIELD_BY_KEY[e.key]?.label || e.key}: ${e.error}`), skipped: plan.skipped, message: p.sync.message };
}

// ── Fase: tendina e stato del task allineati ────────────────────────────────
/**
 * La fase `phase` (appena decisa da ClickUp) va riscritta su ClickUp? Sì se la
 * tendina dice altro, o se lo stato del task è diverso E la lista ha uno stato
 * per quella fase (sulla lista vera, con stati come "to do", lo stato non si tocca
 * e non si fanno scritture inutili).
 */
async function phaseNeedsAlign(phase, { hasDropdown, dropdown, statusPhase }) {
  if (!phase) return false;
  if (hasDropdown && dropdown !== phase) return true;
  if (statusPhase === phase) return false;
  try {
    const cfg = hrSyncConfig();
    if (!cfg.enabled) return false;
    const info = await getListInfo(cfg.listId);
    return Boolean(statusForCollaboration(info.statuses, phase));
  } catch {
    return false;
  }
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
  // nuova base = valori ClickUp visti ora, SOLO per i campi di questo evento (fix 03/10/2026).
  // Prima la base si aggiornava per TUTTI i campi: se due campi cambiavano quasi insieme su
  // ClickUp, il webhook del primo scaricava il task con entrambe le modifiche, applicava solo
  // il suo campo e segnava come "già visto" anche il secondo → il webhook del secondo (e la
  // riconciliazione) lo scartavano come invariato e la modifica andava persa.
  const nextBase = Object.fromEntries(Object.entries(incomingAll).filter(([k]) => !readOnlyKeys.includes(k) && inScope(k)).map(([k, v]) => [k, prints[k] ?? valueHash(v)]));
  for (const [k, pr] of Object.entries(prints)) if (inScope(k)) nextBase[k] = pr;
  // stato del task → fase (03/10/2026). Base ed eco col nome della fase; "-" = stato estraneo
  // alle 5 fasi (es. "to do"), che non tocca la fase ma va ricordato: se poi torna una fase, è un cambio.
  const statusInScope = inScope(STATUS_KEY);
  const statusPrint = m.statusPhase ? valueHash(m.statusPhase) : "-";
  if (statusInScope) nextBase[STATUS_KEY] = statusPrint;
  const hasDropdown = "collaborationStatus" in m.fields; // la lista ha la tendina "Collaboration Status"

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
    // fase: dalla tendina; se è vuota (o la lista non ce l'ha), dallo stato del task
    if (statusInScope && m.statusPhase && !fields.collaborationStatus) { fields.collaborationStatus = m.statusPhase; fieldUpdatedAt.collaborationStatus = ts; }
    // tendina e stato del task in disaccordo → si allineano alla fase scelta
    const phaseMismatch = await phaseNeedsAlign(fields.collaborationStatus, { hasDropdown, dropdown: incoming.collaborationStatus, statusPhase: m.statusPhase });
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
    if (phaseMismatch && !allowPushBack) person.pendingKeys = ["collaborationStatus"];
    await putPerson(person);
    await appendLog(person.id, log);
    if (phaseMismatch && allowPushBack) await pushPersonSafe(person, ["collaborationStatus"], { actor: "sistema" });
    return { kind: "created", personId: person.id, pushBack: phaseMismatch ? ["collaborationStatus"] : [] };
  }

  let person = await getPerson(personId);
  if (!person) return { kind: "unchanged", personId, pushBack: [] };
  // archiviata: non riceve più niente da ClickUp (il suo task è cancellato o in attesa di cancellazione)
  if (person.archived) return { kind: "ignored", personId, pushBack: [] };
  const cfPrev = readCf(person);
  const current = { fields: { ...person.fields }, fieldUpdatedAt: { ...(person.fieldUpdatedAt || {}) } };
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
  // stato del task cambiato su ClickUp (rispetto all'ultimo visto o scritto) → è un cambio di fase.
  // Stato estraneo alle 5 fasi: la fase non si tocca. Eco di un nostro cambio di stato: ignorata.
  let atIn = incomingAt ?? m.dateUpdated ?? at;
  if (statusInScope && m.statusPhase && base[STATUS_KEY] !== statusPrint) {
    if (useEcho && isOwnEcho(echo, STATUS_KEY, m.statusPhase, at)) echoes.push("stato del task");
    else {
      const tStatus = typeof atIn === "number" ? atIn : Number(atIn?.[STATUS_KEY] ?? atIn?._default ?? at);
      const tDrop = typeof atIn === "number" ? atIn : Number(atIn?.collaborationStatus ?? atIn?._default ?? at);
      // tendina e stato cambiati insieme e in disaccordo: vince il più recente, a pari data la tendina
      if (!("collaborationStatus" in fresh) || (fresh.collaborationStatus !== m.statusPhase && tStatus > tDrop)) {
        fresh.collaborationStatus = m.statusPhase;
        if (typeof atIn === "object" && atIn) atIn = { ...atIn, collaborationStatus: tStatus };
      }
    }
  }
  // campi con scrittura verso ClickUp ancora in sospeso: l'app resta la fonte
  const pending = new Set(person.pendingKeys || []);
  for (const k of Object.keys(fresh)) if (pending.has(k)) delete fresh[k];
  // Un campo VUOTO su ClickUp non svuota l'app (04/10/2026, incidente): (a) se l'app non ha mai
  // visto quel campo su ClickUp (nessuna base: campo appena creato sulla lista, o mai scritto),
  // (b) se l'app non riesce a scriverlo lì (es. indirizzo senza posizione su mappa: ClickUp resta
  // vuoto per forza). Prima un "Importa ora" dopo la creazione di due campi aveva cancellato
  // provenienza, reference e indirizzo su 7 schede vere.
  const skippedKeys = new Set((person.sync?.skipped || []).map((x) => x.key));
  for (const k of Object.keys(fresh)) {
    if (!isEmptyValue(fresh[k]) || isEmptyValue(current.fields[k])) continue;
    if (base[k] === undefined || skippedKeys.has(k) || k === "location") delete fresh[k];
  }

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
  const { apply, keepApp } = resolveFieldConflicts(current, fresh, atIn);

  const { codiceFiscale: cfApply, ...applyRest } = apply;
  // competenze cambiate da ClickUp: le etichette "Skills" seguono, come quando si salva in app
  const derivedPush = [];
  if ("skillLevels" in applyRest && !("skills" in fresh)) {
    const labels = clickupSkillLabels(applyRest.skillLevels);
    if (!valuesEqual(current.fields.skills, labels)) { applyRest.skills = labels; derivedPush.push("skills"); }
  }
  // fase cambiata da ClickUp (tendina o stato del task): l'altro dei due si allinea
  if ("collaborationStatus" in applyRest && await phaseNeedsAlign(applyRest.collaborationStatus, { hasDropdown, dropdown: m.fields.collaborationStatus, statusPhase: m.statusPhase })) {
    derivedPush.push("collaborationStatus");
  }
  const r = applyChanges(person, { ...applyRest, ...incomingRo }, { at, by, source: "clickup" });
  person = r.person;
  log.unshift(...r.log);
  // timestamp del campo = quello della modifica su ClickUp, non dell'import
  for (const k of r.changed) {
    const src = incomingAt == null ? at : atIn;
    const tIn = typeof src === "number" ? src : Number(src?.[k] ?? src?._default ?? at);
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
  const readSnap = current;
  person = await withPersonWriteLock(person.id, async () => {
    const merged = keepNewerFields(person, readSnap, await getPerson(person.id));
    await putPerson(merged);
    return merged;
  });
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
async function checkParity({ tasks, touched, stats, deadline, listId }) {
  const fieldsMeta = await getListFields(listId);
  const byTask = new Map(tasks.map((t) => [String(t.id), t]));
  stats.drift = [];
  stats.parityChecked = 0;
  stats.parityRepaired = 0;
  for (const p of await listPeople()) {
    if (!p.clickupTaskId || (p.pendingKeys || []).length) continue;
    const t = byTask.get(String(p.clickupTaskId));
    if (!t || touched.has(String(p.clickupTaskId))) continue;
    stats.parityChecked += 1;
    const keys = clickupDrift(p, t, fieldsMeta);
    if (!keys.length) {
      if (p.sync?.status === "drift") await kv.set(K.person(p.id), { ...p, sync: { status: "ok", at: Date.now(), message: null } });
      continue;
    }
    if (Date.now() >= deadline) { stats.deferred += 1; continue; }
    const r = await pushPersonSafe(p, keys, { actor: "sistema (controllo parità)" });
    let after = keys;
    try { after = clickupDrift(r.person || p, await getTask(p.clickupTaskId), fieldsMeta); } catch { /* resta "keys" */ }
    if (!after.length) { stats.parityRepaired += 1; continue; }
    const fresh = (await getPerson(p.id)) || p;
    const labels = after.map((k) => FIELD_BY_KEY[k]?.label || k);
    await kv.set(K.person(p.id), { ...fresh, sync: { ...(fresh.sync || {}), status: "drift", at: Date.now(), message: `Su ClickUp diverso da HOC Pro: ${labels.join(", ")}.`, drift: after } });
    stats.drift.push({ id: p.id, name: [fresh.fields?.firstName, fresh.fields?.surname].filter(Boolean).join(" "), fields: labels });
  }
  // campi che l'app usa e la lista non ha (escluse le voci in sola lettura)
  const byName = fieldsByName(fieldsMeta);
  stats.missingFields = [...new Set(expectedFieldNames()
    .filter((f) => !FIELD_BY_KEY[f.key]?.readOnly && FIELD_BY_KEY[f.key]?.type !== "fileRef" && !byName.has(String(f.name).toLowerCase().trim()))
    .map((f) => f.name))];
  if (stats.drift.length || stats.missingFields.length) {
    const lines = ["HOC Pro · Centro HR: ClickUp non è allineato."];
    if (stats.drift.length) lines.push(`Schede diverse (${stats.drift.length}): ${stats.drift.slice(0, 5).map((d) => `${d.name} (${d.fields.join(", ")})`).join("; ")}`);
    if (stats.missingFields.length) lines.push(`Campi da creare su ClickUp: ${stats.missingFields.join(", ")}`);
    lines.push("Dettagli: https://houseofcreators.app/admin/hr/sync");
    // un avviso al giorno al massimo
    const day = new Date().toISOString().slice(0, 10);
    const last = await kv.get("hr:parity:notified").catch(() => null);
    if (last !== day) {
      await kv.set("hr:parity:notified", day, { ex: 3 * 24 * 3600 }).catch(() => {});
      await notifyWhatsApp(lines.join("\n")).catch(() => {});
    }
  }
}

export async function importFromClickup({ mode = "import", by = "sistema", budgetMs = 45_000 } = {}) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, skipped: true, reason: "Sincronizzazione spenta: imposta HR_CLICKUP_LIST_ID e CLICKUP_API_TOKEN." };
  const got = await kv.set(K.lock, Date.now(), { nx: true, ex: 120 });
  if (!got) return { ok: false, busy: true, reason: "Un import è già in corso: riprova tra un paio di minuti." };
  const start = Date.now();
  const deadline = start + budgetMs;
  const stats = { mode, at: start, by, tasks: 0, created: 0, updated: 0, unchanged: 0, ignored: 0, pushedBack: 0, createdOnClickup: 0, missingOnClickup: 0, archived: 0, deferred: 0, errors: [] };
  try {
    await getListFields(cfg.listId, { force: true });
    await getListInfo(cfg.listId, { force: true });
    const tasks = await listAllTasks(cfg.listId);
    stats.tasks = tasks.length;
    const seen = new Set();
    const touched = new Set(); // task appena modificati da questo giro: il confronto li salta
    for (const t of tasks) {
      seen.add(String(t.id));
      try {
        const r = await ingestTask(t, { incomingAt: Number(t.date_updated) || start, by: `clickup (${mode === "import" ? "import" : "riconciliazione"})`, allowPushBack: Date.now() < deadline });
        stats[r.kind] += 1;
        stats.pushedBack += r.pushBack.length;
        if (r.pushBack.length) touched.add(String(t.id));
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
      if (p.clickupTaskId) touched.add(String(p.clickupTaskId));
    }
    // ── Controllo di parità app ↔ ClickUp (04/10/2026) ──────────────────────
    // Ogni scheda con task: campo per campo, ClickUp deve mostrare quello che mostra l'app.
    // Differenza → si riscrive su ClickUp; se resta → stato "Diversa su ClickUp" + avviso.
    await checkParity({ tasks, touched, stats, deadline, listId: cfg.listId });
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

// ── Archivio: solo rete di sicurezza (03/10/2026) ───────────────────────────
// Da procedura non si elimina mai una persona: chi va via si segna "Uscita".
// L'archivio resta per un caso solo: un task cancellato su ClickUp (anche per
// errore). Stato `archived` = { at, by, source, reason, taskId, taskDeletedAt? }.
// Un'archiviata: fuori dall'elenco normale, dai doppioni e dalle statistiche; non
// si sincronizza (pushPersonSafe non fa nulla) e non riceve dati dai webhook del
// suo vecchio task (ingestTask la ignora). Si ripristina; non si cancella mai.
// (Le schede archiviate col vecchio "Elimina" del 03/10 mattina possono avere
// `pendingTaskDelete`: quel task NON viene più cancellato, e Ripristina lo riprende.)

/**
 * Mette la scheda in archivio (interno: webhook taskDeleted, riconciliazione,
 * push che trova il task sparito).
 * @param opts.taskGone true = il task su ClickUp non c'è più
 */
async function archiveRecord(person, { by, source, reason, taskId = null, taskGone = false, at = Date.now() }) {
  const tid = taskId ? String(taskId) : null;
  const archived = { at, by: by || null, source, reason, taskId: tid };
  if (tid && taskGone) archived.taskDeletedAt = at;
  const message = "Scheda archiviata: il task su ClickUp è stato cancellato. Non si sincronizza più finché non la ripristini.";
  const p = { ...person, archived, clickupTaskId: null, pendingKeys: [], mirrorStale: [], sync: { status: "archived", at, message } };
  await kv.set(K.person(p.id), p);
  if (tid && taskGone) await kv.del(K.task(tid)).catch(() => {});
  await appendLog(p.id, [{ at, by: by || "sistema", source, action: "archived", field: null, to: `${reason}${tid ? ` (task ${tid})` : ""}. Scheda tra le archiviate: si può ripristinare.` }]);
  return p;
}

/** taskDeleted per una scheda già archiviata: si annota che il task non c'è più. */
async function markTaskGone(person, taskId, { at, by, source }) {
  if ((await kv.get(K.task(taskId))) === person.id) await kv.del(K.task(taskId)).catch(() => {});
  if (String(person.archived?.taskId || "") !== String(taskId) || person.archived?.taskDeletedAt) return;
  const { pendingTaskDelete: _p, ...rest } = person.archived;
  await kv.set(K.person(person.id), { ...person, archived: { ...rest, taskDeletedAt: at } });
  await appendLog(person.id, [{ at, by, source, action: "task_trashed", field: null, to: `ClickUp conferma: task ${taskId} cancellato` }]);
}

// ── Fase "Uscita" (03/10/2026, decisione del titolare) ──────────────────────
/** Oggi a Roma, YYYY-MM-DD. */
export const todayRome = (now = Date.now()) => msToIsoDate(now);

/**
 * "Segna come uscita": fase "Uscita" e "Fine collaborazione". La scheda resta e
 * si sincronizza come sempre (tendina, stato del task e data su ClickUp).
 * @param opts.endDate data scelta nella conferma; se manca vale quella già in
 *                     scheda o, se vuota, oggi.
 */
export async function markPersonExited(id, { endDate = null, actor, now = Date.now() } = {}) {
  const person = await getPerson(id);
  if (!person) return { ok: false, status: 404, errors: ["Persona non trovata."] };
  if (endDate && !isIsoDate(endDate)) return { ok: false, status: 400, errors: ["Fine collaborazione: data non valida."] };
  const end = endDate || person.fields?.endDate || todayRome(now);
  return savePerson({ id, input: { collaborationStatus: PHASE_EXITED, endDate: end }, actor, source: "app" });
}

/** "Riattiva": la fase torna "Attiva" (la data di fine resta com'è: si cambia dalla scheda se serve). */
export async function reactivatePerson(id, { actor } = {}) {
  return savePerson({ id, input: { collaborationStatus: PHASE_ACTIVE }, actor, source: "app" });
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
  if (keepTask) await kv.srem(K.legacyDeleteQueue, keepTask).catch(() => {});
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
      // già archiviata (es. schede del vecchio "Elimina" il cui task era ancora lì) → si annota e basta
      await markTaskGone(p, taskId, { at, by, source: "clickup" });
      return { ok: true, event, personId: pid, already: true };
    }
    if (String(p.clickupTaskId || "") !== taskId) { await kv.del(K.task(taskId)); return { ignored: "collegamento vecchio" }; }
    await archiveRecord(p, { by, source: "clickup", reason: "Task cancellato su ClickUp", taskId, taskGone: true, at });
    return { ok: true, event, personId: pid, archived: true };
  }
  if (event !== "taskCreated" && event !== "taskUpdated" && event !== "taskStatusUpdated") return { ignored: `evento ${event}` };

  const task = await getTask(taskId);
  if (String(task?.list?.id || "") !== cfg.listId) return { ignored: "task di un'altra lista" };
  const fieldsMeta = await getListFields(cfg.listId);
  const incomingAt = incomingTimestamps(payload.history_items || [], fieldsMeta, Number(task.date_updated) || at);
  // taskUpdated: solo i campi nominati negli history_items (gli altri non sono cambiati in questo evento).
  // taskStatusUpdated (03/10/2026): solo lo stato del task, cioè la fase.
  const eventKeys = Object.keys(incomingAt).filter((k) => k !== "_default");
  const onlyKeys = event === "taskStatusUpdated" ? ["_status"] : event === "taskUpdated" && eventKeys.length ? eventKeys : null;
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
  const rec = { id, secret, endpoint, listId: cfg.listId, teamId, events: [...HR_WEBHOOK_EVENTS], at: Date.now(), by: actor };
  await kv.set(K.webhook, rec);
  const { secret: _s, ...pub } = rec;
  return { ok: true, webhook: pub };
}

/**
 * Mostra dei campi come colonne in una vista ClickUp (06/10/2026: dall'interfaccia di ClickUp la
 * colonna «Mansione» nella vista «Persone» non restava salvata). Solo AGGIUNGE colonne visibili:
 * le altre impostazioni della vista restano come sono.
 */
export async function showViewColumns(viewId, fieldNames = []) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { ok: false, error: "Sincronizzazione spenta." };
  const meta = await getListFields(cfg.listId);
  const view = await getView(viewId);
  if (!view?.id) return { ok: false, error: "Vista non trovata." };
  const fields = Array.isArray(view.columns?.fields) ? [...view.columns.fields] : [];
  const added = [];
  const missing = [];
  for (const name of fieldNames) {
    const f = meta.find((m) => m.name === name);
    if (!f) { missing.push(name); continue; }
    const key = `cf_${f.id}`;
    const cur = fields.find((c) => c.field === key);
    if (cur && !cur.hidden) continue;
    if (cur) cur.hidden = false; else fields.push({ field: key, hidden: false });
    added.push(name);
  }
  if (!added.length) return { ok: true, added, missing };
  const { id, date_created, creator, visibility, protected: _p, protected_note, protected_by, date_protected, orderindex, ...rest } = view;
  await updateView(viewId, { ...rest, columns: { ...(view.columns || {}), fields } });
  return { ok: true, added, missing };
}

/**
 * Salute del webhook (05/10/2026). ClickUp aveva sospeso il webhook senza che nessuno se ne
 * accorgesse: cancellazioni e modifiche fatte su ClickUp arrivavano all'app solo con la
 * riconciliazione notturna o con «Importa ora». Al massimo una volta l'ora (dalla coda HR ogni
 * 5 minuti) si chiede a ClickUp lo stato: se il webhook non c'è più o non è «active» si
 * registra di nuovo e si avvisa Nicholas su WhatsApp.
 */
export async function ensureWebhookHealthy({ force = false } = {}) {
  const cfg = hrSyncConfig();
  if (!cfg.enabled) return { skipped: "sync spenta" };
  const rec = await getWebhookRecord();
  if (!rec?.id || !rec.endpoint) return { skipped: "webhook mai registrato" };
  if (!force) {
    const first = await kv.set("hr:webhook:checked", Date.now(), { nx: true, ex: 3600 }).catch(() => "OK");
    if (!first) return { skipped: "già controllato nell'ultima ora" };
  }
  const teamId = rec.teamId || (await resolveTeamId());
  const hooks = await listWebhooks(teamId);
  const mine = hooks.find((w) => String(w.id) === String(rec.id));
  const status = mine ? String(mine.health?.status || "active") : "assente";
  if (mine && status === "active") return { ok: true, status };
  const res = await registerWebhook({ endpoint: rec.endpoint, actor: "controllo automatico" });
  await notifyWhatsApp(`Webhook ClickUp del CRM HR: era «${status}»${mine?.health?.fail_count ? ` (${mine.health.fail_count} errori)` : ""}. ${res.ok ? "Riattivato da solo." : `Non sono riuscito a riattivarlo: ${res.error}`}\nhttps://houseofcreators.app/admin/hr/sync`).catch(() => {});
  return { ok: Boolean(res.ok), status, reregistered: Boolean(res.ok) };
}

/**
 * Schede che da più di un'ora non riescono ad arrivare su ClickUp (06/10/2026: una persona è
 * rimasta 20 ore senza task, con i documenti fermi in coda, perché ClickUp rifiutava il telefono;
 * l'errore si ripeteva ogni 5 minuti senza che nessuno lo vedesse). Un WhatsApp al giorno al massimo.
 */
export async function notifyStuckSync({ now = Date.now() } = {}) {
  const people = await listPeople();
  const stuck = people.filter((p) => p.sync?.status === "error" && (now - (Number(p.createdAt) || now)) > 3600_000);
  if (!stuck.length) return { stuck: 0 };
  const day = new Date(now).toISOString().slice(0, 10);
  const first = await kv.set("hr:syncerr:notified", day, { nx: true, ex: 24 * 3600 }).catch(() => "OK");
  if (first) {
    const lines = stuck.slice(0, 8).map((p) => `• ${fullName(p.fields) || p.id}: ${String(p.sync?.message || "errore").slice(0, 120)}`);
    await notifyWhatsApp(`CRM HR: ${stuck.length} ${stuck.length === 1 ? "scheda non arriva" : "schede non arrivano"} su ClickUp da più di un'ora.\n${lines.join("\n")}\nhttps://houseofcreators.app/admin/hr/sync`).catch(() => {});
  }
  return { stuck: stuck.length, notified: Boolean(first) };
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

export async function getFormRecord(token) {
  return getFormRec(token);
}
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
      if (f.choices) continue; // fase e contratto: i nomi italiani della tabella, mai le opzioni ClickUp
      const meta = byName.get(f.cu.toLowerCase());
      const opts = (meta?.type_config?.options || []).map((o) => String(o.label ?? o.name ?? "")).filter(Boolean);
      if (opts.length) out[f.key] = opts;
    }
  } catch { /* senza opzioni ClickUp restano quelle note / testo libero */ }
  // referente (04/10/2026): le persone della lista su ClickUp, da scegliere in scheda
  if (!keys || keys.includes("referent")) {
    try { out.referent = await getListMembers(cfg.listId); } catch { out.referent = []; }
  }
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
      uploadsEnabled: uploadsEnabled(),
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
    uploadsEnabled: uploadsEnabled(),
    cfEnabled: hrCryptoConfigured(),
    cfPresent: Boolean(person?.cfEnc),
    prefill,
    options: await formOptions(),
    privacyVersion: PRIVACY_VERSION,
    expiresAt: rec.expiresAt,
    maxUploadBytes: UPLOAD_MAX_BYTES,
  };
}

/**
 * @param opts.deferSync true = salva subito e NON scrive su ClickUp nella richiesta: la
 *   route lo fa dopo la risposta (`after()`), così sotto un picco (link mandato a tutti)
 *   la persona non aspetta i 429 di ClickUp. La scheda entra in `hr:sync:retry`: se il
 *   giro dopo la risposta non riesce, la ripresa successiva o la notte la portano su ClickUp.
 */
/** Le risposte del modulo, solo i campi ammessi. */
function pickForm(body) {
  const out = {};
  for (const k of FORM_KEYS) if (k in (body?.data || {})) out[k] = body.data[k];
  out.spokenLanguages = stripLangNo(out.spokenLanguages); // i "No" non contano come lingua parlata
  return out;
}
/** "Cognome: obbligatorio. Data di nascita: obbligatorio." — la pagina lo mette sotto i campi. */
function requiredError(keys) {
  return keys.map((k) => `${FIELD_BY_KEY[k]?.label || k}: obbligatorio.`).join(" ");
}

export async function submitForm(token, body, { deferSync = false } = {}) {
  const rec = await getFormRec(token);
  const now = Date.now();
  const state = formTokenState(rec, now);
  if (state === "invalid") return { ok: false, status: 404, error: "Link non valido." };
  if (state === "disabled") return { ok: false, status: 410, error: "Questo link non è più attivo. Chiedi a HR quello nuovo." };
  if (state === "expired") return { ok: false, status: 410, error: "Questo link è scaduto." };
  if (state !== "open") return { ok: false, status: 409, error: "Questo modulo è già stato inviato." };
  if (body?.consent !== true) return { ok: false, status: 400, error: "Serve il consenso all'informativa privacy." };
  if (rec.shared) return submitShared(token, rec, body, now, deferSync);
  const input = {};
  {
    // link personali (vecchi): il CF può essere già in scheda, quindi non si pretende
    const missing = missingRequired(pickForm(body), { cfEnabled: hrCryptoConfigured(), cfPresent: true });
    if (missing.length) return { ok: false, status: 400, error: requiredError(missing) };
  }
  for (const k of FORM_KEYS) if (k in (body?.data || {})) input[k] = body.data[k];
  // il CF vuoto dal modulo non cancella quello già inserito
  if (!String(input.codiceFiscale || "").trim()) delete input.codiceFiscale;
  const consent = { at: now, version: PRIVACY_VERSION, via: "modulo" };
  const res = await savePerson({
    id: rec.personId, input, allowed: FORM_KEYS, actor: "modulo", source: "modulo", sync: !deferSync,
    extra: () => ({ consent, formLink: { createdAt: rec.createdAt, expiresAt: rec.expiresAt, submittedAt: now } }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.errors.join(" ") };
  if (deferSync) await markSyncRetry(res.person.id);
  await appendLog(res.person.id, [{ at: now, by: "modulo", source: "modulo", action: "consent", field: null, to: `consenso privacy (versione ${PRIVACY_VERSION})` }]);
  const ttl = Math.max(60, Math.ceil((rec.expiresAt - now) / 1000));
  await kv.set(K.form(token), { ...rec, personId: res.person.id, submittedAt: now }, { ex: ttl });
  return { ok: true, cfNote: res.cfNote, uploadsEnabled: uploadsEnabled(), uploadToken: token, personId: res.person.id };
}

/**
 * Invio dal link condiviso: SEMPRE una scheda nuova (id null). Il link resta
 * aperto; per i file nasce un token figlio monouso legato solo a questa scheda
 * (già "inviato", 1 ora), che la pagina usa per il passo documenti.
 */
async function submitShared(token, rec, body, now, deferSync = false) {
  // tetto giornaliero di invii sul link condiviso (oltre ai limiti per IP della route)
  const cap = await checkRateLimit("hr_form_shared_submit", token.slice(0, 64));
  if (!cap.ok) return { ok: false, status: 429, error: "Oggi il modulo ha ricevuto troppi invii. Riprova domani o scrivi a chi ti ha mandato il link." };
  {
    const missing = missingRequired(pickForm(body), { cfEnabled: hrCryptoConfigured() });
    if (missing.length) return { ok: false, status: 400, error: requiredError(missing) };
  }
  const input = {};
  for (const k of FORM_KEYS) if (k in (body?.data || {})) input[k] = body.data[k];
  if (!String(input.codiceFiscale || "").trim()) delete input.codiceFiscale;
  const consent = { at: now, version: PRIVACY_VERSION, via: "modulo" };
  const res = await savePerson({
    id: null, input, allowed: FORM_KEYS, actor: "modulo", source: "modulo", sync: !deferSync,
    extra: () => ({ consent, formLink: { shared: true, createdAt: rec.createdAt, expiresAt: null, submittedAt: now } }),
  });
  if (!res.ok) return { ok: false, status: res.status, error: res.errors.join(" ") };
  if (deferSync) await markSyncRetry(res.person.id);
  await appendLog(res.person.id, [{ at: now, by: "modulo", source: "modulo", action: "consent", field: null, to: `consenso privacy (versione ${PRIVACY_VERSION}), dal link condiviso` }]);
  const child = randomBytes(24).toString("base64url");
  await kv.set(K.form(child), {
    token: child, child: true, personId: res.person.id, createdAt: now, createdBy: "modulo",
    expiresAt: now + FORM_UPLOAD_GRACE_MS, submittedAt: now, uploads: 0,
  }, { ex: Math.ceil(FORM_UPLOAD_GRACE_MS / 1000) + 60 });
  return { ok: true, cfNote: res.cfNote, uploadsEnabled: uploadsEnabled(), uploadToken: child, personId: res.person.id };
}

export const UPLOAD_KIND = {
  document: { key: "idDocument", title: "Documento d'identità" },
  cv: { key: "cvUpload", title: "CV" },
};

/**
 * Riferimento al file sulla scheda, dopo che è arrivato su ClickUp (in app SOLO il
 * riferimento: titolo, id allegato, data). Legge la scheda fresca dal KV (il push
 * può essere in corso) e aggiorna il blocco in descrizione per il documento.
 */
export async function setPersonFileRef(personId, kind, { title, attachmentId, at = Date.now(), via = "modulo" }) {
  const spec = UPLOAD_KIND[kind];
  if (!spec) return null;
  const ref = { title, attachmentId: String(attachmentId || ""), at, via };
  let prev;
  const person = await withPersonWriteLock(personId, async () => {
    const cur = await getPerson(personId);
    if (!cur) return null;
    prev = cur.fields?.[spec.key];
    // fieldUpdatedAt = adesso (non `at`): deve risultare più recente di qualsiasi lettura in corso
    const now = Math.max(Date.now(), Number(at) || 0);
    const next = { ...cur, fields: { ...cur.fields, [spec.key]: ref }, fieldUpdatedAt: { ...cur.fieldUpdatedAt, [spec.key]: now }, updatedAt: now };
    await putPerson(next);
    return next;
  });
  if (!person) return null;
  await appendLog(person.id, [{ at, by: via, source: "modulo", action: "upload", field: spec.key, from: logValue(spec.key, prev), to: title }]);
  if (kind === "document") await pushPersonSafe(person, [spec.key], { actor: "modulo" });
  return ref;
}

/** Nome dell'allegato su ClickUp (il nome della persona sta su ClickUp, MAI nel Blob). */
export function attachmentName(person, kind, ext, part = null) {
  const spec = UPLOAD_KIND[kind];
  const safeName = (fullName(person?.fields) || "persona").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]+/g, "").trim().slice(0, 60);
  return `${spec.title.replace(/'/g, "")}${part ? ` (${part})` : ""} - ${safeName}.${ext}`;
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
  if (webhook) {
    const { secret: _s, ...rest } = webhook;
    // webhook registrato prima del 03/10/2026: non riceve taskStatusUpdated → va registrato di nuovo
    const missingEvents = HR_WEBHOOK_EVENTS.filter((e) => !(webhook.events || []).includes(e));
    webhookPub = { ...rest, sameList: webhook.listId === cfg.listId, missingEvents };
  }
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
