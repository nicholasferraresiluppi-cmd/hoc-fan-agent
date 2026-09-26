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
