/**
 * Esperienza del modulo HR pubblico (/hr/modulo/[token]), 03/10/2026.
 *
 * Logica PURA (niente React, niente Node): la usa la pagina del modulo e la
 * testa tests/hr-people.mjs. Quattro pezzi:
 *  1. avanzamento a parole ("Ancora 3 capitoli", "Ultimo capitolo") e stima
 *     del tempo per l'intro;
 *  2. errori gentili PER CAMPO (sotto il campo, non solo in cima), anche
 *     ricavati dal messaggio del server (`Etichetta: problema.`);
 *  3. bozza nel browser: risposte + capitolo + stadio, MAI il codice fiscale
 *     (dato sensibile: si riscrive);
 *  4. accesso a localStorage sempre protetto (in navigazione privata può
 *     lanciare: il modulo deve funzionare lo stesso).
 */
import { FIELD_BY_KEY, FORM_KEYS, validateCodiceFiscale } from "./hr-fields.js";

// ── 1. Avanzamento ────────────────────────────────────────────────────────────

/** "Ancora 3 capitoli" (il capitolo corrente è compreso), "Ultimo capitolo" sull'ultimo. */
export function progressWords(step, total) {
  const left = total - step; // capitoli da fare, compreso questo
  if (left <= 1) return "Ultimo capitolo";
  return `Ancora ${left} capitoli`;
}

/**
 * Minuti stimati per capitolo [min, max], nell'ordine dei capitoli del modulo.
 * Stima a tavolino (non misurata): le competenze e le lingue sono i capitoli
 * lunghi, privacy e contatti i corti. Da ritoccare quando avremo tempi veri.
 */
export const CHAPTER_MINUTES = [[1, 2], [1, 1], [0.5, 1], [1, 1.5], [1.5, 2.5], [0.5, 1], [0.5, 1]];

/** "Ci vogliono tra 6 e 10 minuti." — onesta: un intervallo, non un numero tondo. */
export function timeEstimateText(minutes = CHAPTER_MINUTES) {
  const lo = Math.max(1, Math.round(minutes.reduce((a, m) => a + m[0], 0)));
  const hi = Math.max(lo, Math.round(minutes.reduce((a, m) => a + m[1], 0)));
  return lo === hi ? `Ci vogliono circa ${lo} minuti.` : `Ci vogliono tra ${lo} e ${hi} minuti.`;
}

// ── 2. Errori per campo ───────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Messaggi gentili, uno per campo. Solo i campi in `keys` (quelli del capitolo). */
export function fieldErrors(data = {}, keys = FORM_KEYS, { cfEnabled = true } = {}) {
  const out = {};
  const has = (k) => keys.includes(k);
  if (has("firstName") && !String(data.firstName || "").trim()) {
    out.firstName = "Ci serve almeno il tuo nome: scrivilo qui.";
  }
  if (has("codiceFiscale") && cfEnabled && String(data.codiceFiscale || "").trim()) {
    const r = validateCodiceFiscale(data.codiceFiscale);
    if (!r.ok) out.codiceFiscale = `Il codice fiscale non sembra giusto. ${r.error}`;
  }
  if (has("personalEmail")) {
    const v = String(data.personalEmail || "").trim();
    if (v && !EMAIL_RE.test(v)) out.personalEmail = "Questo indirizzo email non sembra completo: controlla la chiocciola e il punto.";
  }
  if (has("personalPhone")) {
    const v = String(data.personalPhone || "").trim();
    if (v && v.replace(/[^\d]/g, "").length < 7) out.personalPhone = "Il numero sembra troppo corto: controlla di averlo scritto tutto.";
  }
  return out;
}

/**
 * Dal messaggio del server ("Email personale: indirizzo non valido. Nome: obbligatorio.")
 * ai campi del modulo. Le parti che non si riconoscono restano in `rest`.
 */
export function fieldErrorsFromServer(message, keys = FORM_KEYS) {
  const msg = String(message || "");
  const errors = {};
  let rest = msg;
  // etichette più lunghe prima ("Telefono personale" prima di "Telefono")
  const byLabel = keys.map((k) => [k, FIELD_BY_KEY[k]?.label]).filter(([, l]) => l).sort((a, b) => b[1].length - a[1].length);
  for (const [k, label] of byLabel) {
    const re = new RegExp(`(?:^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: ([^]*?\\.)(?=\\s|$)`);
    const m = rest.match(re);
    if (!m) continue;
    errors[k] = gentle(m[1]);
    rest = rest.replace(m[0], " ");
  }
  return { errors, rest: rest.replace(/\s+/g, " ").trim() };
}

function gentle(problem) {
  const p = String(problem || "").trim();
  if (/^obbligatorio\.?$/i.test(p)) return "Ci serve questo dato: scrivilo qui.";
  return `Controlla questo campo: ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
}

/** Indice del primo capitolo che contiene uno dei campi con errore (-1 se nessuno). */
export function firstStepWithError(steps, errors) {
  const bad = Object.keys(errors || {});
  return steps.findIndex((s) => (s.keys || []).some((k) => bad.includes(k)));
}

// ── 3. Bozza nel browser ──────────────────────────────────────────────────────

export const DRAFT_VERSION = 1;
export const DRAFT_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
// mai nel browser: dato sensibile, si riscrive
export const DRAFT_EXCLUDED_KEYS = ["codiceFiscale"];

export function draftKey(token) {
  return `hoc:hr-modulo:${String(token || "")}`;
}

/** Bozza da salvare: solo campi del modulo, mai il codice fiscale. */
export function serializeDraft({ data = {}, step = 0, stage = "form" } = {}, now = Date.now()) {
  const clean = {};
  for (const k of FORM_KEYS) {
    if (DRAFT_EXCLUDED_KEYS.includes(k)) continue;
    if (data[k] !== undefined) clean[k] = data[k];
  }
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, stage, step, data: clean });
}

/** Bozza letta: null se assente, rotta, vecchia, di un'altra versione o senza capitolo valido. */
export function parseDraft(raw, { steps, now = Date.now() } = {}) {
  if (!raw) return null;
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d || typeof d !== "object" || d.v !== DRAFT_VERSION) return null;
  if (!Number.isFinite(d.savedAt) || now - d.savedAt > DRAFT_MAX_AGE_MS) return null;
  if (d.stage !== "form") return null;
  const step = Number.isInteger(d.step) && d.step >= 0 && (!steps || d.step < steps) ? d.step : null;
  if (step == null) return null;
  const data = {};
  for (const k of FORM_KEYS) {
    if (DRAFT_EXCLUDED_KEYS.includes(k)) continue;
    if (d.data && d.data[k] !== undefined) data[k] = d.data[k];
  }
  return { stage: "form", step, data, savedAt: d.savedAt };
}

/** Vale la pena salvare? Solo se c'è almeno una risposta o si è oltre il primo capitolo. */
export function draftWorthSaving({ data = {}, step = 0 } = {}) {
  if (step > 0) return true;
  return FORM_KEYS.some((k) => {
    if (DRAFT_EXCLUDED_KEYS.includes(k)) return false;
    const v = data[k];
    if (v == null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return String(v).trim() !== "";
  });
}

// ── 4. localStorage protetto ──────────────────────────────────────────────────

function store() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
export function safeGet(key, s = store()) {
  try { return s ? s.getItem(key) : null; } catch { return null; }
}
export function safeSet(key, value, s = store()) {
  try { if (s) s.setItem(key, value); return Boolean(s); } catch { return false; }
}
export function safeRemove(key, s = store()) {
  try { if (s) s.removeItem(key); } catch { /* navigazione privata: niente da togliere */ }
}

// ── 5. Il messaggio della Casa, sotto la tessera finale ───────────────────────
// Testo PROPOSTO (03/10/2026), da rivedere con Nicholas: si cambia solo qui.
export const HOUSE_LETTER = {
  text: "Da oggi fai parte di House of Creators. Qui si cresce insieme: ogni progetto, ogni creator, ogni risultato passa da persone come te.",
  signature: "Nicholas",
  org: "House of Creators",
};
