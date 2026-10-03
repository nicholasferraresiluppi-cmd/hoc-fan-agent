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
  const city = cityOf(data.residenceComune);
  const cityStat = city ? [{ kind: "city", label: "CITTÀ", value: city.toUpperCase() }] : [];
  const first = areas.slice(0, 3);
  const room = 6 - first.length - langs.length - cityStat.length;
  return [...first, ...areas.slice(3, 3 + Math.max(0, room)), ...langs, ...cityStat].slice(0, 6);
}

/** "House of Creators · ottobre 2026" (mese e anno dell'invio). */
export function memberSince(at = Date.now()) {
  const d = new Date(at);
  const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  return `House of Creators · ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
