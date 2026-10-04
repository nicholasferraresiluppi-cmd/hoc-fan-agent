/**
 * Carta di benvenuto della Casa (fine del modulo HR, 03/10/2026).
 *
 * Logica PURA (niente React, niente Node): la usa la pagina /hr/modulo/[token]
 * e la testa tests/hr-people.mjs.
 *
 * Regole (dal titolare):
 *  - è una carta di BENVENUTO, non una valutazione: nessun voto o punteggio
 *    numerico sulla persona; le "statistiche" sono solo ciò che la persona ha
 *    dichiarato (aree di competenza col livello, lingue, città);
 *  - il genere del titolo viene SOLO dal campo `gender` compilato dalla
 *    persona, mai dedotto dal nome; non indicato o altra opzione → forma neutra;
 *  - meno dati = meno righe, mai segnaposto finti;
 *  - nessun numero di membro (non si dichiara quanti siamo).
 */
import { SKILL_AREAS, normalizeSkillMap, levelRank } from "./hr-skills.js";

const FEMALE = new Set(["female", "femmina", "donna", "f"]);
const MALE = new Set(["male", "maschio", "uomo", "m"]);

/** "f" | "m" | null, solo dal valore dichiarato (opzioni GENDERS o le etichette ClickUp equivalenti). */
export function genderForm(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (FEMALE.has(g)) return "f";
  if (MALE.has(g)) return "m";
  return null;
}

/** "Benvenuta in House of Creators, Giulia." / "Benvenuto in …" / "Ti diamo il benvenuto in …" (testi scelti da Nicholas 03/10) */
export function welcomeTitle({ firstName, gender } = {}) {
  const name = String(firstName || "").trim();
  const tail = name ? `, ${name}.` : ".";
  const form = genderForm(gender);
  if (form === "f") return `Benvenuta in House of Creators${tail}`;
  if (form === "m") return `Benvenuto in House of Creators${tail}`;
  return `Ti diamo il benvenuto in House of Creators${tail}`;
}

/** Iniziali (al posto del punteggio FIFA): nome + cognome, oppure solo il nome. */
export function cardInitials({ firstName, surname } = {}) {
  const a = String(firstName || "").trim();
  const b = String(surname || "").trim();
  return ((a ? a[0] : "") + (b ? b[0] : "")).toUpperCase();
}

/** Ruolo abbreviato sotto le iniziali: "CHAT" per i chatter, altrimenti le prime lettere della mansione. */
export function roleAbbr(currentJob) {
  const s = String(currentJob || "").trim();
  if (!s) return "";
  if (/chat/i.test(s)) return "CHAT";
  const word = s.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z]+/).find(Boolean) || "";
  return word.slice(0, 5).toUpperCase();
}

/** Nome nella banda: "Giulia R." */
export function cardName({ firstName, surname } = {}) {
  const a = String(firstName || "").trim();
  const b = String(surname || "").trim();
  if (!a) return "";
  return b ? `${a} ${b[0].toUpperCase()}.` : a;
}

const AREA_ABBR = { of: "ONLY", ads: "ADS", social: "SOCIAL", content: "CONT", ai: "AI", tech: "TECH", mgmt: "GEST" };
const LEVEL_ABBR = { Base: "BASE", Autonomo: "AUT", Esperto: "ESP", "Posso insegnarla": "INS" };
const LANG_LEVEL_ABBR = { Native: "MADRE", Professional: "PRO", Basic: "BASE" };

/** Aree dichiarate, ordinate dalla più forte: livello massimo nell'area, poi numero di voci. */
export function strongestAreas(skillLevels) {
  const map = normalizeSkillMap(skillLevels);
  const out = [];
  for (const a of SKILL_AREAS) {
    const levels = a.skills.map((x) => map[x.key]).filter(Boolean);
    if (!levels.length) continue;
    const top = levels.reduce((best, l) => (levelRank(l) > levelRank(best) ? l : best), levels[0]);
    out.push({ area: a.key, label: AREA_ABBR[a.key] || a.key.toUpperCase(), level: top, value: LEVEL_ABBR[top] || top, count: levels.length });
  }
  return out.sort((x, y) => levelRank(y.level) - levelRank(x.level) || y.count - x.count);
}

/** "ENG - B2" → { label: "ENG", value: "B2" }; "ITA - Native" → { label: "ITA", value: "MADRE" }. */
export function languageStat(label) {
  const [code, lvl] = String(label || "").split(" - ").map((s) => s.trim());
  if (!code) return null;
  return { label: code.toUpperCase().slice(0, 4), value: lvl ? (LANG_LEVEL_ABBR[lvl] || lvl.toUpperCase().slice(0, 5)) : "" };
}

/** Città dichiarata (Italia: comune; estero: città o paese). */
export function cityOf(residenceComune) {
  const rc = residenceComune;
  if (!rc || typeof rc !== "object") return "";
  if (rc.abroad) return String(rc.city || "").trim() || String(rc.country || "").trim();
  return String(rc.name || "").trim();
}

/**
 * Fino a 6 "statistiche": aree più forti (fino a 3), lingue (fino a 2), città;
 * se avanza spazio, altre aree. Solo dati dichiarati, nessun riempitivo.
 */
export function cardStats(data = {}) {
  const areas = strongestAreas(data.skillLevels).map((a) => ({ kind: "area", label: a.label, value: a.value }));
  const langs = (Array.isArray(data.spokenLanguages) ? data.spokenLanguages : [])
    .map(languageStat).filter(Boolean)
    // prima le lingue non italiane (dicono di più), poi l'italiano
    .sort((a, b) => (a.label === "ITA") - (b.label === "ITA"))
    .slice(0, 2).map((l) => ({ kind: "lang", ...l }));
  const cityStat = []; // niente città sulla tessera (03/10/2026)
  const first = areas.slice(0, 3);
  const room = 6 - first.length - langs.length - cityStat.length;
  return [...first, ...areas.slice(3, 3 + Math.max(0, room)), ...langs, ...cityStat].slice(0, 6);
}

// ── Tessera D1 "da club" (03/10/2026, forma scelta da Nicholas) ─────────────────
// Fronte: nome completo + "Ruolo · Membro da mese anno". Retro: righe leggibili
// ("OnlyFans · Esperta", "Inglese · B2", "Disponibilità · Sera"). Mai voti, mai numero di membro,
// mai email/telefono/codice fiscale.

/** Nome completo sulla tessera: "Giulia Rossi" (iniziali maiuscole se scritto tutto minuscolo). */
export function tesseraName({ firstName, surname } = {}) {
  const cap = (x) => { const t = String(x || "").trim().replace(/\s+/g, " "); return t && t === t.toLowerCase() ? t.replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };
  return [cap(firstName), cap(surname)].filter(Boolean).join(" ");
}

/** Ruolo sul fronte: "Chatter" per i chatter, altrimenti la mansione abbreviata (max ~22 caratteri, a parola intera). */
export function roleLabel(currentJob, max = 22) {
  const s = String(currentJob || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (/^chatter/i.test(s)) return "Chatter";
  const clean = s.replace(/\s*\(.*?\)\s*/g, " ").trim() || s;
  const up = clean[0].toUpperCase() + clean.slice(1);
  if (up.length <= max) return up;
  const cut = up.slice(0, max + 1).replace(/\s+\S*$/, "");
  return `${cut || up.slice(0, max)}…`;
}

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/**
 * Riga sotto il nome: oggi vuota. Niente città (03/10/2026, Nicholas: su una tessera
 * non si scrive la residenza; è anche un dato personale su un'immagine condivisibile).
 */
export function tesseraLine() {
  // 04/10/2026 (Nicholas): niente ruolo (non è detto che sia chat: al modulo il ruolo in
  // Casa non è ancora deciso) e niente "Membro da": sul fronte resta solo il nome.
  return "";
}

// Fasce orarie → parole (le compilano quasi tutti: il retro non resta mai vuoto)
const SLOT_WORD = { "7:00 - 12:00": "Mattina", "12:00 - 17:00": "Pomeriggio", "17:00 - 22:00": "Sera", "22:00 - 03:00": "Notte", "03:00 - 07:00": "Notte fonda" };
export function availabilityText(timeSlots) {
  const words = (Array.isArray(timeSlots) ? timeSlots : []).map((t) => SLOT_WORD[String(t).trim()]).filter(Boolean);
  if (!words.length) return "";
  return words.length > 2 ? `${words.slice(0, 2).join(" · ")} +${words.length - 2}` : words.join(" · ");
}

const AREA_SHORT = { of: "OnlyFans", ads: "Media buying", social: "Social", content: "Contenuti", ai: "Intelligenza artificiale", tech: "Tecnologia", mgmt: "Gestione" };
const LANG_FULL = { ITA: "Italiano", ENG: "Inglese", SPA: "Spagnolo", TED: "Tedesco", FR: "Francese" };
const LANG_LEVEL_WORD = { Native: "Madrelingua", Professional: "Lavorativo", Basic: "Base" };

/**
 * Livello per la riga del retro, concordato col genere DICHIARATO; senza genere si
 * accorda con "livello" (forma neutra rispetto alla persona).
 */
export function levelWord(level, gender) {
  const form = genderForm(gender);
  if (level === "Posso insegnarla") return "Può insegnarla";
  if (level === "Base") return form ? "Base" : "Livello base";
  if (level === "Autonomo") return form === "f" ? "Autonoma" : form === "m" ? "Autonomo" : "Livello autonomo";
  if (level === "Esperto") return form === "f" ? "Esperta" : form === "m" ? "Esperto" : "Livello esperto";
  return String(level || "");
}

/**
 * Righe del retro (fino a 6): aree più forti col livello (fino a 3, poi altre se avanza
 * posto), lingue (prima le straniere, fino a 2), disponibilità. Niente città. Solo dati dichiarati.
 */
export function tesseraRows(data = {}) {
  const areas = strongestAreas(data.skillLevels).map((a) => ({ kind: "area", label: AREA_SHORT[a.area] || a.label, value: levelWord(a.level, data.gender) }));
  const langs = (Array.isArray(data.spokenLanguages) ? data.spokenLanguages : [])
    .map((l) => String(l || "").split(" - ").map((x) => x.trim()))
    .filter(([code]) => code)
    .sort((a, b) => (a[0] === "ITA") - (b[0] === "ITA"))
    .slice(0, 2)
    .map(([code, lvl]) => ({ kind: "lang", label: LANG_FULL[code] || code, value: lvl ? (LANG_LEVEL_WORD[lvl] || lvl) : "" }));
  const avail = availabilityText(data.timeSlots);
  const availRow = avail ? [{ kind: "slots", label: "Disponibilità", value: avail }] : [];
  const first = areas.slice(0, 3);
  const room = 6 - first.length - langs.length - availRow.length;
  return [...first, ...areas.slice(3, 3 + Math.max(0, room)), ...langs, ...availRow].slice(0, 6);
}

/**
 * Quali "pezzi" della tessera sono comparsi rispetto a prima (per il riflesso dorato
 * durante il modulo): nome, ruolo, città, prima competenza, prima lingua.
 */
export function tesseraMilestones(data = {}) {
  const out = [];
  if (String(data.firstName || "").trim()) out.push("name");
  if (roleLabel(data.currentJob)) out.push("role");
  if (availabilityText(data.timeSlots)) out.push("slots");
  if (strongestAreas(data.skillLevels).length) out.push("skill");
  if (Array.isArray(data.spokenLanguages) && data.spokenLanguages.length) out.push("lang");
  return out;
}

/** Intestazione del retro: solo "House of Creators" (04/10/2026: niente data sulla tessera). */
export function memberSince() {
  return "House of Creators";
}
