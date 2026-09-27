// La città (26/09/2026): l'azienda come città — un palazzo per ogni spazio ClickUp
// (quartiere creator + quartiere sede), piani = cartelle/liste, luci = stato.
// I dati sono una FOTOGRAFIA di ClickUp caricata in KV (non una lettura live: l'app
// non ha ancora una chiave API ClickUp). La pagina dichiara sempre la data della foto.
import { kv } from "@vercel/kv";

export const CITTA_KEY = "citta:snapshot";
const MAX_SPACES = 200;

const str = (v, n = 120) => String(v ?? "").slice(0, n);
const int = (v) => Math.max(0, Math.min(1e6, Math.round(Number(v) || 0)));

const STATES = new Set(["ok", "wait", "stop", "none", "old"]);
const cleanArea = (a) => ({
  n: str(a?.n, 30),
  s: STATES.has(a?.s) ? a.s : "none",
  open: int(a?.open),
  late: int(a?.late),
  l: str(a?.l, 220),
  short: str(a?.short, 24),
  who: (Array.isArray(a?.who) ? a.who : []).slice(0, 3).map((w) => str(w, 30)),
  // solo link a ClickUp (attività in ritardo più vecchia): mai URL arbitrari nella pagina
  link: /^https:\/\/app\.clickup\.com\/t\/[A-Za-z0-9]+$/.test(a?.link || "") ? a.link : null,
});
const cleanTower = (p) => ({
  n: str(p?.n, 60),
  areas: (Array.isArray(p?.areas) ? p.areas : []).slice(0, 10).map(cleanArea),
  total: int(p?.total),
  other: int(p?.other),
  nospace: Boolean(p?.nospace),
});

/**
 * Normalizza e limita una fotografia (niente campi estranei, niente testi lunghi).
 * Formato attuale (città di Nicholas): { generated, projects:[{n, areas:[{n,s,open,late,l,who}], total, other}], hq, coverage }
 */
export function cleanSnapshot(raw) {
  const generated = /^\d{4}-\d{2}-\d{2}$/.test(raw?.generated || "") ? raw.generated : null;
  if (!generated) throw new Error("Data della fotografia mancante (generated: AAAA-MM-GG)");
  if (!Array.isArray(raw?.projects) || !raw?.hq) throw new Error("Formato non valido: servono { generated, projects[], hq }");
  const projects = raw.projects.slice(0, MAX_SPACES).map(cleanTower).filter((p) => p.n && p.areas.length);
  const hq = cleanTower(raw.hq);
  const coverage = Math.max(0, Math.min(1, Number(raw.coverage) || 0));
  return { generated, projects, hq, coverage, saved_at: Date.now() };
}

export async function getCitySnapshot() {
  return (await kv.get(CITTA_KEY)) || null;
}

export async function saveCitySnapshot(raw) {
  const snap = cleanSnapshot(raw);
  await kv.set(CITTA_KEY, snap);
  return snap;
}

// ── Prese in carico: chi si occupa di un piano (torre|area). Stato di team, non per utente.
export const CLAIMS_KEY = "citta:claims";
export async function getClaims() {
  return (await kv.get(CLAIMS_KEY)) || {};
}
export async function setClaim(tower, area, who) {
  const key = `${str(tower, 60)}|${str(area, 30)}`;
  const claims = await getClaims();
  if (who) claims[key] = { by: str(who.name || "?", 60), userId: str(who.userId || "", 60), at: Date.now() };
  else delete claims[key];
  await kv.set(CLAIMS_KEY, claims);
  return claims;
}

// ── Storico giornaliero degli stati (per l'avviso "ambra da due settimane")
const dayKey = (d) => `citta:day:${d}`;
export function romeDay(t = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}
export async function recordCityDay(merged, day = romeDay()) {
  const states = {};
  for (const t of [...(merged?.projects || []), ...(merged?.hq ? [merged.hq] : [])]) {
    for (const a of t.areas || []) states[`${t.n}|${a.n}`] = a.s;
  }
  await kv.set(dayKey(day), { day, states }, { ex: 40 * 24 * 3600 });
  return Object.keys(states).length;
}
/** Piani in "wait" in tutti gli ultimi `days` giorni registrati (serve lo storico completo). */
export async function stuckAreas(days = 14, now = new Date()) {
  const keys = [];
  for (let k = 0; k < days; k++) keys.push(dayKey(romeDay(new Date(now.getTime() - k * 864e5))));
  const rows = await kv.mget(...keys);
  if (rows.some((r) => !r)) return { complete: false, stuck: [] };
  const first = rows[0].states;
  const stuck = Object.keys(first).filter((k) => rows.every((r) => r.states[k] === "wait"));
  return { complete: true, stuck };
}

/** Cosa è cambiato rispetto a ~7 giorni fa (o al giorno più vecchio disponibile, almeno 3 giorni prima). */
export async function citySince(now = new Date(), days = 7, { fromDay = null } = {}) {
  const today = await kv.get(dayKey(romeDay(now)));
  if (!today) return { base: null };
  let base = null;
  // "dalla tua ultima visita": il primo giorno salvato a partire da quel giorno (mai oggi)
  if (fromDay) {
    for (let k = 0; k < 40 && !base; k++) {
      const d = romeDay(new Date(new Date(`${fromDay}T12:00:00Z`).getTime() + k * 864e5));
      if (d >= romeDay(now)) break;
      const row = await kv.get(dayKey(d));
      if (row) base = row;
    }
    if (!base) return { base: null };
  }
  for (let k = days; k >= 3 && !base; k--) {
    const d = romeDay(new Date(now.getTime() - k * 864e5));
    const row = await kv.get(dayKey(d));
    if (row) base = row;
  }
  if (!base) return { base: null, firstDay: null };
  const bad = (x) => x === "wait" || x === "stop";
  const worse = [], better = [];
  for (const [k, st] of Object.entries(today.states)) {
    const was = base.states[k];
    if (was == null) continue;
    if (bad(st) && !bad(was)) worse.push(k.replace("|", " · "));
    if (!bad(st) && bad(was) && st !== "old" && st !== "none") better.push(k.replace("|", " · "));
  }
  return { base: base.day, worse, better };
}

// ── Fase 3, responsabilità (27/09/2026) ────────────────────────────────────────
// Responsabile di un palazzo (una persona del board): { [tower]: { userId, name, at } }
export const CUSTODIANS_KEY = "citta:custodians";
export async function getCustodians() { return (await kv.get(CUSTODIANS_KEY)) || {}; }
export async function setCustodian(tower, who) {
  const all = await getCustodians();
  const t = str(tower, 60);
  if (who?.userId) all[t] = { userId: str(who.userId, 60), name: str(who.name || "?", 60), at: Date.now() };
  else delete all[t];
  await kv.set(CUSTODIANS_KEY, all);
  return all;
}

// Piani riaccesi: una presa in carico il cui piano non è più in ritardo si chiude da sola e resta
// nel registro "riaccesi" (si vede chi l'ha riacceso). { tower, area, by, since, at } — ultimi 60.
export const RELIT_KEY = "citta:relit";
const bad = (s) => s === "wait" || s === "stop";
export async function settleClaims(merged, now = Date.now()) {
  if (!merged?.projects) return 0;
  const claims = await getClaims();
  const state = {};
  for (const t of [...merged.projects, merged.hq]) for (const a of t.areas || []) state[`${t.n}|${a.n}`] = a.s;
  const relit = [];
  for (const [k, c] of Object.entries(claims)) {
    const s = state[k];
    if (s == null || bad(s) || s === "old") continue; // "da riordinare" non è un problema risolto
    const [tower, area] = k.split("|");
    relit.push({ tower, area, by: c.by, since: c.at, at: now });
    delete claims[k];
  }
  if (!relit.length) return 0;
  await kv.set(CLAIMS_KEY, claims);
  const log = ((await kv.get(RELIT_KEY)) || []).concat(relit).slice(-60);
  await kv.set(RELIT_KEY, log);
  return relit.length;
}
export async function recentRelit(days = 7, now = Date.now()) {
  return ((await kv.get(RELIT_KEY)) || []).filter((r) => now - r.at < days * 864e5).reverse();
}

// Priorità senza nessuno: da quando una priorità misurata ("Da guardare") è aperta senza presa in carico.
export const TOPSEEN_KEY = "citta:topseen";
export async function trackTop(merged, now = Date.now()) {
  const seen = (await kv.get(TOPSEEN_KEY)) || {};
  const cur = new Set((merged?.top || []).flatMap((x) => (x.areas || [x.area]).map((a) => `${x.tower}|${a}`)));
  const next = {};
  for (const k of cur) next[k] = seen[k] || now;
  await kv.set(TOPSEEN_KEY, next);
  return next;
}
export async function unclaimedTop(hours = 48, now = Date.now()) {
  const [seen, claims] = await Promise.all([kv.get(TOPSEEN_KEY), getClaims()]);
  return Object.entries(seen || {}).filter(([k, at]) => !claims[k] && now - at > hours * 36e5).map(([k]) => k);
}
