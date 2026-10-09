// Revenue per creator — proiezione di fine mese per account/paese, ricostruzione di
// revenue.hoc.tools ("Revenue Analytics"), spento a ottobre 2026. Creator e account
// in live-creators.js (strumento dei progetti di Antonio Marucci).
//
// STESSI NUMERI DEL SITO ORIGINALE: il vecchio sito leggeva le viste BigQuery del
// dataset `hoc` (v_eom_projection e le 4 viste sotto), che appartengono all'altro
// split. La loro logica è COPIATA in `revenue-pacing-sql.js` e legge solo le
// tabelle grezze `onlyfans.*`: se cancellano le viste la pagina non si ferma.
// Verificata contro la vista originale: 0 differenze su 28 campi × 3 paesi.
// Forma della risposta = quella del vecchio /api/ (data, trend, freshness, goals),
// ricavata dall'ultima risposta rimasta nella cache del browser (3 ott 2026).
//
// Costo: ~0,35 GB a ricalcolo (frazioni di centesimo). Cache KV 15 minuti,
// single-flight: N persone che aprono la pagina insieme = una sola query.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";
import { eomProjectionSQL } from "@/lib/revenue-pacing-sql";

export { bigQueryConfigured };

const P = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const CACHE_KEY = (slug) => `revenue:pacing:v5:${slug}`;
const LOCK_KEY = (slug) => `revenue:pacing:lock:${slug}`;
const GOALS_KEY = (slug) => `revenue:goals:${slug}`;
const FRESH_MS = 15 * 60 * 1000;
const TREND_DAYS = 95; // 30gg + 30gg precedenti per il confronto periodi, e il mese scorso intero

// Account della creator → frammenti SQL (id dal nostro registro, mai input utente).
function accountSQL(creator) {
  const acc = creator.accounts.map((a) => ({ id: Number(a.creator_id), country: String(a.country).replace(/[^A-Z]/g, "") }));
  return {
    countries: acc.map((a) => a.country),
    COUNTRY_SQL: (col = "creator_id") => `CASE ${col} ${acc.map((a) => `WHEN ${a.id} THEN '${a.country}'`).join(" ")} END`,
    IDS: `(${acc.map((a) => a.id).join(", ")})`,
  };
}

const num = (v) => (v == null || v === "" ? null : Number(v));
const NUMERIC_FIELDS = [
  "day_of_month", "days_in_month", "days_remaining", "revenue_mtd", "closed_months_count",
  "revenue_proj_eom", "revenue_hist_avg", "revenue_delta_vs_hist", "new_subs_mtd", "new_subs_proj_eom",
  "new_subs_hist_avg", "new_sub_revenue_mtd", "retention_revenue_mtd", "new_sub_revenue_pct_mtd",
  "current_month_converting_new_subs", "current_month_arppu", "current_month_ltv",
  "rolling_cohort_total_subs", "rolling_cohort_converting_users", "rolling_cohort_revenue_mtd",
  "rolling_cohort_revenue_pct", "avg_revenue_per_new_sub", "hist_conversion_rate", "new_sub_expected_eom_revenue",
];

function toDateStr(v) {
  if (v == null) return null;
  if (typeof v === "number" || /^\d+(\.\d+)?(E\d+)?$/.test(String(v))) {
    // TIMESTAMP REST = secondi epoch (anche in notazione 1.7E9)
    return new Date(Number(v) * 1000).toISOString();
  }
  return String(v);
}

async function compute(creator) {
  const p = P();
  const { countries: COUNTRIES, COUNTRY_SQL, IDS } = accountSQL(creator);
  const [proj, trend, fresh] = await Promise.all([
    bqQuery(eomProjectionSQL(p, creator.accounts)),
    bqQuery(`
      WITH rev AS (
        SELECT DATE(created_at) AS date, ${COUNTRY_SQL()} AS country, SUM(net) AS daily_revenue
        FROM \`${p}.onlyfans.attributed_transactions\`
        WHERE creator_id IN ${IDS} AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${TREND_DAYS} DAY)
        GROUP BY 1, 2
      ), subs AS (
        SELECT DATE(created_at) AS date, ${COUNTRY_SQL()} AS country, COUNT(DISTINCT user_id) AS daily_new_subs
        FROM \`${p}.onlyfans.organic_subscriptions\`
        WHERE creator_id IN ${IDS} AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${TREND_DAYS} DAY)
        GROUP BY 1, 2
      )
      SELECT CAST(COALESCE(r.date, s.date) AS STRING) AS date, COALESCE(r.country, s.country) AS country,
             COALESCE(r.daily_revenue, 0) AS daily_revenue, COALESCE(s.daily_new_subs, 0) AS daily_new_subs
      FROM rev r FULL OUTER JOIN subs s ON r.date = s.date AND r.country = s.country
      ORDER BY 1, 2`),
    bqQuery(`
      SELECT 'tx' AS src, ${COUNTRY_SQL()} AS country, MAX(created_at) AS ts
      FROM \`${p}.onlyfans.attributed_transactions\`
      WHERE creator_id IN ${IDS} AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      GROUP BY 1, 2
      UNION ALL
      SELECT 'subs', ${COUNTRY_SQL()}, MAX(created_at)
      FROM \`${p}.onlyfans.organic_subscriptions\`
      WHERE creator_id IN ${IDS} AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
      GROUP BY 1, 2`),
  ]);

  const data = proj.rows
    .map((r) => {
      const o = { ...r, as_of_date: r.as_of_date == null ? null : String(r.as_of_date) };
      for (const f of NUMERIC_FIELDS) o[f] = num(r[f]);
      return o;
    })
    .sort((a, b) => COUNTRIES.indexOf(a.country) - COUNTRIES.indexOf(b.country));

  const freshness = {};
  for (const r of fresh.rows) freshness[`${r.src}_live_${r.country}`] = toDateStr(r.ts);

  return {
    countries: COUNTRIES,
    data,
    trend: trend.rows.map((r) => ({ date: r.date, country: r.country, daily_revenue: num(r.daily_revenue), daily_new_subs: num(r.daily_new_subs) })),
    freshness,
    bytes_processed: proj.totalBytesProcessed + trend.totalBytesProcessed + fresh.totalBytesProcessed,
    updated_at: new Date().toISOString(),
  };
}

/** Dati della pagina: cache KV 15 min; `force` ricalcola. Single-flight sul ricalcolo. */
export async function getRevenuePacing(creator, { force = false } = {}) {
  const ck = CACHE_KEY(creator.slug), lk = LOCK_KEY(creator.slug);
  const cached = await kv.get(ck).catch(() => null);
  const fresh = cached && Date.now() - new Date(cached.updated_at).getTime() < FRESH_MS;
  if (cached && fresh && !force) return { ...cached, cached: true };

  const gotLock = await kv.set(lk, Date.now(), { nx: true, ex: 90 }).catch(() => "OK");
  if (!gotLock) {
    // Qualcun altro sta già ricalcolando: meglio il dato di pochi minuti fa che una seconda query.
    if (cached) return { ...cached, cached: true, refreshing: true };
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const c = await kv.get(ck).catch(() => null);
      if (c && c.updated_at !== cached?.updated_at) return { ...c, cached: true };
    }
    throw new Error("Calcolo già in corso — riprova tra qualche secondo");
  }
  try {
    const out = await compute(creator);
    await kv.set(ck, out, { ex: 7 * 24 * 3600 });
    return { ...out, cached: false };
  } finally {
    await kv.del(lk).catch(() => {});
  }
}

// ─── Obiettivi mensili per paese ────────────────────────────────────────────
// { IT: { "2026-10": 70000, ... }, EN: {...}, ES: {...} } + chi/quando ha cambiato.

export async function getGoals(creator) {
  const g = await kv.get(GOALS_KEY(creator.slug)).catch(() => null);
  if (g?.goals) return g;
  return { goals: {}, history: [] };
}

export async function setGoal(creator, { country, month, value, by }) {
  if (!creator.accounts.some((a) => a.country === country)) throw new Error("Paese non valido");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) throw new Error("Mese non valido (AAAA-MM)");
  const v = value === null || value === "" ? null : Number(value);
  if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10_000_000)) throw new Error("Obiettivo non valido");
  const cur = await getGoals(creator);
  const goals = { ...cur.goals, [country]: { ...(cur.goals[country] || {}) } };
  const prev = goals[country][month] ?? null;
  if (v === null) delete goals[country][month];
  else goals[country][month] = Math.round(v);
  const history = [{ country, month, from: prev, to: v, by, at: new Date().toISOString() }, ...(cur.history || [])].slice(0, 100);
  const next = { goals, history };
  await kv.set(GOALS_KEY(creator.slug), next);
  return next;
}
