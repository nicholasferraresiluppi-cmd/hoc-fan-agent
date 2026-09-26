// Creator Difficulty — profilo di "difficoltà" del pubblico per creator.
//
// PERCHÉ: ogni giudizio su un operatore passa da una creator, e le creator NON
// sono contesti equivalenti (misurato lug 2026: Gaja vs Alice, stessa lingua IT —
// % fan che hanno mai pagato 29,8% vs 12,2%, PPV mediano $37 vs $6,99, CR 15,5%
// vs 9,9%; e Alice riceve PIÙ new-sub: più traffico ≠ più facile). Senza questo
// contesto, un numero grezzo (es. "CVR 2,18% su una creator fredda") accusa
// l'operatore per la freddezza del pubblico. Questo modulo produce il CONTESTO,
// non un giudizio.
//
// GOVERNANCE / ONESTÀ:
//   - NON entra in score/comp (policy dati-fan: invariante testato). Informa la
//     LETTURA del giudizio (baseline accanto al numero), non il calcolo.
//   - Solo aggregati per creator, nessuna PII fan.
//   - Finestre dichiarate PER metrica (lifetime vs 60g): non si mescolano senza dirlo.
//   - `difficulty_index` è DIREZIONALE (serve a ordinare la tabella): le decisioni
//     si prendono sui componenti, mai sull'indice. Richiede ≥3 componenti presenti.
//   - Pagine FREE/BOP flaggate: monetizzano sull'account paid abbinato (mapping
//     free↔paid non esplicito nel warehouse) → i loro numeri di spesa non sono
//     comparabili e l'indice NON viene calcolato.
//
// Cadenza: il profilo di un pubblico deriva in settimane, non in ore → il cron
// dispatch (giornaliero) ricalcola SOLO se il dato ha più di STALE_AFTER_H ore
// (≈ settimanale), a differenza delle cache sorelle giornaliere (academy-signals).
//
// La matematica (percentili, indice, flag free, staleness) è PURA e vive in
// `creator-difficulty-core.js` (unit test: tests/creator-difficulty.mjs).

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import {
  WINDOW_DAYS,
  DIFFICULTY_COMPONENTS,
  buildProfiles,
  isStale,
} from "@/lib/creator-difficulty-core";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

// v2 (review adversariale 30/07): pct_ever_paid sui soli fan MATURI (≥30g — i
// fan arrivati ieri non hanno avuto tempo di pagare: un'ondata di traffico
// recente faceva sembrare freddo un pubblico solo giovane); CR e ARPPU POOLED
// (SUM/SUM pesato sul traffico, non media di rapporti giornalieri dove il giorno
// da 3 visitatori pesava come quello da 5.000); whale top-1% via ROW_NUMBER
// (PERCENT_RANK dava 0% spurio con pareggi al vertice o con un solo pagante).
export const CREATOR_DIFFICULTY_VERSION = "creator-diff-2"; // bump se cambia la metodologia
const CACHE_KEY = `creator:difficulty:${CREATOR_DIFFICULTY_VERSION}`;
const CACHE_TTL = 15 * 24 * 3600; // 15g di vita: il refresh settimanale rinnova ben prima
export const STALE_AFTER_H = 6 * 24; // il dispatch ricalcola solo oltre questa età (≈ weekly)

function difficultySQL() {
  const data = DATA();
  return `
WITH scope AS (
  SELECT DISTINCT creator_id, creator_name
  FROM \`${data}.onlyfans.reach\`
  WHERE organization_id = '${HOC_ORGANIZATION_ID}'
),
fans AS (
  -- pct_ever_paid solo sui fan MATURI (≥30g di anzianità): i fan appena arrivati
  -- non hanno avuto tempo di pagare — col denominatore lifetime, un'ondata di
  -- traffico recente faceva sembrare "freddo" un pubblico solo GIOVANE.
  SELECT u.creator_id,
         COUNT(*) AS n_fan,
         COUNTIF(u.transaction_count > 0) AS payers_n,
         COUNTIF(DATE(u.started_at) < DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS mature_fans,
         SAFE_DIVIDE(
           COUNTIF(u.transaction_count > 0 AND DATE(u.started_at) < DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)),
           COUNTIF(DATE(u.started_at) < DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
         ) AS pct_ever_paid,
         APPROX_QUANTILES(IF(u.total_net_expenses > 0, u.total_net_expenses, NULL), 100 IGNORE NULLS)[OFFSET(50)] AS ltv_p50,
         APPROX_QUANTILES(IF(u.total_net_expenses > 0, u.total_net_expenses, NULL), 100 IGNORE NULLS)[OFFSET(90)] AS ltv_p90,
         APPROX_QUANTILES(DATE_DIFF(CURRENT_DATE(), DATE(u.started_at), DAY), 100 IGNORE NULLS)[OFFSET(50)] AS tenure_p50_days,
         COUNTIF(DATE(u.started_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS fresh_fans_30d
  FROM \`${data}.onlyfans.users_research\` u
  JOIN scope s USING (creator_id)
  GROUP BY u.creator_id
),
whale AS (
  -- top-1% con conteggio esplicito: PERCENT_RANK>=0.99 sotto ~100 paganti
  -- selezionava solo il rango massimo (0% spurio con pareggi al vertice, e 0%
  -- con un solo pagante). CEIL(n*0.01) con floor a 1 è deterministico sempre.
  SELECT creator_id,
         SAFE_DIVIDE(SUM(IF(rn <= GREATEST(1, CAST(CEIL(n_payers * 0.01) AS INT64)), ltv, 0)), SUM(ltv)) AS whale_share_top1
  FROM (
    SELECT u.creator_id, u.total_net_expenses AS ltv,
           ROW_NUMBER() OVER (PARTITION BY u.creator_id ORDER BY u.total_net_expenses DESC) AS rn,
           COUNT(*) OVER (PARTITION BY u.creator_id) AS n_payers
    FROM \`${data}.onlyfans.users_research\` u
    JOIN scope s USING (creator_id)
    WHERE u.total_net_expenses > 0
  )
  GROUP BY creator_id
),
cr AS (
  -- rapporti POOLED (SUM/SUM), non medie di rapporti giornalieri: con AVG il
  -- giorno da 3 visitatori pesava quanto quello da 5.000. ARPPU pooled =
  -- revenue / fan-attivi-al-giorno (un fan attivo N giorni conta N volte —
  -- dichiarato nella label, non nascosto).
  SELECT t.creator_id,
         SAFE_DIVIDE(SUM(SAFE_CAST(t.new_subs_converted AS FLOAT64)), SUM(SAFE_CAST(t.new_subs AS FLOAT64))) AS cr_avg,
         SAFE_DIVIDE(SUM(SAFE_CAST(t.tot_revenue AS FLOAT64)), SUM(SAFE_CAST(t.unique_users AS FLOAT64))) AS arppu_avg,
         SUM(SAFE_CAST(t.unique_users AS FLOAT64)) AS active_user_days_60d,
         SUM(SAFE_CAST(t.tot_revenue AS FLOAT64)) AS revenue_60d
  FROM \`${data}.onlyfans.transactions_analytics\` t
  JOIN scope s USING (creator_id)
  WHERE DATE(t.calendar_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)
  GROUP BY t.creator_id
),
ppv AS (
  SELECT c.creator_id,
         APPROX_QUANTILES(c.price, 100)[OFFSET(50)] AS ppv_price_p50,
         COUNT(*) AS ppv_sent_60d
  FROM \`${data}.onlyfans.chat\` c
  JOIN scope s USING (creator_id)
  WHERE c.price > 0 AND DATE(c.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)
  GROUP BY c.creator_id
),
subs AS (
  SELECT sb.creator_id, SUM(SAFE_CAST(sb.new_subs AS INT64)) AS new_subs_60d
  FROM \`${data}.onlyfans.subscriptions\` sb
  JOIN scope s USING (creator_id)
  WHERE DATE(sb.calendar_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${WINDOW_DAYS} DAY)
  GROUP BY sb.creator_id
)
SELECT s.creator_id, s.creator_name,
       f.n_fan, f.payers_n, f.mature_fans, f.pct_ever_paid, f.ltv_p50, f.ltv_p90,
       f.tenure_p50_days, f.fresh_fans_30d,
       w.whale_share_top1,
       cr.cr_avg, cr.arppu_avg, cr.active_user_days_60d, cr.revenue_60d,
       ppv.ppv_price_p50, ppv.ppv_sent_60d,
       subs.new_subs_60d
FROM scope s
LEFT JOIN fans f USING (creator_id)
LEFT JOIN whale w USING (creator_id)
LEFT JOIN cr USING (creator_id)
LEFT JOIN ppv USING (creator_id)
LEFT JOIN subs USING (creator_id)
WHERE f.creator_id IS NOT NULL OR cr.creator_id IS NOT NULL`;
}

// ── Cache / compute ──────────────────────────────────────────────────────────

export async function getCachedCreatorDifficulty() {
  return (await kv.get(CACHE_KEY)) || null;
}

export async function computeCreatorDifficulty() {
  const { rows, totalBytesProcessed } = await bqQuery(difficultySQL(), {
    maxBytesBilled: 12 * 1024 * 1024 * 1024, // fusibile: sopra i 12GB la query fallisce, non spende
  });
  const profiles = buildProfiles(rows);
  const payload = {
    version: CREATOR_DIFFICULTY_VERSION,
    window_days: WINDOW_DAYS,
    components: DIFFICULTY_COMPONENTS,
    profiles,
    creators_total: profiles.length,
    free_pages: profiles.filter((p) => p.free_page).length,
    bytes_processed: totalBytesProcessed,
    generated_at: new Date().toISOString(),
  };
  await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL });
  return payload;
}

// Single-flight (review 30/07): il GET su cache-miss e il POST "Ricalcola ora"
// passano da qui — un lock KV NX evita che N richieste concorrenti lancino N job
// BigQuery paralleli (fino a 12GB fatturati CIASCUNO). Ritorna null se un altro
// calcolo è già in volo: il chiamante risponde "in calcolo", non aspetta.
const LOCK_KEY = `creator:difficulty:computing`;

export async function computeCreatorDifficultyOnce() {
  const acquired = await kv.set(LOCK_KEY, 1, { nx: true, ex: 180 });
  if (!acquired) return null;
  try {
    return await computeCreatorDifficulty();
  } finally {
    try { await kv.del(LOCK_KEY); } catch { /* il TTL 180s lo spazza comunque */ }
  }
}

// Per il cron dispatch: ricalcola solo se il dato è più vecchio di STALE_AFTER_H.
// Ritorna una stringa di esito (stile `out.*` del dispatcher).
export async function warmCreatorDifficulty() {
  const cached = await getCachedCreatorDifficulty();
  if (cached && !isStale(cached.generated_at, Date.now(), STALE_AFTER_H)) return "fresh";
  const done = await computeCreatorDifficultyOnce();
  return done ? "recomputed" : "skipped:in-flight";
}

export {
  bigQueryConfigured,
  WINDOW_DAYS,
  DIFFICULTY_COMPONENTS,
  buildProfiles,
  isStale,
};
