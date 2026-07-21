import { kv } from "@vercel/kv";

/**
 * Rituali personali — dominio (CRAWL v1). Vedi docs/RITUALI_PERSONALI.md.
 *
 * Modulo PERSONALE, isolato dai dati HOC. L'identità la risolve sempre il server
 * (userId Clerk); i dati sono chiavati per userId — mai per employee, mai dati altrui.
 *
 * Principi (dalla ricerca 21/07):
 *  - NON punitivo: metrica = adherence % su finestra mobile 30gg, non streak secco;
 *    i giorni prima del primo utilizzo non contano.
 *  - Trait accretion per pilastro: livello 0..4 sui completamenti trailing 30gg →
 *    decade lentamente se molli, mai punizione istantanea.
 */

export const cfgKey = (uid) => `rituali:${uid}:config`;
export const logKey = (uid, yearMonth) => `rituali:${uid}:log:${yearMonth}`;

export const TRAIT_LEVEL_THRESHOLDS = [0, 8, 20, 40, 70]; // completamenti (30gg) → livello 0..4

export const DEFAULT_CONFIG = {
  pillars: [
    { id: "allenamento", label: "Allenamento", trait: "forza" },
    { id: "alimentazione", label: "Alimentazione", trait: "vitalita" },
    { id: "mente", label: "Mente", trait: "lettura" },
  ],
  habits: [
    { id: "forza", pillar: "allenamento", label: "Sessione di forza" },
    { id: "passi", pillar: "allenamento", label: "10k passi" },
    { id: "proteine", pillar: "alimentazione", label: "Proteine al target" },
    { id: "acqua", pillar: "alimentazione", label: "2,5L di acqua" },
    { id: "noserale", pillar: "alimentazione", label: "Niente cibo dopo le 21" },
    { id: "lettura", pillar: "mente", label: "10 min di lettura" },
    { id: "respiro", pillar: "mente", label: "Meditazione / respiro" },
  ],
};

/** "YYYY-MM" da una data ISO "YYYY-MM-DD". */
export function yearMonthOf(dateISO) {
  return String(dateISO).slice(0, 7);
}

/** Somma giorni (interi, anche negativi) a una data ISO, restando in ISO. UTC per stabilità. */
export function addDaysISO(dateISO, delta) {
  const [y, m, d] = String(dateISO).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function isValidDateISO(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Config dell'utente, con seed di default al primo accesso. */
export async function loadConfig(uid) {
  let cfg = null;
  try { cfg = await kv.get(cfgKey(uid)); } catch {}
  if (!cfg || !Array.isArray(cfg.habits) || cfg.habits.length === 0) {
    cfg = { ...DEFAULT_CONFIG, createdAt: new Date().toISOString() };
    try { await kv.set(cfgKey(uid), cfg); } catch {}
  }
  return cfg;
}

/**
 * Mappa dateISO -> array habitId completati, coprendo la finestra
 * [endISO - days, endISO]. Legge solo i bucket mensili necessari.
 */
export async function loadLogWindow(uid, endISO, days) {
  const buckets = new Set();
  for (let i = 0; i <= days; i++) buckets.add(yearMonthOf(addDaysISO(endISO, -i)));
  const map = {};
  for (const b of buckets) {
    let bucket = null;
    try { bucket = await kv.get(logKey(uid, b)); } catch {}
    if (bucket && typeof bucket === "object") {
      for (const [date, entry] of Object.entries(bucket)) {
        map[date] = Array.isArray(entry?.done) ? entry.done : [];
      }
    }
  }
  return map;
}

/**
 * Adherence % su finestra mobile: media del rapporto completate/totali per giorno,
 * SOLO sui giorni dal primo utilizzo in poi (i giorni precedenti non puniscono).
 */
export function computeAdherence(map, config, endISO, windowDays = 30) {
  const habitIds = new Set(config.habits.map((h) => h.id));
  const total = config.habits.length || 1;
  const activeDates = Object.keys(map).filter((d) => (map[d] || []).length > 0).sort();
  const firstActive = activeDates[0] || endISO;
  let sumRatio = 0;
  let effDays = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = addDaysISO(endISO, -i);
    if (d < firstActive) continue;
    effDays++;
    const done = (map[d] || []).filter((id) => habitIds.has(id));
    sumRatio += Math.min(1, done.length / total);
  }
  if (effDays === 0) return 0;
  return Math.round((sumRatio / effDays) * 100);
}

/** Streak = giorni consecutivi con ≥1 abitudine, terminanti oggi (o ieri se oggi ancora vuoto). */
export function computeStreak(map, endISO) {
  let streak = 0;
  let i = (map[endISO] || []).length === 0 ? 1 : 0;
  for (; ; i++) {
    const d = addDaysISO(endISO, -i);
    if ((map[d] || []).length > 0) streak++;
    else break;
    if (i > 400) break; // guardrail
  }
  return streak;
}

/** Livello 0..4 dai completamenti cumulativi. */
export function levelFromCount(count) {
  let lvl = 0;
  for (let k = TRAIT_LEVEL_THRESHOLDS.length - 1; k >= 0; k--) {
    if (count >= TRAIT_LEVEL_THRESHOLDS[k]) { lvl = k; break; }
  }
  return lvl;
}

/**
 * Tratti per pilastro (trait accretion): completamenti trailing `windowDays` per
 * pilastro → livello 0..4. Chiave = pillar.trait (usata dall'avatar).
 */
export function computeTraits(map, config, endISO, windowDays = 30) {
  const byPillar = {};
  for (const p of config.pillars) byPillar[p.id] = 0;
  const habitPillar = {};
  for (const h of config.habits) habitPillar[h.id] = h.pillar;
  for (let i = 0; i < windowDays; i++) {
    const d = addDaysISO(endISO, -i);
    for (const hid of map[d] || []) {
      const pid = habitPillar[hid];
      if (pid != null && byPillar[pid] != null) byPillar[pid]++;
    }
  }
  const traits = {};
  for (const p of config.pillars) {
    const count = byPillar[p.id];
    traits[p.trait] = { level: levelFromCount(count), count, pillar: p.id, label: p.label };
  }
  return traits;
}
