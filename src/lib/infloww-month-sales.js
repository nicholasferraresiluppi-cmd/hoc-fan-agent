/**
 * Venduto Infloww del mese per nome operatore — mappa piccola e condivisa
 * (07/11/2026: estratta da referral.js, la usa anche il collegamento
 * persona→operatore del CRM per l'elenco dei nomi).
 *
 * Il venduto si legge da `ops_kpi:monthly:{mese}` (~360 KB) UNA volta per
 * import: la mappa {nome: venduto} si ricostruisce solo se l'import di quel
 * mese è più recente della mappa (lezione banda KV 4/10/2026). La chiave resta
 * `referral:sales:{mese}`, dove è nata.
 */
import { kv } from "@vercel/kv";
import { salesMapFromKpiRows } from "@/lib/referral-core";

const salesKey = (m) => `referral:sales:${m}`;

function parse(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** {nome: venduto} del mese, o null se il mese non è stato importato. */
export async function getMonthSales(month) {
  const [cached, importedAt] = await Promise.all([
    kv.get(salesKey(month)).catch(() => null),
    kv.zscore("ops_kpi:imports", `monthly:${month}`).catch(() => null),
  ]);
  if (importedAt == null) return null;
  const c = parse(cached);
  if (c && c.builtAt >= Number(importedAt)) return c.map || {};
  const rows = (await kv.get(`ops_kpi:monthly:${month}`).catch(() => null)) || [];
  const map = salesMapFromKpiRows(Array.isArray(rows) ? rows : []);
  await kv.set(salesKey(month), JSON.stringify({ builtAt: Date.now(), map }), { ex: 400 * 24 * 3600 }).catch(() => {});
  return map;
}

/** Nomi Infloww degli ultimi due mesi importati. */
export async function listInflowwNames() {
  const periods = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true }).catch(() => [])) || [];
  const months = periods.map(String).filter((p) => p.startsWith("monthly:")).map((p) => p.slice(8)).sort().reverse().slice(0, 2);
  const names = new Set();
  for (const m of months) {
    const map = await getMonthSales(m);
    for (const n of Object.keys(map || {})) names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "it"));
}
