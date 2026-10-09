-- ============================================================
-- VIEW 5: v_eom_projection  ← FONTE PRINCIPALE LOOKER STUDIO
-- Una riga per country, aggiornata ogni giorno.
--
-- PROIEZIONE: pura day-weight (no blending storico)
--   La media storica è mantenuta come benchmark, NON come ancora.
--   Motivazione: break strutturale post-ban IG mag-giu 2025
--   (-77.5% new subs YoY, ARPPU da €4-5 a €20-37).
--
-- FALLBACK LINEARE (country con < 4 mesi chiusi):
--   Con meno di 4 mesi chiusi i day-weight per i giorni 26-31 si
--   basano su 1-2 osservazioni e amplificano il rumore.
--   Sotto soglia si usa la proiezione lineare: mtd / day_today * days_in_month.
--   ES aperta il 25/03/2026 → passerà automaticamente a day-weight
--   appena supera i 4 mesi chiusi (intorno ad agosto 2026).
--   Il campo projection_method indica quale metodo è in uso.
--
-- ROLLING COHORT 30GG (cross-mese):
--   Misura il contributo a revenue MTD degli utenti con evento
--   sub negli ultimi 30gg, indipendentemente dal mese di calendario.
--   Nessun vincolo MIN: include re-iscrizioni recenti (non fidelizzati).
--   Nota: organic_subscriptions non registra rinnovi automatici
--   (profili free → nessun falso positivo).
--
-- NEW_SUB_EXPECTED_EOM_REVENUE:
--   new_subs_proj_eom × hist_conversion_rate × avg_revenue_per_new_sub
--   (proj = proiezione attiva per la country; conv = % che genera almeno 1 tx;
--    rev = revenue medio per utente convertito)
-- ============================================================
 
WITH
date_info AS (
  SELECT
    CURRENT_DATE()                                                   AS today,
    EXTRACT(DAY FROM CURRENT_DATE())                                 AS day_today,
    DATE_TRUNC(CURRENT_DATE(), MONTH)                                AS current_month,
    DATE_DIFF(
      DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH),
      DATE_TRUNC(CURRENT_DATE(), MONTH), DAY
    )                                                                AS days_in_month
),
 
-- Revenue MTD per country (mese corrente)
mtd_revenue AS (
  SELECT country, SUM(daily_revenue) AS mtd_revenue
  FROM `house-of-creators-358213.hoc.v_daily_revenue_country`
  WHERE month = (SELECT current_month FROM date_info)
  GROUP BY 1
),
 
-- Nuovi sub MTD per country (mese corrente)
mtd_new_subs AS (
  SELECT
    CASE WHEN creator_id = 411251447  THEN 'EN'
         WHEN creator_id = 250167499  THEN 'IT'
         WHEN creator_id = 1000000344 THEN 'ES' END AS country,
    COUNT(DISTINCT user_id) AS mtd_new_subs
  FROM `house-of-creators-358213.onlyfans.organic_subscriptions`
  WHERE creator_id IN (411251447, 250167499, 1000000344)
    AND DATE_TRUNC(DATE(created_at), MONTH) = (SELECT current_month FROM date_info)
  GROUP BY 1
),
 
-- Pesi revenue: giorni trascorsi e totale mese
elapsed_rev_weight AS (
  SELECT country, SUM(weighted_day_weight) AS sum_w
  FROM `house-of-creators-358213.hoc.v_day_weights_country`
  WHERE day_of_month <= (SELECT day_today FROM date_info)
  GROUP BY 1
),
 
total_rev_weight AS (
  SELECT country, SUM(weighted_day_weight) AS sum_w
  FROM `house-of-creators-358213.hoc.v_day_weights_country`
  GROUP BY 1
),
 
-- Pesi new subs: giorni trascorsi e totale mese
elapsed_sub_weight AS (
  SELECT country, SUM(weighted_day_weight) AS sum_w
  FROM `house-of-creators-358213.hoc.v_new_sub_day_weights`
  WHERE day_of_month <= (SELECT day_today FROM date_info)
  GROUP BY 1
),
 
total_sub_weight AS (
  SELECT country, SUM(weighted_day_weight) AS sum_w
  FROM `house-of-creators-358213.hoc.v_new_sub_day_weights`
  GROUP BY 1
),
 
-- Benchmark: media storica revenue ultimi 12 mesi chiusi (NON ancora proiezione)
hist_avg_revenue AS (
  SELECT country, AVG(monthly_revenue) AS avg_monthly_revenue
  FROM (
    SELECT country, month, SUM(daily_revenue) AS monthly_revenue
    FROM `house-of-creators-358213.hoc.v_daily_revenue_country`
    WHERE month < (SELECT current_month FROM date_info)
      AND month >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
    GROUP BY 1, 2
  )
  GROUP BY 1
),
 
-- Benchmark: media storica new subs ultimi 12 mesi chiusi
hist_avg_subs AS (
  SELECT
    CASE WHEN creator_id = 411251447  THEN 'EN'
         WHEN creator_id = 250167499  THEN 'IT'
         WHEN creator_id = 1000000344 THEN 'ES' END AS country,
    AVG(monthly_new_subs) AS avg_monthly_new_subs
  FROM (
    SELECT creator_id,
           DATE_TRUNC(DATE(created_at), MONTH) AS month,
           COUNT(DISTINCT user_id) AS monthly_new_subs
    FROM `house-of-creators-358213.onlyfans.organic_subscriptions`
    WHERE creator_id IN (411251447, 250167499, 1000000344)
      AND DATE_TRUNC(DATE(created_at), MONTH) < (SELECT current_month FROM date_info)
      AND DATE_TRUNC(DATE(created_at), MONTH) >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
    GROUP BY 1, 2
  )
  GROUP BY 1
),
 
-- Coefficiente: revenue medio per utente convertito (new_sub cohort, 12 mesi)
new_sub_coeff AS (
  SELECT country, AVG(revenue_per_user) AS avg_revenue_per_new_sub
  FROM `house-of-creators-358213.hoc.v_new_sub_cohort_contribution`
  WHERE cohort_type = 'new_sub'
    AND month < (SELECT current_month FROM date_info)
    AND month >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
  GROUP BY 1
),
 
-- Tasso di conversione storico: % di prime-sub che generano almeno 1 transazione
-- Denominatore = total_subs_month (da View 3, include anche i non convertiti)
hist_conversion_rate AS (
  SELECT country,
         AVG(SAFE_DIVIDE(unique_users, total_subs_month)) AS avg_conversion_rate
  FROM `house-of-creators-358213.hoc.v_new_sub_cohort_contribution`
  WHERE cohort_type  = 'new_sub'
    AND month < (SELECT current_month FROM date_info)
    AND month >= DATE_SUB((SELECT current_month FROM date_info), INTERVAL 12 MONTH)
    AND total_subs_month > 0
  GROUP BY 1
),
 
-- Cohort contribution mese corrente (new_sub vs retention)
-- unique_users per new_sub = utenti prime-sub del mese che hanno generato almeno 1 tx
current_cohort AS (
  SELECT country,
         SUM(CASE WHEN cohort_type = 'new_sub'   THEN revenue      ELSE 0 END) AS new_sub_revenue_mtd,
         SUM(CASE WHEN cohort_type = 'retention' THEN revenue      ELSE 0 END) AS retention_revenue_mtd,
         SUM(CASE WHEN cohort_type = 'new_sub'   THEN unique_users ELSE 0 END) AS new_sub_converting_users_mtd
  FROM `house-of-creators-358213.hoc.v_new_sub_cohort_contribution`
  WHERE month = (SELECT current_month FROM date_info)
  GROUP BY 1
),
 
-- Rolling cohort: utenti con evento sub negli ultimi 30gg (cross-mese)
-- No MIN: include re-iscrizioni recenti (non fidelizzati si comportano come new)
-- Safe: organic_subscriptions non registra rinnovi (profili free)
rolling_recent_subs AS (
  SELECT DISTINCT user_id, creator_id
  FROM `house-of-creators-358213.onlyfans.organic_subscriptions`
  WHERE creator_id IN (411251447, 250167499, 1000000344)
    AND DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
),
 
rolling_cohort_subs AS (
  SELECT
    CASE WHEN creator_id = 411251447  THEN 'EN'
         WHEN creator_id = 250167499  THEN 'IT'
         WHEN creator_id = 1000000344 THEN 'ES' END AS country,
    COUNT(DISTINCT user_id) AS rolling_cohort_total_subs
  FROM rolling_recent_subs
  GROUP BY 1
),
 
rolling_cohort_revenue AS (
  SELECT
    CASE WHEN t.creator_id = 411251447  THEN 'EN'
         WHEN t.creator_id = 250167499  THEN 'IT'
         WHEN t.creator_id = 1000000344 THEN 'ES' END AS country,
    SUM(t.net)                AS rolling_cohort_revenue_mtd,
    COUNT(DISTINCT t.user_id) AS rolling_cohort_converting_users
  FROM `house-of-creators-358213.onlyfans.attributed_transactions` t
  JOIN rolling_recent_subs rrs
    ON t.user_id = rrs.user_id AND t.creator_id = rrs.creator_id
  WHERE DATE_TRUNC(DATE(t.created_at), MONTH) = (SELECT current_month FROM date_info)
  GROUP BY 1
),
 
-- Mesi chiusi disponibili per country (determina metodo proiezione)
-- Soglia: >= 4 mesi chiusi → day-weight affidabile; < 4 → fallback lineare
-- ES aperta 25/03/2026: usa lineare fino a ~ago 2026
closed_months AS (
  SELECT country, COUNT(DISTINCT month) AS n_closed
  FROM `house-of-creators-358213.hoc.v_daily_revenue_country`
  WHERE month < (SELECT current_month FROM date_info)
  GROUP BY 1
),
 
all_countries AS (
  SELECT 'EN' AS country UNION ALL SELECT 'IT' UNION ALL SELECT 'ES'
)
 
SELECT
  ac.country,
 
  -- Contesto data
  di.today                                                           AS as_of_date,
  di.day_today                                                       AS day_of_month,
  di.days_in_month,
  di.days_in_month - di.day_today                                    AS days_remaining,
 
  -- ── REVENUE ───────────────────────────────────────────────────────
  COALESCE(mr.mtd_revenue, 0)                                        AS revenue_mtd,
 
  -- Metodo proiezione: day-weight se >= 4 mesi chiusi, lineare altrimenti
  CASE
    WHEN COALESCE(cm.n_closed, 0) >= 4 THEN 'day_weight'
    ELSE                                     'linear'
  END                                                                AS projection_method,
  COALESCE(cm.n_closed, 0)                                           AS closed_months_count,
 
  -- Proiezione revenue EOM
  -- day-weight: usa pesi 3-tier su 12 mesi storico
  -- lineare: mtd / giorni_trascorsi * giorni_mese (più stabile con poca storia)
  CASE
    WHEN COALESCE(cm.n_closed, 0) >= 4
      THEN SAFE_DIVIDE(COALESCE(mr.mtd_revenue, 0), erw.sum_w) * trw.sum_w
    ELSE
      SAFE_DIVIDE(COALESCE(mr.mtd_revenue, 0), di.day_today) * di.days_in_month
  END                                                                AS revenue_proj_eom,
 
  -- Benchmark storico 12 mesi (NON usato come ancora)
  COALESCE(har.avg_monthly_revenue, 0)                               AS revenue_hist_avg,
 
  -- Delta proiezione vs benchmark
  CASE
    WHEN COALESCE(cm.n_closed, 0) >= 4
      THEN SAFE_DIVIDE(COALESCE(mr.mtd_revenue, 0), erw.sum_w) * trw.sum_w
    ELSE
      SAFE_DIVIDE(COALESCE(mr.mtd_revenue, 0), di.day_today) * di.days_in_month
  END - COALESCE(har.avg_monthly_revenue, 0)                         AS revenue_delta_vs_hist,
 
  -- ── NEW SUBS ──────────────────────────────────────────────────────
  COALESCE(ms.mtd_new_subs, 0)                                       AS new_subs_mtd,
 
  -- Proiezione new subs EOM (stesso metodo della revenue per coerenza)
  CASE
    WHEN COALESCE(cm.n_closed, 0) >= 4
      THEN SAFE_DIVIDE(COALESCE(ms.mtd_new_subs, 0), esw.sum_w) * tsw.sum_w
    ELSE
      SAFE_DIVIDE(COALESCE(ms.mtd_new_subs, 0), di.day_today) * di.days_in_month
  END                                                                AS new_subs_proj_eom,
 
  -- Benchmark storico new subs 12 mesi
  COALESCE(has.avg_monthly_new_subs, 0)                              AS new_subs_hist_avg,
 
  -- ── COHORT CONTRIBUTION (mese corrente, calendario) ───────────────
  COALESCE(cc.new_sub_revenue_mtd, 0)                                AS new_sub_revenue_mtd,
  COALESCE(cc.retention_revenue_mtd, 0)                              AS retention_revenue_mtd,
 
  -- % revenue MTD da new_sub cohort (prime sub del mese corrente)
  SAFE_DIVIDE(
    COALESCE(cc.new_sub_revenue_mtd, 0),
    NULLIF(COALESCE(cc.new_sub_revenue_mtd, 0) + COALESCE(cc.retention_revenue_mtd, 0), 0)
  )                                                                  AS new_sub_revenue_pct_mtd,
 
  -- New sub del mese che hanno generato almeno 1 transazione
  COALESCE(cc.new_sub_converting_users_mtd, 0)                      AS current_month_converting_new_subs,
 
  -- ARPPU mese corrente: spesa media per new sub convertito del mese
  SAFE_DIVIDE(
    COALESCE(cc.new_sub_revenue_mtd, 0),
    NULLIF(cc.new_sub_converting_users_mtd, 0)
  )                                                                  AS current_month_arppu,
 
  -- LTV mese corrente: revenue new sub / tutti i new sub (inclusi non convertiti)
  SAFE_DIVIDE(
    COALESCE(cc.new_sub_revenue_mtd, 0),
    NULLIF(COALESCE(ms.mtd_new_subs, 0), 0)
  )                                                                  AS current_month_ltv,
 
  -- ── ROLLING COHORT 30GG (cross-mese) ──────────────────────────────
  -- Utenti con evento sub negli ultimi 30gg, revenue generato nel mese corrente
  COALESCE(rcs.rolling_cohort_total_subs, 0)                         AS rolling_cohort_total_subs,
  COALESCE(rcr.rolling_cohort_converting_users, 0)                   AS rolling_cohort_converting_users,
  COALESCE(rcr.rolling_cohort_revenue_mtd, 0)                        AS rolling_cohort_revenue_mtd,
 
  -- % del revenue MTD totale generata dal rolling cohort
  SAFE_DIVIDE(
    COALESCE(rcr.rolling_cohort_revenue_mtd, 0),
    NULLIF(COALESCE(mr.mtd_revenue, 0), 0)
  )                                                                  AS rolling_cohort_revenue_pct,
 
  -- ── NEW SUB REVENUE ATTESO EOM ────────────────────────────────────
  -- Coefficiente storico: €/utente convertito nel mese di acquisizione
  COALESCE(nsc.avg_revenue_per_new_sub, 0)                           AS avg_revenue_per_new_sub,
 
  -- % storica prime-sub che generano almeno 1 transazione
  COALESCE(hcr.avg_conversion_rate, 0)                               AS hist_conversion_rate,
 
  -- Revenue atteso EOM dai new sub: proj_subs × conv_rate × rev_per_converter
  -- Usa lo stesso metodo (day-weight o lineare) della proiezione principale
  CASE
    WHEN COALESCE(cm.n_closed, 0) >= 4
      THEN SAFE_DIVIDE(COALESCE(ms.mtd_new_subs, 0), esw.sum_w) * tsw.sum_w
    ELSE
      SAFE_DIVIDE(COALESCE(ms.mtd_new_subs, 0), di.day_today) * di.days_in_month
  END
    * COALESCE(hcr.avg_conversion_rate, 0)
    * COALESCE(nsc.avg_revenue_per_new_sub, 0)                       AS new_sub_expected_eom_revenue,
 
  -- ── CONFIDENCE ────────────────────────────────────────────────────
  CASE
    WHEN di.day_today <= 7  THEN 'BASSA'
    WHEN di.day_today <= 15 THEN 'MEDIA'
    WHEN di.day_today <= 25 THEN 'ALTA'
    ELSE                         'MOLTO ALTA'
  END                                                                AS projection_confidence
 
FROM all_countries ac
CROSS JOIN date_info di
LEFT JOIN mtd_revenue               mr  ON ac.country = mr.country
LEFT JOIN mtd_new_subs              ms  ON ac.country = ms.country
LEFT JOIN elapsed_rev_weight        erw ON ac.country = erw.country
LEFT JOIN total_rev_weight          trw ON ac.country = trw.country
LEFT JOIN elapsed_sub_weight        esw ON ac.country = esw.country
LEFT JOIN total_sub_weight          tsw ON ac.country = tsw.country
LEFT JOIN hist_avg_revenue          har ON ac.country = har.country
LEFT JOIN hist_avg_subs             has ON ac.country = has.country
LEFT JOIN new_sub_coeff             nsc ON ac.country = nsc.country
LEFT JOIN hist_conversion_rate      hcr ON ac.country = hcr.country
LEFT JOIN current_cohort            cc  ON ac.country = cc.country
LEFT JOIN rolling_cohort_subs       rcs ON ac.country = rcs.country
LEFT JOIN rolling_cohort_revenue    rcr ON ac.country = rcr.country
LEFT JOIN closed_months             cm  ON ac.country = cm.country;