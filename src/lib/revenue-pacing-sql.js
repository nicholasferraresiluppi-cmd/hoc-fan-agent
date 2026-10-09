// Proiezione di fine mese per paese — copia FEDELE della logica delle viste
// BigQuery del dataset `hoc` che alimentavano revenue.hoc.tools:
//   v_daily_revenue_country → daily_rev
//   v_day_weights_country   → rev_day_weights
//   v_new_sub_day_weights   → sub_day_weights
//   v_new_sub_cohort_contribution → cohort
//   v_eom_projection        → query finale
// Copiata nel nostro codice (8 ott 2026) perché quelle viste sono dell'altro
// split: se le cancellano, questa pagina continua a funzionare leggendo solo le
// tabelle grezze `onlyfans.*` (generalizzata a più creator l'8/10: stessa logica, account
// presi dal registro). Verificata riga per riga contro la vista originale
// (stesso output su tutti i 28 campi, 3 paesi). Non cambiare il calcolo senza
// dichiararlo: è il numero che il sales conosce.
//
// Metodo (dal commento della vista originale):
//   - proiezione = MTD ÷ (peso dei giorni trascorsi) × (peso del mese intero), con
//     pesi per giorno del mese sugli ultimi 12 mesi chiusi, 3x gli ultimi 3 mesi,
//     2x fino a 6. Sotto 4 mesi chiusi: lineare (MTD ÷ giorno × giorni del mese).
//   - la media storica 12 mesi è un BENCHMARK, non entra nella proiezione (break
//     strutturale post-ban IG mag-giu 2025).
//   - coorte mobile 30 gg: utenti con evento di iscrizione negli ultimi 30 giorni,
//     revenue generato nel mese corrente.
//   - revenue atteso dai nuovi = nuovi proiettati × conversione storica × spesa
//     media storica per convertito.

const TIER = `CASE
      WHEN DATE_DIFF(DATE_TRUNC(CURRENT_DATE(), MONTH), month, MONTH) <= 3 THEN 3.0
      WHEN DATE_DIFF(DATE_TRUNC(CURRENT_DATE(), MONTH), month, MONTH) <= 6 THEN 2.0
      ELSE 1.0
    END`;

// accounts = [{ creator_id, country }] della creator (vedi live-creators.js). Gli id sono
// numeri del nostro registro, mai input dell'utente: interpolarli è sicuro.
export function eomProjectionSQL(p, accounts) {
  const acc = accounts.map((a) => ({ id: Number(a.creator_id), country: String(a.country).replace(/[^A-Z]/g, "") }));
  const CASE_COUNTRY = (col) => `CASE ${acc.map((a) => `WHEN ${col} = ${a.id} THEN '${a.country}'`).join(" ")} END`;
  const IDS = `(${acc.map((a) => a.id).join(", ")})`;
  const tx = `\`${p}.onlyfans.attributed_transactions\``;
  const subs = `\`${p}.onlyfans.organic_subscriptions\``;
  const PROJ = (mtd, ew, tw) => `CASE
      WHEN COALESCE(cm.n_closed, 0) >= 4 THEN SAFE_DIVIDE(COALESCE(${mtd}, 0), ${ew}.sum_w) * ${tw}.sum_w
      ELSE SAFE_DIVIDE(COALESCE(${mtd}, 0), di.day_today) * di.days_in_month
    END`;
  return `
WITH
-- ── v_daily_revenue_country ──
daily_rev AS (
  SELECT
    DATE(created_at) AS date,
    EXTRACT(DAY FROM created_at) AS day_of_month,
    DATE_TRUNC(DATE(created_at), MONTH) AS month,
    ${CASE_COUNTRY("creator_id")} AS country,
    SUM(net) AS daily_revenue
  FROM ${tx}
  WHERE creator_id IN ${IDS}
    AND DATE(created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
  GROUP BY 1, 2, 3, 4
),

-- ── Mesi validi per lo storico (aggiunta HOC Pro, 09/10/2026) ──
-- La vista originale era pensata per un account maturo. Per un account partito negli
-- ultimi 12 mesi il mese d'inizio è parziale (tutti i giorni a fine mese) e il mese dopo
-- è d'avvio: contati come mesi normali fanno sembrare "leggeri" i primi giorni del mese
-- e GONFIANO la proiezione (caso reale: Martina Scavo, partita il 27/04 → $51k previsti
-- contro ~$38k di ritmo lineare) e abbassano la media storica. Per questi account si
-- escludono il mese d'inizio e quello successivo; per gli account maturi (attivi già
-- dall'inizio della finestra) non cambia nulla rispetto all'originale.
acct_start AS (SELECT country, MIN(date) AS first_date FROM daily_rev GROUP BY 1),
eligible_months AS (
  SELECT DISTINCT d.country, d.month
  FROM daily_rev d JOIN acct_start s ON s.country = d.country
  WHERE d.month < DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND (s.first_date <= DATE_ADD(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH), INTERVAL 2 DAY)
         OR d.month >= DATE_ADD(DATE_TRUNC(s.first_date, MONTH), INTERVAL 2 MONTH))
),

-- ── v_day_weights_country ──
rev_monthly_totals AS (
  SELECT d.country, d.month, SUM(d.daily_revenue) AS monthly_revenue
  FROM daily_rev d
  JOIN eligible_months e ON e.country = d.country AND e.month = d.month
  GROUP BY 1, 2
),
rev_day_weights AS (
  SELECT country, day_of_month,
    SAFE_DIVIDE(SUM(day_weight * ${TIER}), SUM(${TIER})) AS weighted_day_weight
  FROM (
    SELECT d.country, d.day_of_month, d.month, SAFE_DIVIDE(d.daily_revenue, m.monthly_revenue) AS day_weight
    FROM daily_rev d
    JOIN rev_monthly_totals m ON d.country = m.country AND d.month = m.month
  )
  GROUP BY 1, 2
),

-- ── v_new_sub_day_weights ──
daily_new_subs AS (
  SELECT
    DATE(created_at) AS date,
    DATE_TRUNC(DATE(created_at), MONTH) AS month,
    EXTRACT(DAY FROM created_at) AS day_of_month,
    ${CASE_COUNTRY("creator_id")} AS country,
    COUNT(DISTINCT user_id) AS new_subs
  FROM ${subs}
  WHERE creator_id IN ${IDS}
    AND DATE(created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
  GROUP BY 1, 2, 3, 4
),
sub_monthly_totals AS (
  SELECT d.country, d.month, SUM(d.new_subs) AS monthly_new_subs
  FROM daily_new_subs d
  JOIN eligible_months e ON e.country = d.country AND e.month = d.month
  GROUP BY 1, 2
),
sub_day_weights AS (
  SELECT country, day_of_month,
    SAFE_DIVIDE(SUM(day_weight * ${TIER}), SUM(${TIER})) AS weighted_day_weight
  FROM (
    SELECT d.country, d.day_of_month, d.month, SAFE_DIVIDE(d.new_subs, m.monthly_new_subs) AS day_weight
    FROM daily_new_subs d
    JOIN sub_monthly_totals m ON d.country = m.country AND d.month = m.month
  )
  GROUP BY 1, 2
),

-- ── v_new_sub_cohort_contribution ──
first_sub AS (
  SELECT user_id, creator_id, DATE_TRUNC(MIN(DATE(created_at)), MONTH) AS first_sub_month
  FROM ${subs}
  WHERE creator_id IN ${IDS}
  GROUP BY 1, 2
),
transactions_classified AS (
  SELECT
    t.user_id,
    DATE_TRUNC(DATE(t.created_at), MONTH) AS transaction_month,
    t.net,
    ${CASE_COUNTRY("t.creator_id")} AS country,
    CASE WHEN DATE_TRUNC(DATE(t.created_at), MONTH) = fs.first_sub_month THEN 'new_sub' ELSE 'retention' END AS cohort_type
  FROM ${tx} t
  LEFT JOIN first_sub fs ON t.user_id = fs.user_id AND t.creator_id = fs.creator_id
  WHERE t.creator_id IN ${IDS}
    AND DATE(t.created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
),
monthly_first_subs AS (
  SELECT ${CASE_COUNTRY("creator_id")} AS country, first_sub_month AS month, COUNT(DISTINCT user_id) AS total_subs_month
  FROM first_sub
  GROUP BY 1, 2
),
cohort AS (
  SELECT a.*, COALESCE(mfs.total_subs_month, 0) AS total_subs_month
  FROM (
    SELECT country, transaction_month AS month, cohort_type,
      SUM(net) AS revenue,
      COUNT(DISTINCT user_id) AS unique_users,
      SAFE_DIVIDE(SUM(net), COUNT(DISTINCT user_id)) AS revenue_per_user
    FROM transactions_classified
    GROUP BY 1, 2, 3
  ) a
  LEFT JOIN monthly_first_subs mfs ON a.country = mfs.country AND a.month = mfs.month AND a.cohort_type = 'new_sub'
),

-- ── v_eom_projection ──
date_info AS (
  SELECT
    CURRENT_DATE() AS today,
    EXTRACT(DAY FROM CURRENT_DATE()) AS day_today,
    DATE_TRUNC(CURRENT_DATE(), MONTH) AS current_month,
    DATE_DIFF(DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH), DATE_TRUNC(CURRENT_DATE(), MONTH), DAY) AS days_in_month
),
mtd_revenue AS (
  SELECT country, SUM(daily_revenue) AS mtd_revenue
  FROM daily_rev WHERE month = (SELECT current_month FROM date_info) GROUP BY 1
),
mtd_new_subs AS (
  SELECT ${CASE_COUNTRY("creator_id")} AS country, COUNT(DISTINCT user_id) AS mtd_new_subs
  FROM ${subs}
  WHERE creator_id IN ${IDS} AND DATE_TRUNC(DATE(created_at), MONTH) = (SELECT current_month FROM date_info)
  GROUP BY 1
),
elapsed_rev_weight AS (
  SELECT country, SUM(weighted_day_weight) AS sum_w FROM rev_day_weights
  WHERE day_of_month <= (SELECT day_today FROM date_info) GROUP BY 1
),
total_rev_weight AS (SELECT country, SUM(weighted_day_weight) AS sum_w FROM rev_day_weights GROUP BY 1),
elapsed_sub_weight AS (
  SELECT country, SUM(weighted_day_weight) AS sum_w FROM sub_day_weights
  WHERE day_of_month <= (SELECT day_today FROM date_info) GROUP BY 1
),
total_sub_weight AS (SELECT country, SUM(weighted_day_weight) AS sum_w FROM sub_day_weights GROUP BY 1),
hist_avg_revenue AS (
  SELECT country, AVG(monthly_revenue) AS avg_monthly_revenue
  FROM (
    SELECT d.country, d.month, SUM(d.daily_revenue) AS monthly_revenue
    FROM daily_rev d
    JOIN eligible_months e ON e.country = d.country AND e.month = d.month
    WHERE d.month >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
    GROUP BY 1, 2
  )
  GROUP BY 1
),
hist_avg_subs AS (
  SELECT m.country, AVG(m.monthly_new_subs) AS avg_monthly_new_subs
  FROM (
    SELECT ${CASE_COUNTRY("creator_id")} AS country, DATE_TRUNC(DATE(created_at), MONTH) AS month, COUNT(DISTINCT user_id) AS monthly_new_subs
    FROM ${subs}
    WHERE creator_id IN ${IDS}
      AND DATE_TRUNC(DATE(created_at), MONTH) < (SELECT current_month FROM date_info)
      AND DATE_TRUNC(DATE(created_at), MONTH) >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
    GROUP BY 1, 2
  ) m
  JOIN eligible_months e ON e.country = m.country AND e.month = m.month
  GROUP BY 1
),
new_sub_coeff AS (
  SELECT c.country, AVG(c.revenue_per_user) AS avg_revenue_per_new_sub
  FROM cohort c
  JOIN eligible_months e ON e.country = c.country AND e.month = c.month
  WHERE c.cohort_type = 'new_sub'
    AND c.month < (SELECT current_month FROM date_info)
    AND c.month >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
  GROUP BY 1
),
hist_conversion_rate AS (
  SELECT c.country, AVG(SAFE_DIVIDE(c.unique_users, c.total_subs_month)) AS avg_conversion_rate
  FROM cohort c
  JOIN eligible_months e ON e.country = c.country AND e.month = c.month
  WHERE c.cohort_type = 'new_sub'
    AND c.month < (SELECT current_month FROM date_info)
    AND c.month >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
    AND c.total_subs_month > 0
  GROUP BY 1
),
current_cohort AS (
  SELECT country,
    SUM(CASE WHEN cohort_type = 'new_sub' THEN revenue ELSE 0 END) AS new_sub_revenue_mtd,
    SUM(CASE WHEN cohort_type = 'retention' THEN revenue ELSE 0 END) AS retention_revenue_mtd,
    SUM(CASE WHEN cohort_type = 'new_sub' THEN unique_users ELSE 0 END) AS new_sub_converting_users_mtd
  FROM cohort
  WHERE month = (SELECT current_month FROM date_info)
  GROUP BY 1
),
rolling_recent_subs AS (
  SELECT DISTINCT user_id, creator_id
  FROM ${subs}
  WHERE creator_id IN ${IDS} AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
),
rolling_cohort_subs AS (
  SELECT ${CASE_COUNTRY("creator_id")} AS country, COUNT(DISTINCT user_id) AS rolling_cohort_total_subs
  FROM rolling_recent_subs GROUP BY 1
),
rolling_cohort_revenue AS (
  SELECT ${CASE_COUNTRY("t.creator_id")} AS country,
    SUM(t.net) AS rolling_cohort_revenue_mtd,
    COUNT(DISTINCT t.user_id) AS rolling_cohort_converting_users
  FROM ${tx} t
  JOIN rolling_recent_subs rrs ON t.user_id = rrs.user_id AND t.creator_id = rrs.creator_id
  WHERE DATE_TRUNC(DATE(t.created_at), MONTH) = (SELECT current_month FROM date_info)
  GROUP BY 1
),
closed_months AS (
  SELECT country, COUNT(DISTINCT month) AS n_closed FROM eligible_months GROUP BY 1
),
all_countries AS (${acc.map((a) => `SELECT '${a.country}' AS country`).join(" UNION ALL ")})

SELECT
  ac.country,
  di.today AS as_of_date,
  di.day_today AS day_of_month,
  di.days_in_month,
  di.days_in_month - di.day_today AS days_remaining,
  COALESCE(mr.mtd_revenue, 0) AS revenue_mtd,
  CASE WHEN COALESCE(cm.n_closed, 0) >= 4 THEN 'day_weight' ELSE 'linear' END AS projection_method,
  COALESCE(cm.n_closed, 0) AS closed_months_count,
  ${PROJ("mr.mtd_revenue", "erw", "trw")} AS revenue_proj_eom,
  COALESCE(har.avg_monthly_revenue, 0) AS revenue_hist_avg,
  ${PROJ("mr.mtd_revenue", "erw", "trw")} - COALESCE(har.avg_monthly_revenue, 0) AS revenue_delta_vs_hist,
  COALESCE(ms.mtd_new_subs, 0) AS new_subs_mtd,
  ${PROJ("ms.mtd_new_subs", "esw", "tsw")} AS new_subs_proj_eom,
  COALESCE(has.avg_monthly_new_subs, 0) AS new_subs_hist_avg,
  COALESCE(cc.new_sub_revenue_mtd, 0) AS new_sub_revenue_mtd,
  COALESCE(cc.retention_revenue_mtd, 0) AS retention_revenue_mtd,
  SAFE_DIVIDE(COALESCE(cc.new_sub_revenue_mtd, 0),
    NULLIF(COALESCE(cc.new_sub_revenue_mtd, 0) + COALESCE(cc.retention_revenue_mtd, 0), 0)) AS new_sub_revenue_pct_mtd,
  COALESCE(cc.new_sub_converting_users_mtd, 0) AS current_month_converting_new_subs,
  SAFE_DIVIDE(COALESCE(cc.new_sub_revenue_mtd, 0), NULLIF(cc.new_sub_converting_users_mtd, 0)) AS current_month_arppu,
  SAFE_DIVIDE(COALESCE(cc.new_sub_revenue_mtd, 0), NULLIF(COALESCE(ms.mtd_new_subs, 0), 0)) AS current_month_ltv,
  COALESCE(rcs.rolling_cohort_total_subs, 0) AS rolling_cohort_total_subs,
  COALESCE(rcr.rolling_cohort_converting_users, 0) AS rolling_cohort_converting_users,
  COALESCE(rcr.rolling_cohort_revenue_mtd, 0) AS rolling_cohort_revenue_mtd,
  SAFE_DIVIDE(COALESCE(rcr.rolling_cohort_revenue_mtd, 0), NULLIF(COALESCE(mr.mtd_revenue, 0), 0)) AS rolling_cohort_revenue_pct,
  COALESCE(nsc.avg_revenue_per_new_sub, 0) AS avg_revenue_per_new_sub,
  COALESCE(hcr.avg_conversion_rate, 0) AS hist_conversion_rate,
  ${PROJ("ms.mtd_new_subs", "esw", "tsw")}
    * COALESCE(hcr.avg_conversion_rate, 0)
    * COALESCE(nsc.avg_revenue_per_new_sub, 0) AS new_sub_expected_eom_revenue,
  CASE
    WHEN di.day_today <= 7 THEN 'BASSA'
    WHEN di.day_today <= 15 THEN 'MEDIA'
    WHEN di.day_today <= 25 THEN 'ALTA'
    ELSE 'MOLTO ALTA'
  END AS projection_confidence
FROM all_countries ac
CROSS JOIN date_info di
LEFT JOIN mtd_revenue mr ON ac.country = mr.country
LEFT JOIN mtd_new_subs ms ON ac.country = ms.country
LEFT JOIN elapsed_rev_weight erw ON ac.country = erw.country
LEFT JOIN total_rev_weight trw ON ac.country = trw.country
LEFT JOIN elapsed_sub_weight esw ON ac.country = esw.country
LEFT JOIN total_sub_weight tsw ON ac.country = tsw.country
LEFT JOIN hist_avg_revenue har ON ac.country = har.country
LEFT JOIN hist_avg_subs has ON ac.country = has.country
LEFT JOIN new_sub_coeff nsc ON ac.country = nsc.country
LEFT JOIN hist_conversion_rate hcr ON ac.country = hcr.country
LEFT JOIN current_cohort cc ON ac.country = cc.country
LEFT JOIN rolling_cohort_subs rcs ON ac.country = rcs.country
LEFT JOIN rolling_cohort_revenue rcr ON ac.country = rcr.country
LEFT JOIN closed_months cm ON ac.country = cm.country`;
}
