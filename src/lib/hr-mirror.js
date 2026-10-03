/**
 * Centro HR — campi "specchio" a DUE VIE (03/10/2026).
 *
 * Sette dati strutturati dell'app (luogo di nascita, comune e CAP di residenza,
 * competenze con livello, ruoli già ricoperti, vorrebbe imparare, altro che sa
 * fare) vanno su ClickUp come TESTO, in campi dedicati. Fino al 03/10 erano di
 * sola andata; ora chi li corregge su ClickUp li vede tornare in app.
 *
 *   mirrorText(key, fields)          valore app → testo (facile da correggere a mano)
 *   parseMirror(key, text, {comuni}) testo → valore app, con le parti NON riconosciute
 *   mirrorPrint(text)                impronta del testo normalizzato (anti-loop e base)
 *
 * Regola di onestà: se nel testo c'è anche un solo pezzo che non si riconosce
 * (una voce, un comune, un livello sconosciuto) il risultato è `ok: false` e chi
 * chiama tiene il valore di HOC Pro (e lo scrive nello storico). Si ignorano solo
 * i pezzi vuoti o fatti di sola punteggiatura ("—", "-", ",,").
 *
 * Puro: nessun I/O. L'elenco ISTAT dei comuni lo passa chi chiama (lato server,
 * letto con fs da public/data/comuni-istat.json: vedi loadComuni in hr-people.js).
 */
import {
  SKILLS, SKILL_LEVELS, SKILL_AREAS, PAST_ROLES, ROLE_DURATIONS, resolveSkillKey, levelRank,
  normalizeSkillMap, normalizeLearnList, normalizePastRoles, skillName, pastRoleText, oneLine,
} from "./hr-skills.js";
import { COUNTRIES } from "./hr-countries.js";
import { normalizePersonInput, valueHash } from "./hr-people-core.js";

const s = (v) => (v == null ? "" : String(v)).trim();
/** Chiave di confronto: minuscolo, senza accenti, tutto ciò che non è lettera/cifra = spazio. */
export const normKey = (v) => s(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ignorable = (piece) => !normKey(piece); // vuoto o sola punteggiatura

// ── Valore app → testo ───────────────────────────────────────────────────────
const place = (v) => (v?.abroad ? [oneLine(v.city, 120), s(v.country)].filter(Boolean).join(", ") : v?.name ? `${s(v.name)}${v.prov ? ` (${s(v.prov)})` : ""}` : "");

/**
 * Testo scritto su ClickUp. Formati (pensati per essere corretti a mano):
 *   Competenze  una riga per area: "OnlyFans: Chat e vendita (Esperto), Gestione account (Base)"
 *   Ruoli       "Media buyer (1-3 anni), Altro: fotografo (meno di 1 anno)"
 *   Imparare    "Instagram, Google Ads"
 *   Luoghi      "Roma (RM)" · estero "Madrid, Spagna" (nascita: solo il paese)
 */
export function mirrorText(key, f = {}) {
  switch (key) {
    case "birthPlace": return f.birthPlace?.abroad ? s(f.birthPlace.country) : place(f.birthPlace);
    case "residenceComune": return place(f.residenceComune);
    case "residenceCap": return oneLine(f.residenceCap, 20);
    case "skillLevels": {
      const sm = normalizeSkillMap(f.skillLevels);
      return SKILL_AREAS.map((a) => {
        const got = a.skills.filter((x) => sm[x.key]);
        return got.length ? `${a.area}: ${got.map((x) => `${x.name} (${sm[x.key]})`).join(", ")}` : null;
      }).filter(Boolean).join("\n");
    }
    case "pastRoles": return normalizePastRoles(f.pastRoles).map(pastRoleText).join(", ");
    case "learnWish": return normalizeLearnList(f.learnWish).map(skillName).join(", ");
    case "otherSkills": return oneLine(f.otherSkills, 500);
    default: return "";
  }
}

/**
 * Impronta del testo di un campo specchio. Si confronta il TESTO (normalizzato:
 * spazi, a capo vuoti, maiuscole), non l'oggetto: vedi il commento in
 * hr-people.js › ingestTask sul perché è la scelta robusta.
 */
export function normMirrorText(text) {
  return String(text ?? "").normalize("NFC").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").toLowerCase();
}
export function mirrorPrint(text) {
  return valueHash(`mirror-text:${normMirrorText(text)}`);
}

// ── Utilità di lettura ───────────────────────────────────────────────────────
/** Divide sui separatori (, ; a capo) fuori dalle parentesi: "Grafica (Photoshop, Figma)" resta intera. */
export function splitTop(text, seps = ",;\n") {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(text ?? "")) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/**
 * Legge una lista di voci provando a riunire i pezzi adiacenti: alcune voci hanno
 * una virgola nel nome ("Reels, Shorts e TikTok"). Vince la voce più lunga che si
 * riconosce. `absorb(prev, nextPiece)` facoltativo: unisce pezzi liberi (ruolo "Altro: …").
 */
function readList(pieces, parseOne, { absorb, join = 5 } = {}) {
  const items = [];
  const unknown = [];
  const ps = pieces.filter((p) => !ignorable(p));
  let i = 0;
  while (i < ps.length) {
    let hit = null;
    let end = i;
    for (let j = Math.min(ps.length - 1, i + join); j >= i; j--) {
      const r = parseOne(ps.slice(i, j + 1).join(", "));
      if (r) { hit = r; end = j; break; }
    }
    if (!hit) { unknown.push(ps[i]); i++; continue; }
    let text = ps.slice(i, end + 1).join(", ");
    i = end + 1;
    // pezzi che non sono voci a sé vengono assorbiti dalla voce libera precedente ("Altro: foto, video")
    while (absorb && absorb(hit) && i < ps.length && !parseOne(ps[i])) {
      const r = parseOne(`${text}, ${ps[i]}`);
      if (!r) break;
      hit = r; text = `${text}, ${ps[i]}`; i++;
    }
    items.push(hit);
  }
  return { items, unknown };
}

// ── Competenze ───────────────────────────────────────────────────────────────
const SKILL_BY_NORM = new Map();
for (const x of SKILLS) {
  SKILL_BY_NORM.set(normKey(x.name), x.key);
  SKILL_BY_NORM.set(normKey(x.key), x.key);
  for (const label of x.cu) if (!SKILL_BY_NORM.has(normKey(label))) SKILL_BY_NORM.set(normKey(label), x.key);
}
const LEVEL_BY_NORM = new Map(SKILL_LEVELS.map((l) => [normKey(l), l]));
const resolveSkill = (name) => SKILL_BY_NORM.get(normKey(name)) || resolveSkillKey(s(name)) || null;

/** "Chat e vendita (Esperto)" → { key, level }; senza livello → "Base"; null se non si riconosce. */
export function parseSkillItem(raw) {
  const t = s(raw);
  if (!t) return null;
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(t);
  if (m && LEVEL_BY_NORM.has(normKey(m[2]))) {
    const key = resolveSkill(m[1]);
    return key ? { key, level: LEVEL_BY_NORM.get(normKey(m[2])) } : null;
  }
  // "Instagram (bravissimo)": tra parentesi c'è qualcosa che non è un livello → non riconosciuta
  const key = resolveSkill(t);
  return key ? { key, level: "Base" } : null;
}

const AREA_BY_NORM = new Map();
for (const a of SKILL_AREAS) { AREA_BY_NORM.set(normKey(a.area), a.key); AREA_BY_NORM.set(normKey(a.key), a.key); }
function isAreaHeader(h) {
  const k = normKey(h);
  if (!k) return false;
  if (AREA_BY_NORM.has(k)) return true;
  // abbreviazione dell'area ("Social" → "Social organico", "Media buying" → "Media buying e pubblicità")
  return k.length >= 4 && SKILL_AREAS.some((a) => normKey(a.area).startsWith(`${k} `));
}

function parseSkillLevels(text) {
  const unknown = [];
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    let body = line;
    const h = /^([^:()]*):(.*)$/.exec(line);
    if (h) {
      if (isAreaHeader(h[1])) body = h[2];
      else if (!ignorable(h[1])) { unknown.push(s(h[1])); body = h[2]; }
    }
    const r = readList(splitTop(body), (piece) => parseSkillItem(piece));
    unknown.push(...r.unknown);
    for (const it of r.items) if (!out[it.key] || levelRank(it.level) > levelRank(out[it.key])) out[it.key] = it.level;
  }
  return { value: out, unknown };
}

function parseLearnWish(text) {
  // "(Base)" accanto a una voce da imparare non ha senso ma non toglie niente: si accetta
  const r = readList(splitTop(text), (piece) => parseSkillItem(piece));
  const keys = [];
  for (const it of r.items) if (!keys.includes(it.key)) keys.push(it.key);
  if (keys.length > 2) return { value: keys, unknown: r.unknown, reason: `ci sono ${keys.length} voci (al massimo 2)` };
  return { value: keys, unknown: r.unknown };
}

// ── Ruoli già ricoperti ──────────────────────────────────────────────────────
const ROLE_BY_NORM = new Map(PAST_ROLES.map(([k, name]) => [normKey(name), k]));
ROLE_BY_NORM.set(normKey("other"), "other");
for (const [k] of PAST_ROLES) ROLE_BY_NORM.set(normKey(k), k);
const DURATION_BY_NORM = new Map(ROLE_DURATIONS.map(([k, name]) => [normKey(name), k]));
for (const [alias, k] of [["meno di un anno", "lt1"], ["meno di 1 anno", "lt1"], ["1 3 anni", "1to3"], ["da 1 a 3 anni", "1to3"], ["3 5 anni", "3to5"], ["da 3 a 5 anni", "3to5"], ["piu di 5 anni", "gt5"], ["oltre i 5 anni", "gt5"]]) DURATION_BY_NORM.set(normKey(alias), k);

/** "Media buyer (1-3 anni)" / "Altro: fotografo" → { role, duration, other? } o null. */
export function parseRoleItem(raw) {
  const t = s(raw);
  if (!t) return null;
  let name = t;
  let duration = null;
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(t);
  if (m && DURATION_BY_NORM.has(normKey(m[2]))) { name = m[1]; duration = DURATION_BY_NORM.get(normKey(m[2])); }
  const other = /^altro\s*[:\-–]\s*(.*)$/i.exec(s(name));
  if (other) return { role: "other", duration, other: oneLine(other[1], 80) };
  const role = ROLE_BY_NORM.get(normKey(name));
  if (!role) return null;
  return role === "other" ? { role, duration, other: "" } : { role, duration };
}

function parsePastRoles(text) {
  // i nomi dei ruoli non hanno virgole: niente unione greedy (il testo libero di "Altro" la renderebbe ingorda)
  const r = readList(splitTop(text), parseRoleItem, { absorb: (hit) => hit.role === "other", join: 0 });
  return { value: normalizePastRoles(r.items), unknown: r.unknown };
}

// ── Luoghi (comune ISTAT o estero) ───────────────────────────────────────────
const COUNTRY_BY_NORM = new Map(COUNTRIES.map((c) => [normKey(c), c]));
for (const [alias, c] of [["usa", "Stati Uniti"], ["stati uniti d america", "Stati Uniti"], ["uk", "Regno Unito"], ["inghilterra", "Regno Unito"], ["gran bretagna", "Regno Unito"], ["olanda", "Paesi Bassi"], ["repubblica di san marino", "San Marino"]]) COUNTRY_BY_NORM.set(alias, c);
export const canonicalCountry = (v) => COUNTRY_BY_NORM.get(normKey(v)) || null;

// indice dell'elenco ISTAT (costruito una volta per elenco): nome → righe; anche le parti dei nomi bilingui ("Bolzano/Bozen")
const comuniIndex = new WeakMap();
function indexOf(list) {
  if (!Array.isArray(list)) return null;
  let idx = comuniIndex.get(list);
  if (idx) return idx;
  const byName = new Map();
  const siglas = new Set();
  const add = (k, row) => { if (!k) return; const a = byName.get(k) || []; if (!a.includes(row)) a.push(row); byName.set(k, a); };
  for (const row of list) {
    if (!Array.isArray(row) || !row[0]) continue;
    add(normKey(row[0]), row);
    if (/[/]/.test(row[0])) for (const part of String(row[0]).split("/")) add(normKey(part), row);
    if (row[1]) siglas.add(String(row[1]).toUpperCase());
  }
  idx = { byName, siglas };
  comuniIndex.set(list, idx);
  return idx;
}

/** Cerca un comune per nome (e sigla). @returns {{row}|{ambiguous:true}|null} */
export function findComune(list, name, sigla = null) {
  const idx = indexOf(list);
  if (!idx) return null;
  const rows = idx.byName.get(normKey(name)) || [];
  const hits = sigla ? rows.filter((r) => String(r[1]).toUpperCase() === sigla.toUpperCase()) : rows;
  if (hits.length === 1) return { row: hits[0] };
  if (hits.length > 1) return { ambiguous: true };
  return null;
}

/**
 * "Roma (RM)" · "Roma" · "roma, rm" · "Roma, Italia" → comune ISTAT.
 * Non è un comune e c'è una virgola → estero: l'ultimo pezzo è il paese, il resto la città.
 * Senza virgola vale come estero solo un paese che conosciamo ("Spagna").
 */
export function parsePlace(text, kind, comuni) {
  const t = oneLine(text, 300);
  if (!t) return { value: null, unknown: [] };
  const fail = (reason) => ({ value: null, unknown: [t], reason });
  let name = t;
  let sigla = null;
  let abroad = null;
  const paren = /^(.+?)\s*\(\s*([A-Za-z]{2})\s*\)\s*$/.exec(t);
  const idx = indexOf(comuni);
  if (paren) { name = paren[1]; sigla = paren[2].toUpperCase(); }
  else if (t.includes(",")) {
    const parts = t.split(",").map(s).filter(Boolean);
    const last = parts[parts.length - 1] || "";
    const first = parts.slice(0, -1).join(", ");
    if (/^[A-Za-z]{2}$/.test(last) && (!idx || idx.siglas.has(last.toUpperCase()))) { name = first; sigla = last.toUpperCase(); }
    else if (normKey(last) === "italia") name = first;
    else abroad = { city: first, country: canonicalCountry(last) || last };
  }
  if (!idx) {
    if (abroad) return { value: abroadValue(kind, abroad), unknown: [] };
    if (!sigla && canonicalCountry(t) && normKey(t) !== "italia") return { value: abroadValue(kind, { city: "", country: canonicalCountry(t) }), unknown: [] };
    return fail("elenco dei comuni non disponibile sul server");
  }
  const hit = name ? findComune(comuni, name, sigla) : null;
  if (hit?.row) {
    const [n, prov, code, region] = hit.row;
    return { value: kind === "birth" ? { abroad: false, name: n, prov, code } : { name: n, prov, code, region }, unknown: [] };
  }
  if (hit?.ambiguous) return fail(`ci sono più comuni chiamati «${s(name)}»: aggiungi la sigla della provincia, es. «${s(name)} (XX)»`);
  if (sigla) return fail(`nessun comune «${s(name)}» in provincia di ${sigla}`);
  if (abroad) return { value: abroadValue(kind, abroad), unknown: [] };
  const country = canonicalCountry(t);
  if (country && country !== "Italia") return { value: abroadValue(kind, { city: "", country }), unknown: [] };
  return fail("non è un comune italiano né un paese che conosciamo (per l'estero scrivi «città, paese»)");
}
function abroadValue(kind, { city, country }) {
  return kind === "birth" ? { abroad: true, country } : { abroad: true, country, city: s(city) };
}

// ── Testo → valore app ───────────────────────────────────────────────────────
/**
 * @returns {{ ok: boolean, value: any, unknown: string[], reason?: string }}
 *   ok=false → non usare `value`: tenere il valore di HOC Pro.
 *   Testo vuoto = campo svuotato (ok, valore vuoto).
 */
export function parseMirror(key, text, { comuni = null } = {}) {
  let r;
  switch (key) {
    case "birthPlace": r = parsePlace(text, "birth", comuni); break;
    case "residenceComune": r = parsePlace(text, "comune", comuni); break;
    case "skillLevels": r = parseSkillLevels(text); break;
    case "learnWish": r = parseLearnWish(text); break;
    case "pastRoles": r = parsePastRoles(text); break;
    case "residenceCap": case "otherSkills": r = { value: s(text) || null, unknown: [] }; break;
    default: return { ok: false, value: null, unknown: [], reason: "campo sconosciuto" };
  }
  const ok = !r.unknown.length && !r.reason;
  // stessi limiti e stessa forma dei valori salvati dall'app (lunghezze, chiavi, campi vuoti)
  const value = ok ? normalizePersonInput({ [key]: r.value }, [key]).values[key] ?? null : null;
  return { ok, value, unknown: r.unknown.slice(0, 10), ...(r.reason ? { reason: r.reason } : {}) };
}

/** Frase per lo storico quando il testo non si riconosce. */
export function mirrorIssueText(text, parsed) {
  const shown = oneLine(text, 120);
  const what = parsed?.unknown?.length ? ` (non riconosciuto: ${parsed.unknown.map((u) => `«${oneLine(u, 40)}»`).join(", ")})` : parsed?.reason ? ` (${parsed.reason})` : "";
  return `Su ClickUp «${shown}» non è stato riconosciuto${what}: tenuto il valore di HOC Pro`.slice(0, 300);
}
