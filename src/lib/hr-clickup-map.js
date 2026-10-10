/**
 * Centro HR — mapping PURO tra task ClickUp e persona HOC Pro (29/09/2026).
 *
 * I custom field si risolvono per NOME (mai id cablati): la lista di prova è
 * un duplicato della reale con id diversi. Qui niente rete: si ricevono i
 * metadati dei campi (GET /list/{id}/field) e il task, si restituiscono
 * valori o operazioni da eseguire. Testato in tests/hr-people.mjs.
 *
 * Tipi ClickUp gestiti: short_text, text, email, url, phone, number, date,
 * drop_down (value = orderindex OPPURE option id), labels (array di option id
 * o di oggetti), location, users, attachment, checkbox.
 *
 * Fase e contratto (03/10/2026): tendine con la tabella di corrispondenza in
 * hr-fields.js (PERSON_PHASES, CONTRACT_STATUSES). In app si salva il nome
 * italiano; verso ClickUp si cerca l'opzione col nome inglese O italiano. La fase
 * vive anche nello STATO DEL TASK (taskToPerson → statusPhase, personToClickup → status).
 */
import { normalizeSkillMap, normalizeLearnList, normalizePastRoles, skillName, pastRoleText, oneLine, SKILL_AREAS } from "./hr-skills.js";
import { FIELDS, FIELD_BY_KEY, isEmptyValue, maskCf, findChoice, choiceLabel, phaseFromTaskStatus, taskStatusNamesFor, toE164, canonical } from "./hr-people-core.js";
import { mirrorText, parseMirror, mirrorPrint } from "./hr-mirror.js";

export const HOC_BLOCK_START = "— Dati HOC Pro —";
const HOC_BLOCK_NOTE = "(blocco scritto da HOC Pro: qui si leggono solo Mansione attuale e Partita IVA; il resto si modifica in app)";

const s = (v) => (v == null ? "" : String(v)).trim();
const lc = (v) => s(v).toLowerCase();

/** Indice dei metadati per nome (case-insensitive). */
export function fieldsByName(fieldsMeta = []) {
  const m = new Map();
  for (const f of fieldsMeta || []) if (f?.name) m.set(lc(f.name), f);
  return m;
}
const optionsOf = (f) => f?.type_config?.options || [];
const optName = (o) => s(o?.name ?? o?.label);

// ── Date: ClickUp in ms, app in YYYY-MM-DD (fuso Europa/Roma) ────────────────
export function msToIsoDate(ms) {
  const n = Number(ms);
  if (!ms || !Number.isFinite(n)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(n));
  return parts; // en-CA → "YYYY-MM-DD"
}
/** Mezzogiorno UTC: nessun fuso sposta il giorno. */
export function isoDateToMs(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return Date.parse(`${iso}T12:00:00Z`);
}

// ── Decodifica di un valore ClickUp ──────────────────────────────────────────
/** drop_down: il value può essere l'orderindex (numero o stringa numerica) o l'id dell'opzione. */
export function decodeDropdown(field, value) {
  if (value == null || value === "") return null;
  const opts = optionsOf(field);
  const byId = opts.find((o) => s(o.id) === s(value));
  if (byId) return optName(byId) || null;
  if (/^\d+$/.test(s(value))) {
    const byIdx = opts.find((o) => Number(o.orderindex) === Number(value));
    if (byIdx) return optName(byIdx) || null;
  }
  return null;
}
export function decodeLabels(field, value) {
  if (!Array.isArray(value)) return [];
  const opts = optionsOf(field);
  return value.map((v) => {
    if (v && typeof v === "object") return optName(v) || optName(opts.find((o) => s(o.id) === s(v.id)));
    const o = opts.find((x) => s(x.id) === s(v));
    return o ? optName(o) : null;
  }).filter(Boolean);
}
const TRUE_WORDS = new Set(["si", "sì", "yes", "true", "y", "1"]);
const FALSE_WORDS = new Set(["no", "false", "n", "0"]);
function wordToBool(v) {
  const w = lc(v);
  if (TRUE_WORDS.has(w)) return true;
  if (FALSE_WORDS.has(w)) return false;
  return null;
}

/** Valore app di un custom field del task, secondo il tipo app del campo. */
export function decodeCustomField(cf, appType) {
  const v = cf?.value;
  const t = cf?.type;
  if (appType === "bool") {
    if (t === "checkbox") return v === true || v === "true";
    if (t === "drop_down") return wordToBool(decodeDropdown(cf, v));
    return v == null || v === "" ? null : wordToBool(v);
  }
  switch (t) {
    case "drop_down": return decodeDropdown(cf, v);
    case "labels": return decodeLabels(cf, v);
    case "date": return msToIsoDate(v);
    case "number": case "currency": { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
    case "location": {
      if (!v || typeof v !== "object") return null;
      const addr = s(v.formatted_address);
      const lat = v.location?.lat ?? null;
      const lng = v.location?.lng ?? null;
      return addr || lat != null ? { address: addr, lat: lat == null ? null : Number(lat), lng: lng == null ? null : Number(lng) } : null;
    }
    case "users": return Array.isArray(v) ? v.map((u) => ({ id: s(u.id), name: s(u.username || u.email), email: lc(u.email) || null })) : [];
    case "attachment": return Array.isArray(v) ? v.map((a) => ({ id: s(a.id), title: s(a.title || a.name), date: a.date ? Number(a.date) : null })) : [];
    case "checkbox": return v === true || v === "true";
    default: {
      if (v == null) return null;
      const out = s(v);
      return out || null;
    }
  }
}

// ── Blocco "— Dati HOC Pro —" in fondo alla descrizione ──────────────────────
/** Toglie il blocco (dal marcatore alla fine) e ritorna la descrizione pulita. */
export function stripHocBlock(desc) {
  const d = String(desc || "");
  const i = d.indexOf(HOC_BLOCK_START);
  return (i >= 0 ? d.slice(0, i) : d).replace(/\s+$/, "");
}
export function buildHocBlock(lines) {
  if (!lines.length) return "";
  return [HOC_BLOCK_START, ...lines, HOC_BLOCK_NOTE].join("\n");
}
export function withHocBlock(desc, lines) {
  const base = stripHocBlock(desc);
  const block = buildHocBlock(lines);
  if (!block) return base;
  return base ? `${base}\n\n${block}` : block;
}
/** Legge dal blocco: id HOC Pro, mansione attuale, partita IVA. */
export function parseHocBlock(desc) {
  const d = String(desc || "");
  const i = d.indexOf(HOC_BLOCK_START);
  if (i < 0) return null;
  const out = {};
  for (const line of d.slice(i).split(/\r?\n/)) {
    const m = /^\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = lc(m[1]);
    const v = s(m[2]);
    if (k === "id hoc pro") out.personId = v || null;
    else if (k === "mansione attuale") out.currentJob = v && v !== "—" ? v : null;
    else if (k === "partita iva") out.partitaIva = v === "—" ? null : wordToBool(v);
  }
  return out;
}

const fmtItDate = (ms) => {
  const iso = msToIsoDate(ms);
  return iso ? iso.split("-").reverse().join("/") : "";
};

/**
 * Righe del blocco per i campi NUOVI senza un campo omonimo sulla lista.
 * Il codice fiscale in descrizione esce SEMPRE mascherato (la descrizione la
 * vede chiunque abbia la lista, finisce in notifiche e attività): il valore
 * completo va su ClickUp solo se il titolare crea un campo "Codice fiscale".
 */
export function hocBlockLines(person, byName, { cfPlain } = {}) {
  const f = person.fields || {};
  const lines = [`ID HOC Pro: ${person.id}`];
  // 10/10/2026: il "pulsante" su ClickUp per preparare e inviare il contratto (apre il percorso in HOC Pro)
  lines.push(`Prepara il contratto: https://houseofcreators.app/admin/hr/${person.id}/contratto`);
  if (!byName.has(lc("Mansione attuale"))) lines.push(`Mansione attuale: ${oneLine(f.currentJob, 300) || "—"}`);
  if (!byName.has(lc("Partita IVA"))) lines.push(`Partita IVA: ${f.partitaIva === true ? "sì" : f.partitaIva === false ? "no" : "—"}`);
  if (!byName.has(lc("Codice fiscale")) && (cfPlain || person.cfEnc)) lines.push(`Codice fiscale: ${cfPlain ? maskCf(cfPlain) : "presente"} (completo in HOC Pro)`);
  if (f.idDocument?.at) lines.push(`Documento d'identità: allegato il ${fmtItDate(f.idDocument.at)} (${s(f.idDocument.title)})`);
  // campi solo-app (02/10): luogo di nascita, comune/CAP di residenza, competenze con livello
  const has = (n) => byName.has(lc(n));
  // provenienza e reference (04/10): se la lista non ha i campi "Provenienza"/"Segnalato da"
  // restano visibili qui (prima andavano persi: nessun campo e nessuna riga)
  if (s(f.source) && !has("Provenienza")) lines.push(`Come ci ha conosciuto: ${oneLine(f.source, 80)}`);
  if (s(f.referredBy) && !has("Segnalato da")) lines.push(`Segnalato da: ${oneLine(f.referredBy, 120)}`);
  const bp = f.birthPlace;
  if (bp && !has("Luogo di nascita")) lines.push(`Luogo di nascita: ${bp.abroad ? bp.country : `${s(bp.name)}${bp.prov ? ` (${s(bp.prov)})` : ""}`}`);
  const rc = f.residenceComune;
  if (has("Comune di residenza")) { if (f.residenceCap && !has("CAP")) lines.push(`CAP: ${oneLine(f.residenceCap, 20)}`); }
  else if (rc?.abroad && rc.country) lines.push(`Residenza: ${s(rc.city) ? `${oneLine(rc.city, 120)}, ` : ""}${s(rc.country)}${f.residenceCap ? ` · codice postale ${s(f.residenceCap)}` : ""}`);
  else if (rc?.name) lines.push(`Comune di residenza: ${s(rc.name)}${rc.prov ? ` (${s(rc.prov)})` : ""}${f.residenceCap ? ` · CAP ${s(f.residenceCap)}` : ""}`);
  // competenze v2 (03/10): una riga per area, voci con livello (anche quelle senza etichetta ClickUp)
  const sm = normalizeSkillMap(f.skillLevels);
  if (!has("Competenze e livello")) for (const a of SKILL_AREAS) {
    const got = a.skills.filter((x) => sm[x.key]);
    if (got.length) lines.push(`Competenze · ${a.area}: ${got.map((x) => `${x.name} (${sm[x.key]})`).join(", ")}`);
  }
  const roles = normalizePastRoles(f.pastRoles);
  if (roles.length && !has("Ruoli già ricoperti")) lines.push(`Ruoli già ricoperti: ${roles.map(pastRoleText).join(", ")}`);
  // testo libero su UNA riga: un a-capo scritto dalla persona non deve poter aggiungere righe lette da parseHocBlock
  if (s(f.otherSkills) && !has("Altro che sa fare")) lines.push(`Altro che sa fare: ${oneLine(f.otherSkills, 500)}`);
  const learn = normalizeLearnList(f.learnWish);
  if (learn.length && !has("Vorrebbe imparare")) lines.push(`Vorrebbe imparare: ${learn.map(skillName).join(", ")}`);
  // Location senza coordinate: ClickUp la rifiuta, il testo va nel blocco
  const loc = f.location;
  if (loc?.address && (loc.lat == null || loc.lng == null)) lines.push(`Dove vive (testo): ${s(loc.address)}`);
  return lines;
}

// ── Campi "specchio" (03/10/2026): dati strutturati dell'app scritti come TESTO
// in un campo ClickUp dedicato, se la lista ce l'ha. A DUE VIE: il testo
// corretto su ClickUp si rilegge (parser e regole di onestà in hr-mirror.js).
export { mirrorText, parseMirror, mirrorPrint };

// ── Task → persona ───────────────────────────────────────────────────────────
/** Testo di un campo specchio così come sta su ClickUp (short_text / text; altri tipi letti come testo). */
export function mirrorFieldText(cf) {
  const v = cf?.value;
  if (v == null) return "";
  if (typeof v === "object") return "";
  return String(v);
}

/**
 * @param opts.comuni elenco ISTAT [[nome, sigla, codice, regione]] per leggere i luoghi (null = non disponibile)
 * @returns {{ fields: object, mirrors: object, clickupTaskId, clickupUrl, clickupStatus, dateUpdated, nameIncludesSurname, hocPersonId }}
 *   fields contiene SOLO le chiavi presenti sulla lista (assenti = undefined → ignorate a valle).
 *   Campi specchio: in `fields` solo se il testo si legge TUTTO; `mirrors[key]` = { text, print, ok, unknown, reason }
 *   per tutti i campi specchio presenti sulla lista (anche quelli non riconosciuti).
 */
export function taskToPerson(task, { comuni = null } = {}) {
  const byName = fieldsByName(task?.custom_fields || []);
  const fields = {};
  for (const f of FIELDS) {
    if (!f.cu || f.appOnly || f.type === "fileRef") continue;
    const cf = byName.get(lc(f.cu));
    if (!cf) continue;
    const appType = f.type === "cf" ? "text" : f.type;
    let v = decodeCustomField(cf, appType);
    if (f.type === "cf" && v) v = s(v).toUpperCase();
    // fase / contratto: opzione ClickUp (inglese o italiana) → nome italiano dell'app
    if (f.choices && v != null) v = choiceLabel(f.choices, v);
    if (Array.isArray(v) || v !== undefined) fields[f.key] = v;
  }
  const mirrors = {};
  for (const f of FIELDS) {
    if (!f.mirror) continue;
    const cf = byName.get(lc(f.mirror));
    if (!cf) continue;
    const text = mirrorFieldText(cf);
    const r = parseMirror(f.key, text, { comuni });
    mirrors[f.key] = { text, print: mirrorPrint(text), ok: r.ok, unknown: r.unknown, ...(r.reason ? { reason: r.reason } : {}) };
    if (r.ok) fields[f.key] = r.value;
  }
  // Nome del task = nome; se il task ha già "Nome Cognome" lo si separa
  const taskName = s(task?.name);
  let nameIncludesSurname = false;
  const sur = s(fields.surname);
  if (sur && taskName.length > sur.length && lc(taskName).endsWith(" " + lc(sur))) {
    fields.firstName = taskName.slice(0, taskName.length - sur.length).trim();
    nameIncludesSurname = true;
  } else {
    fields.firstName = taskName || null;
  }
  // Campi nuovi dal blocco in descrizione (solo se la lista non ha il campo omonimo)
  const block = parseHocBlock(task?.description ?? task?.text_content);
  if (block) {
    if (!byName.has(lc("Mansione attuale")) && "currentJob" in block) fields.currentJob = block.currentJob;
    if (!byName.has(lc("Partita IVA")) && "partitaIva" in block) fields.partitaIva = block.partitaIva;
  }
  return {
    fields,
    mirrors,
    clickupTaskId: s(task?.id) || null,
    clickupUrl: s(task?.url) || (task?.id ? `https://app.clickup.com/t/${task.id}` : null),
    clickupStatus: s(task?.status?.status) || null,
    // fase letta dallo stato del task; null = stato estraneo alle 5 fasi (es. "to do"): non tocca la fase
    statusPhase: phaseFromTaskStatus(task?.status?.status),
    dateUpdated: Number(task?.date_updated) || null,
    nameIncludesSurname,
    hocPersonId: block?.personId || null,
  };
}

// ── Persona → operazioni ClickUp ─────────────────────────────────────────────
/**
 * Corpo per POST /task/{id}/field/{field_id}.
 * @returns {{ body } | { remove: true } | { skip: string }}
 */
export function encodeFieldValue(meta, appType, value, choices = null) {
  if (appType === "users" || appType === "attachment" || appType === "fileRef") return { skip: "sola lettura" };
  const t = meta?.type;
  if (appType === "bool") {
    if (value == null) return { remove: true };
    if (t === "checkbox") return { body: { value: Boolean(value) } };
    if (t === "drop_down") {
      const o = optionsOf(meta).find((x) => wordToBool(optName(x)) === Boolean(value));
      return o ? { body: { value: o.id } } : { skip: "opzione sì/no assente su ClickUp" };
    }
    return { body: { value: value ? "Sì" : "No" } };
  }
  if (isEmptyValue(value)) return { remove: true };
  switch (t) {
    case "drop_down": {
      // con la tabella (fase, contratto) va bene l'opzione col nome inglese O italiano
      const c = choices ? findChoice(choices, value) : null;
      const names = (c ? [c.label, c.cu] : [value]).map(lc);
      const o = optionsOf(meta).find((x) => names.includes(lc(optName(x))));
      return o ? { body: { value: o.id } } : { skip: `"${s(value)}" non è tra le opzioni ClickUp` };
    }
    case "labels": {
      const opts = optionsOf(meta);
      const ids = [];
      const missing = [];
      for (const name of value) {
        const o = opts.find((x) => lc(optName(x)) === lc(name));
        if (o) ids.push(o.id); else missing.push(name);
      }
      if (!ids.length && missing.length) return { skip: `valori non presenti tra le opzioni ClickUp: ${missing.join(", ")}` };
      return { body: { value: ids }, missing };
    }
    case "date": {
      const ms = isoDateToMs(value);
      return ms ? { body: { value: ms, value_options: { time: false } } } : { skip: "data non valida" };
    }
    case "number": case "currency": return { body: { value: Number(value) } };
    case "phone": {
      // un numero che ClickUp non accetta NON deve bloccare tutta la scheda: si salta solo il campo
      const e = toE164(value);
      return e ? { body: { value: e } } : { skip: "numero senza prefisso internazionale (+…): ClickUp non lo accetta" };
    }
    case "location": {
      if (value.lat == null || value.lng == null) return { skip: "manca la posizione su mappa (lat/lng): testo nel blocco in descrizione" };
      return { body: { value: { location: { lat: Number(value.lat), lng: Number(value.lng) }, formatted_address: s(value.address) } } };
    }
    case "checkbox": return { body: { value: Boolean(value) } };
    case "users": case "attachment": return { skip: "sola lettura" };
    default: return { body: { value: s(value) } };
  }
}

/**
 * Nome dello stato della lista che corrisponde alla fase, o null (la lista non ha
 * quello stato: lo stato del task non si tocca). Accetta lo stato in italiano o in
 * inglese ("Attiva" o "active").
 */
export function statusForCollaboration(statuses = [], phase) {
  const names = taskStatusNamesFor(phase).map(lc);
  if (!names.length) return null;
  const hit = (statuses || []).find((st) => names.includes(lc(st?.status)));
  return hit ? hit.status : null;
}

/**
 * Controllo di parità (04/10/2026, Nicholas: "tutto quello che si vede sulla web app si
 * deve vedere anche su ClickUp, non devo accorgermene io"). Confronta la scheda dell'app col
 * task, campo per campo, e restituisce le chiavi che su ClickUp NON sono come in app.
 * Solo i campi che la lista ha davvero; esclusi: sola lettura, file, codice fiscale (cifrato
 * in app), indirizzo su mappa (ClickUp vuole lat/lng: il testo va nel blocco).
 * Telefoni ed email confrontati normalizzati; campi specchio sull'impronta del testo.
 */
export function clickupDrift(person, task, fieldsMeta = null) {
  const list = fieldsByName(fieldsMeta && fieldsMeta.length ? fieldsMeta : task?.custom_fields || []);
  const fromTask = taskToPerson(task);
  const app = person?.fields || {};
  const norm = (f, v) => {
    if (isEmptyValue(v)) return null;
    if (f.type === "phone") return toE164(v) || s(v);
    if (f.type === "email") return lc(v);
    return canonical(v);
  };
  const out = [];
  for (const f of FIELDS) {
    if (!f.cu || f.appOnly || f.readOnly || f.type === "fileRef" || f.type === "cf" || f.type === "location") continue;
    if (!list.has(lc(f.cu))) continue;
    if (JSON.stringify(norm(f, app[f.key])) !== JSON.stringify(norm(f, fromTask.fields[f.key]))) out.push(f.key);
  }
  for (const f of FIELDS) {
    if (!f.mirror || !list.has(lc(f.mirror))) continue;
    const a = mirrorPrint(mirrorText(f.key, app) || "");
    const b = fromTask.mirrors[f.key]?.print ?? mirrorPrint("");
    if (a !== b) out.push(f.key);
  }
  if (s(app.firstName) && lc(taskNameFor(person)) !== lc(s(task?.name))) out.push("firstName");
  return out;
}

/** Nome del task: il nome; "Nome Cognome" se il task lo aveva già così. */
export function taskNameFor(person) {
  const f = person.fields || {};
  const first = s(f.firstName);
  if (person.clickup?.nameIncludesSurname && s(f.surname)) return `${first} ${s(f.surname)}`.trim();
  return first || s(f.surname) || "Senza nome";
}

/**
 * Tutto ciò che serve per portare la persona su ClickUp.
 * @param person      persona app (fields in chiaro, CF escluso)
 * @param fieldsMeta  GET /list/{id}/field → fields
 * @param opts.keys   chiavi cambiate (default: tutte)
 * @param opts.cfPlain codice fiscale in chiaro (se la chiave c'è), solo per il campo dedicato
 * @param opts.statuses status della lista (GET /list/{id} → statuses)
 * @param opts.currentDescription descrizione attuale del task (per non perdere il testo sopra il blocco)
 * @returns {{ name, description, status, fieldOps: Array, skipped: Array }}
 */
export function personToClickup(person, fieldsMeta, { keys, cfPlain, statuses, currentDescription, currentTask = null } = {}) {
  const byName = fieldsByName(fieldsMeta);
  const want = keys ? new Set(keys) : null;
  const fieldOps = [];
  const skipped = [];
  for (const f of FIELDS) {
    if (!f.cu || f.appOnly || f.readOnly) continue;
    if (want && !want.has(f.key)) continue;
    const meta = byName.get(lc(f.cu));
    if (!meta) continue; // campo nuovo senza omonimo → va nel blocco in descrizione
    const value = f.type === "cf" ? (cfPlain === undefined ? undefined : cfPlain) : person.fields?.[f.key];
    if (value === undefined && f.type === "cf") { skipped.push({ key: f.key, reason: "chiave di cifratura assente" }); continue; }
    if (f.type === "users") {
      // ClickUp vuole { add, rem } rispetto a chi c'è già sul task
      const want = (Array.isArray(value) ? value : []).map((u) => s(u.id)).filter(Boolean);
      const curF = (currentTask?.custom_fields || []).find((x) => x.id === meta.id);
      const have = (Array.isArray(curF?.value) ? curF.value : []).map((u) => s(u.id)).filter(Boolean);
      const add = want.filter((x) => !have.includes(x));
      const rem = have.filter((x) => !want.includes(x));
      if (!add.length && !rem.length) continue;
      fieldOps.push({ key: f.key, fieldId: meta.id, body: { value: { add: add.map(Number), rem: rem.map(Number) } }, effective: Array.isArray(value) ? value : [] });
      continue;
    }
    const enc = encodeFieldValue(meta, f.type === "cf" ? "text" : f.type, value, f.choices || null);
    if (enc.skip) { skipped.push({ key: f.key, reason: enc.skip }); continue; }
    if (enc.missing?.length) skipped.push({ key: f.key, reason: `ignorati (non tra le opzioni ClickUp): ${enc.missing.join(", ")}` });
    // effective = il valore che ClickUp terrà davvero dopo la scrittura (base anti-ritorno)
    const effective = enc.remove ? null : enc.missing?.length ? value.filter((x) => !enc.missing.includes(x)) : value;
    fieldOps.push(enc.remove ? { key: f.key, fieldId: meta.id, remove: true, effective } : { key: f.key, fieldId: meta.id, body: enc.body, effective });
  }
  for (const f of FIELDS) {
    if (!f.mirror) continue;
    if (want && !want.has(f.key) && !(f.key === "residenceCap" && want.has("residenceComune"))) continue;
    const meta = byName.get(lc(f.mirror));
    if (!meta) continue; // senza campo dedicato resta la riga nel blocco in descrizione
    const text = mirrorText(f.key, person.fields || {});
    const effective = person.fields?.[f.key] ?? null;
    // print = impronta del TESTO scritto: per i campi specchio eco e base si confrontano sul testo
    const print = mirrorPrint(text);
    fieldOps.push(text ? { key: f.key, fieldId: meta.id, body: { value: text }, effective, print } : { key: f.key, fieldId: meta.id, remove: true, effective, print });
  }
  const description = withHocBlock(currentDescription || "", hocBlockLines(person, byName, { cfPlain }));
  const status = statusForCollaboration(statuses, person.fields?.collaborationStatus);
  // campi nuovi rappresentati nel blocco in descrizione (letti indietro da parseHocBlock)
  const blockKeys = ["currentJob", "partitaIva"].filter((k) => !byName.has(lc(FIELD_BY_KEY[k].cu)));
  return { name: taskNameFor(person), description, status, fieldOps, skipped, blockKeys };
}

/** Payload di POST /list/{id}/task (creazione): i "remove" non servono. */
export function createTaskPayload(plan) {
  const payload = {
    name: plan.name,
    description: plan.description,
    custom_fields: plan.fieldOps.filter((o) => !o.remove).map((o) => ({ id: o.fieldId, ...o.body })),
  };
  if (plan.status) payload.status = plan.status;
  return payload;
}

/** Nomi dei campi ClickUp che la mappa usa (per la pagina di stato). */
export function expectedFieldNames() {
  return [
    ...FIELDS.filter((f) => f.cu).map((f) => ({ key: f.key, name: f.cu, extra: Boolean(f.extra) })),
    // campi specchio: se mancano, il dato va nel blocco in descrizione (sola lettura lì)
    ...FIELDS.filter((f) => f.mirror).map((f) => ({ key: f.key, name: f.mirror, extra: true, mirror: true })),
  ];
}

/** Da un history_item del webhook alla chiave app (o null). */
export function historyItemKey(item, fieldsMeta = []) {
  if (!item) return null;
  if (item.field === "name") return "firstName";
  if (item.field === "content") return "_description";
  // stato del task (evento taskStatusUpdated): porta la fase
  if (item.field === "status") return "_status";
  const cfId = s(item.custom_field?.id || (item.field === "custom_field" ? item.custom_field_id : ""));
  const name = s(item.custom_field?.name) || s((fieldsMeta || []).find((m) => s(m.id) === cfId)?.name);
  if (!name) return null;
  // campi ClickUp "veri" e campi specchio (03/10: anche questi si modificano da ClickUp)
  const f = FIELDS.find((x) => x.cu && lc(x.cu) === lc(name)) || FIELDS.find((x) => x.mirror && lc(x.mirror) === lc(name));
  return f ? f.key : null;
}

/** Timestamp per campo dagli history_items (il più recente per chiave). */
export function incomingTimestamps(historyItems = [], fieldsMeta = [], fallback = Date.now()) {
  const out = { _default: fallback };
  for (const it of historyItems || []) {
    let key = historyItemKey(it, fieldsMeta);
    if (!key) continue;
    const at = Number(it.date) || fallback;
    const keys = key === "_description" ? ["currentJob", "partitaIva"] : [key];
    for (const k of keys) out[k] = Math.max(Number(out[k] || 0), at);
  }
  return out;
}

export { FIELD_BY_KEY };
