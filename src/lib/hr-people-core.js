/**
 * Centro HR, fase 1 — logica PURA del CRM persone (29/09/2026).
 *
 * Niente KV, niente rete, niente env: solo funzioni deterministiche, così
 * tests/hr-people.mjs le prova senza mock. Il lato server (KV, cifratura,
 * ClickUp) sta in hr-people.js; il mapping con ClickUp in hr-clickup-map.js.
 *
 * HOC Pro è il MASTER: ogni campo ha il suo `fieldUpdatedAt` e in caso di
 * modifiche concorrenti (app vs ClickUp) vince l'ultima modifica PER CAMPO,
 * non per scheda — due persone che toccano due campi diversi non si
 * cancellano a vicenda.
 */
import { normalizeSkillMap, normalizeLearnList, normalizePastRoles, clickupSkillLabels, skillName, pastRoleText } from "./hr-skills.js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FIELDS, FIELD_BY_KEY, EDITABLE_KEYS, validateCodiceFiscale, findChoice, SOURCE_REFERRAL } from "./hr-fields.js";

// Schema e codice fiscale vivono in hr-fields.js (senza dipendenze Node: li
// importano anche le pagine client). Qui si riesportano per comodità.
export * from "./hr-fields.js";

// ── Normalizzazione ─────────────────────────────────────────────────────────
const s = (v) => (v == null ? "" : String(v)).trim();

export function normEmail(v) {
  const e = s(v).toLowerCase();
  return e || null;
}
/** Solo cifre, con + iniziale se c'era: "+39 333 12 34 567" → "+393331234567". */
export function normPhone(v) {
  const raw = s(v);
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  return (raw.startsWith("+") || raw.startsWith("00") ? "+" : "") + digits.replace(/^00/, "");
}
/** Chiave di confronto del telefono: ultime 9 cifre (ignora prefisso internazionale). */
export function phoneKey(v) {
  const d = s(v).replace(/[^\d]/g, "");
  return d.length >= 7 ? d.slice(-9) : null;
}
/** Nome per confronto: minuscolo, senza accenti, spazi compattati. */
export function normName(v) {
  return s(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function fullName(fields = {}) {
  return [s(fields.firstName), s(fields.surname)].filter(Boolean).join(" ");
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(v) {
  if (!DATE_RE.test(s(v))) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Valore "vuoto" in senso di scheda: null, "", [], oggetto location senza indirizzo. */
export function isEmptyValue(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object" && "address" in v) return !s(v.address) && v.lat == null;
  return false;
}

/** Forma canonica per confronti e hash (array come insiemi ordinati). */
export function canonical(v) {
  if (isEmptyValue(v)) return null;
  if (Array.isArray(v)) {
    // oggetti senza id/titolo/nome (es. ruoli passati {role, duration}): si confronta tutto il contenuto
    return v.map((x) => (x && typeof x === "object" ? s(x.id || x.title || x.name) || JSON.stringify(Object.keys(x).sort().map((k) => [k, x[k]])) : s(x))).filter(Boolean).sort();
  }
  if (typeof v === "object") {
    if ("address" in v) return { address: s(v.address), lat: v.lat ?? null, lng: v.lng ?? null };
    if ("attachmentId" in v) return { attachmentId: s(v.attachmentId) };
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
  }
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v;
  return s(v);
}
export function valuesEqual(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
/** Impronta di un valore (sha256 troncato): mai il valore in chiaro in KV, nemmeno per l'anti-loop. */
export function valueHash(v) {
  return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex").slice(0, 32);
}

/**
 * Base "ultimo valore noto su ClickUp" per campo (merge a 3 vie). Se il valore
 * in arrivo è uguale alla base, su ClickUp quel campo NON è cambiato dall'ultima
 * sincronizzazione: non deve toccare l'app, qualunque sia il timestamp del task.
 * Serve per i valori che ClickUp non sa tenere (etichetta non tra le opzioni,
 * posizione senza coordinate): senza base tornerebbero indietro e
 * cancellerebbero il valore più ricco dell'app.
 * `prints` (facoltativo) = { key: impronta } da usare al posto di valueHash(valore).
 * @returns {{ incoming: object, unchanged: string[] }}
 */
export function dropUnchangedSinceBase(incoming = {}, base = {}, prints = {}) {
  const out = {};
  const unchanged = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    // prints[k] = impronta già calcolata (campi specchio: impronta del TESTO, vedi hr-mirror.js)
    const h = prints && prints[k] !== undefined ? prints[k] : valueHash(v);
    if (base && base[k] !== undefined && base[k] === h) { unchanged.push(k); continue; }
    out[k] = v;
  }
  return { incoming: out, unchanged };
}

// ── Validazione input (app e modulo) ────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asList = (v) => (Array.isArray(v) ? v : s(v) ? s(v).split(",") : []).map(s).filter(Boolean);

/**
 * Pulisce e valida le modifiche. Accetta solo le `allowed` key.
 * Il codice fiscale esce in chiaro in `cf` (lo cifra il server), mai in `values`.
 * @returns {{ values: object, cf: string|null|undefined, errors: string[] }}
 */
export function normalizePersonInput(input = {}, allowed = EDITABLE_KEYS) {
  const values = {};
  const errors = [];
  let cf;
  for (const key of allowed) {
    if (!(key in input)) continue;
    const f = FIELD_BY_KEY[key];
    if (!f || f.readOnly) continue;
    const raw = input[key];
    switch (f.type) {
      case "text": case "longtext": {
        const v = s(raw).slice(0, f.max || (f.type === "longtext" ? 4000 : 300));
        values[key] = v || null;
        break;
      }
      case "email": {
        const v = normEmail(raw);
        if (v && !EMAIL_RE.test(v)) errors.push(`${f.label}: indirizzo non valido.`);
        else values[key] = v;
        break;
      }
      case "phone": {
        const v = normPhone(raw);
        if (v && v.replace("+", "").length < 7) errors.push(`${f.label}: numero troppo corto.`);
        else values[key] = v;
        break;
      }
      case "url": {
        const v = s(raw);
        if (v && !/^https?:\/\//i.test(v)) values[key] = `https://${v}`;
        else values[key] = v || null;
        break;
      }
      case "date": {
        const v = s(raw);
        if (v && !isIsoDate(v)) errors.push(`${f.label}: data non valida.`);
        else values[key] = v || null;
        break;
      }
      case "number": {
        if (raw === "" || raw == null) { values[key] = null; break; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) errors.push(`${f.label}: numero non valido.`);
        else values[key] = Math.round(n);
        break;
      }
      case "bool": {
        values[key] = raw === true || raw === "true" || raw === "si" || raw === "sì" ? true : raw === false || raw === "false" || raw === "no" ? false : null;
        break;
      }
      case "option": {
        if (f.choices) {
          // fase / contratto: si accetta il nome italiano o l'opzione ClickUp, si salva l'italiano;
          // le voci non selezionabili ("Da verificare") non si scelgono
          if (!s(raw)) { values[key] = null; break; }
          const c = findChoice(f.choices, raw);
          if (!c || c.selectable === false) errors.push(`${f.label}: valore non previsto.`);
          else values[key] = c.label;
          break;
        }
        const v = s(raw);
        if (v && f.options && !f.options.includes(v)) errors.push(`${f.label}: valore non previsto.`);
        else values[key] = v || null;
        break;
      }
      case "labels": {
        values[key] = [...new Set(asList(raw))].slice(0, 40);
        break;
      }
      case "location": {
        const addr = typeof raw === "object" && raw ? s(raw.address) : s(raw);
        const lat = typeof raw === "object" && raw && Number.isFinite(Number(raw.lat)) && raw.lat !== null && raw.lat !== "" ? Number(raw.lat) : null;
        const lng = typeof raw === "object" && raw && Number.isFinite(Number(raw.lng)) && raw.lng !== null && raw.lng !== "" ? Number(raw.lng) : null;
        values[key] = addr || lat != null ? { address: addr.slice(0, 300), lat, lng } : null;
        break;
      }
      case "comune": {
        const o = raw && typeof raw === "object" ? raw : null;
        if (o?.abroad) { values[key] = s(o.country) ? { abroad: true, country: s(o.country).slice(0, 60), city: s(o.city).slice(0, 80) } : null; break; }
        values[key] = o && s(o.name) ? { name: s(o.name).slice(0, 80), prov: s(o.prov).slice(0, 4), code: s(o.code).slice(0, 4), region: s(o.region).slice(0, 40) } : null;
        break;
      }
      case "birth": {
        const o = raw && typeof raw === "object" ? raw : null;
        if (!o) { values[key] = null; break; }
        values[key] = o.abroad
          ? (s(o.country) ? { abroad: true, country: s(o.country).slice(0, 60) } : null)
          : (s(o.name) ? { abroad: false, name: s(o.name).slice(0, 80), prov: s(o.prov).slice(0, 4), code: s(o.code).slice(0, 4) } : null);
        break;
      }
      case "skillmap": {
        values[key] = normalizeSkillMap(raw);
        // il campo "Skills" di ClickUp segue: solo le voci che hanno un'etichetta equivalente
        if (!("skills" in input)) values.skills = clickupSkillLabels(values[key]);
        break;
      }
      case "learn": {
        values[key] = normalizeLearnList(raw, 2);
        break;
      }
      case "roles": {
        values[key] = normalizePastRoles(raw);
        break;
      }
      case "cf": {
        const v = s(raw);
        if (!v) { cf = null; break; }
        const r = validateCodiceFiscale(v);
        if (!r.ok) errors.push(`${f.label}: ${r.error}`);
        else cf = r.value;
        break;
      }
      default: break;
    }
  }
  if ("firstName" in values && !values.firstName) errors.push("Nome: obbligatorio.");
  // "Segnalato da" ha senso solo per chi è arrivato da una reference: se nello stesso
  // invio la provenienza è un'altra, il nome si scarta (resta il dato coerente).
  if ("source" in values && values.source !== SOURCE_REFERRAL && "referredBy" in values) values.referredBy = null;
  return { values, cf, errors };
}

// ── Diff e storico ──────────────────────────────────────────────────────────
/** Chiavi che cambiano davvero (confronto canonico). */
export function diffKeys(current = {}, next = {}) {
  return Object.keys(next).filter((k) => !valuesEqual(current[k], next[k]));
}

/** Valore da mettere nel log: mai il codice fiscale in chiaro, testi lunghi tagliati. */
export function logValue(key, v) {
  if (FIELD_BY_KEY[key]?.sensitive) return v == null || v === "" ? null : "••• (cifrato)";
  if (isEmptyValue(v)) return null;
  const type = FIELD_BY_KEY[key]?.type;
  if (type === "skillmap" && typeof v === "object") return Object.entries(normalizeSkillMap(v)).map(([k, l]) => `${skillName(k)} (${l})`).join(", ").slice(0, 300) || null;
  if (type === "learn" && Array.isArray(v)) return v.map(skillName).join(", ").slice(0, 300);
  if (type === "roles" && Array.isArray(v)) return v.map(pastRoleText).join(", ").slice(0, 300);
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? x.name || x.title || x.id : x)).join(", ").slice(0, 300);
  if (typeof v === "object") return s(v.address || v.title || JSON.stringify(v)).slice(0, 300);
  return s(v).slice(0, 300);
}

/**
 * Applica valori a una persona (immutabile) e produce le righe di storico.
 * @returns {{ person, changed: string[], log: object[] }}
 */
export function applyChanges(person, values, { at, by, source, action = "update" }) {
  const fields = { ...(person.fields || {}) };
  const fieldUpdatedAt = { ...(person.fieldUpdatedAt || {}) };
  const changed = [];
  const log = [];
  for (const [k, v] of Object.entries(values)) {
    if (valuesEqual(fields[k], v)) continue;
    log.push({ at, by, source, action, field: k, from: logValue(k, fields[k]), to: logValue(k, v) });
    fields[k] = v;
    fieldUpdatedAt[k] = at;
    changed.push(k);
  }
  return { person: { ...person, fields, fieldUpdatedAt, updatedAt: changed.length ? at : person.updatedAt }, changed, log };
}

// ── Conflitti: vince l'ultima modifica PER CAMPO ─────────────────────────────
/**
 * @param current   { fields, fieldUpdatedAt } della persona in app
 * @param incoming  valori da ClickUp (chiavi assenti = campo non presente sulla lista → ignorate)
 * @param incomingAt timestamp per campo { key: ms } oppure numero unico (date_updated del task)
 * @returns {{ apply: object, keepApp: string[], same: string[] }}
 *   apply   = valori ClickUp più recenti da scrivere in app
 *   keepApp = campi in cui l'app è più recente: il valore dell'app va rimandato a ClickUp
 */
export function resolveFieldConflicts(current, incoming, incomingAt) {
  const apply = {};
  const keepApp = [];
  const same = [];
  const cur = current?.fields || {};
  const upd = current?.fieldUpdatedAt || {};
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v === undefined) continue;
    if (valuesEqual(cur[k], v)) { same.push(k); continue; }
    const tIn = typeof incomingAt === "number" ? incomingAt : Number(incomingAt?.[k] ?? incomingAt?._default ?? 0);
    const tApp = Number(upd[k] || 0);
    // pari merito → vince ClickUp solo se l'app non ha mai toccato il campo
    if (tIn > tApp || (tIn === tApp && !tApp)) apply[k] = v;
    else keepApp.push(k);
  }
  return { apply, keepApp, same };
}

// ── Anti-loop del webhook ───────────────────────────────────────────────────
export const ECHO_WINDOW_MS = 20_000;

/**
 * Registra le scritture fatte da HOC Pro verso ClickUp: { key: { h, at } }.
 * `prints` (facoltativo) = impronte già calcolate (campi specchio: il TESTO scritto).
 */
export function recordEcho(echo = {}, values = {}, at, prints = {}) {
  const out = { ...echo };
  for (const [k, v] of Object.entries(values)) out[k] = { h: prints && prints[k] !== undefined ? prints[k] : valueHash(v), at };
  return out;
}

/**
 * Un valore in arrivo da ClickUp è l'eco di una NOSTRA scrittura recente?
 * Sì se nella finestra abbiamo scritto proprio quel valore su quel campo.
 */
export function isOwnEcho(echo, key, incomingValue, now, windowMs = ECHO_WINDOW_MS, print) {
  const e = echo?.[key];
  if (!e) return false;
  if (now - Number(e.at || 0) > windowMs) return false;
  return e.h === (print !== undefined ? print : valueHash(incomingValue));
}

/**
 * Filtra i valori in arrivo dal webhook: toglie quelli uguali all'app (niente da
 * fare) e quelli che sono l'eco di una nostra scrittura (anti-loop).
 * @returns {{ incoming: object, echoes: string[] }}
 */
export function filterEchoes(currentFields, incoming, echo, now, windowMs = ECHO_WINDOW_MS, prints = {}) {
  const out = {};
  const echoes = [];
  for (const [k, v] of Object.entries(incoming || {})) {
    if (v === undefined) continue;
    if (valuesEqual(currentFields?.[k], v)) continue;
    if (isOwnEcho(echo, k, v, now, windowMs, prints?.[k])) { echoes.push(k); continue; }
    out[k] = v;
  }
  return { incoming: out, echoes };
}

// ── Firma webhook ClickUp (X-Signature = HMAC-SHA256 hex del corpo grezzo) ────
export function signClickupBody(rawBody, secret) {
  return createHmac("sha256", String(secret)).update(rawBody, "utf8").digest("hex");
}
export function verifyClickupSignature(rawBody, signature, secret) {
  if (!secret || !signature || typeof rawBody !== "string") return false;
  const expected = Buffer.from(signClickupBody(rawBody, secret), "utf8");
  const got = Buffer.from(String(signature).trim().toLowerCase(), "utf8");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

// ── Doppioni e schede spazzatura ────────────────────────────────────────────
/** Scheda spazzatura: nome di 1-2 caratteri (o vuoto) e nessuna email. */
export function isJunk(person) {
  const f = person?.fields || {};
  const name = normName(fullName(f)).replace(/\s/g, "");
  const noEmail = !normEmail(f.personalEmail) && !normEmail(f.companyEmail);
  return name.length <= 2 && noEmail;
}

/**
 * Gruppi di doppioni probabili: stessa email personale, stesso telefono
 * personale (ultime 9 cifre) o stesso nome+cognome. Niente viene cancellato:
 * si segnala e basta.
 * @returns {Array<{ ids: string[], reasons: string[] }>}
 */
export function detectDuplicates(people = []) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const reasonsByPair = [];
  for (const p of people) parent.set(p.id, p.id);
  const buckets = { email: new Map(), telefono: new Map(), nome: new Map() };
  for (const p of people) {
    const f = p.fields || {};
    const e = normEmail(f.personalEmail);
    const ph = phoneKey(f.personalPhone);
    const nm = f.surname ? normName(fullName(f)) : null; // senza cognome il nome da solo è troppo debole
    if (e) (buckets.email.get(e) || buckets.email.set(e, []).get(e)).push(p.id);
    if (ph) (buckets.telefono.get(ph) || buckets.telefono.set(ph, []).get(ph)).push(p.id);
    if (nm && nm.length > 3) (buckets.nome.get(nm) || buckets.nome.set(nm, []).get(nm)).push(p.id);
  }
  for (const [reason, map] of Object.entries(buckets)) {
    for (const ids of map.values()) {
      if (ids.length < 2) continue;
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
      reasonsByPair.push({ ids, reason });
    }
  }
  const groups = new Map();
  for (const p of people) {
    const r = find(p.id);
    if (!groups.has(r)) groups.set(r, { ids: [], reasons: new Set() });
    groups.get(r).ids.push(p.id);
  }
  for (const { ids, reason } of reasonsByPair) groups.get(find(ids[0])).reasons.add(reason);
  return [...groups.values()].filter((g) => g.ids.length > 1).map((g) => ({ ids: g.ids.sort(), reasons: [...g.reasons].sort() }));
}

/** Vista "Da ripulire": { byId: { id: ['doppione'|'spazzatura'] }, duplicates, junk }. Le archiviate non contano. */
export function computeCleanup(all = []) {
  const people = all.filter((p) => p && !p.archived);
  const duplicates = detectDuplicates(people);
  const junk = people.filter(isJunk).map((p) => p.id);
  const byId = {};
  for (const g of duplicates) for (const id of g.ids) (byId[id] ||= []).push("doppione");
  for (const id of junk) (byId[id] ||= []).push("spazzatura");
  return { byId, duplicates, junk };
}

// ── Modulo pubblico: token ──────────────────────────────────────────────────
export const FORM_TTL_DAYS = 14;
export const FORM_UPLOAD_GRACE_MS = 60 * 60 * 1000; // dopo l'invio, 1h per caricare i file

/**
 * Stato di un token del modulo a un certo istante.
 *  - "invalid"  inesistente
 *  - "disabled" link condiviso disattivato o sostituito da uno nuovo
 *  - "open"     si può compilare (il link condiviso resta SEMPRE open: ogni invio crea una scheda nuova)
 *  - "submitted" inviato, finestra di 1h per i file · "closed" poi chiuso · "expired" scaduto (link personale)
 */
export function formTokenState(rec, now) {
  if (!rec) return "invalid";
  if (rec.disabledAt) return "disabled";
  if (rec.shared) return "open";
  if (rec.submittedAt) return now - rec.submittedAt <= FORM_UPLOAD_GRACE_MS ? "submitted" : "closed";
  if (now > Number(rec.expiresAt || 0)) return "expired";
  return "open";
}

// ── File caricati dal modulo ────────────────────────────────────────────────
const MAGIC = [
  { type: "application/pdf", ext: "pdf", test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
];
/** Tipo reale dai primi byte (non dall'estensione dichiarata). */
export function sniffFileType(bytes) {
  if (!bytes || bytes.length < 4) return null;
  return MAGIC.find((m) => m.test(bytes)) || null;
}
