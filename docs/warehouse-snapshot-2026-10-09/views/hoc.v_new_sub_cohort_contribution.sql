WITH first_sub AS (
  -- Prima data di sottoscrizione per ogni coppia user+creator
  SELECT
    user_id,
    creator_id,
    DATE_TRUNC(MIN(DATE(created_at)), MONTH) AS first_sub_month
  FROM `house-of-creators-358213.onlyfans.organic_subscriptions`
  WHERE creator_id IN (411251447, 250167499, 1000000344)
  GROUP BY 1, 2
),
 
transactions_classified AS (
  SELECT
    t.user_id,
    t.creator_id,
    DATE_TRUNC(DATE(t.created_at), MONTH)    AS transaction_month,
    t.net,
    CASE
      WHEN t.creator_id = 411251447  THEN 'EN'
      WHEN t.creator_id = 250167499  THEN 'IT'
      WHEN t.creator_id = 1000000344 THEN 'ES'
    END                                       AS country,
    CASE
      WHEN DATE_TRUNC(DATE(t.created_at), MONTH) = fs.first_sub_month THEN 'new_sub'
      ELSE 'retention'
    END                                       AS cohort_type
  FROM `house-of-creators-358213.onlyfans.attributed_transactions` t
  LEFT JOIN first_sub fs
    ON t.user_id    = fs.user_id
   AND t.creator_id = fs.creator_id
  WHERE
    t.creator_id IN (411251447, 250167499, 1000000344)
    AND date(t.created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
),
 
-- Tutti gli utenti con prima sub in ogni mese (inclusi non convertiti in tx)
monthly_first_subs AS (
  SELECT
    CASE
      WHEN creator_id = 411251447  THEN 'EN'
      WHEN creator_id = 250167499  THEN 'IT'
      WHEN creator_id = 1000000344 THEN 'ES'
    END                             AS country,
    first_sub_month                 AS month,
    COUNT(DISTINCT user_id)         AS total_subs_month
  FROM first_sub
  GROUP BY 1, 2
),
 
aggregated AS (
  SELECT
    country,
    transaction_month                          AS month,
    cohort_type,
    SUM(net)                            AS revenue,
    COUNT(DISTINCT user_id)                    AS unique_users,
    SAFE_DIVIDE(SUM(net), COUNT(DISTINCT user_id)) AS revenue_per_user
  FROM transactions_classified
  GROUP BY 1, 2, 3
)
 
SELECT
  a.country,
  a.month,
  a.cohort_type,
  a.revenue,
  a.unique_users,
  a.revenue_per_user,
  -- Solo per new_sub: totale prime-sub in quel mese (anche non convertiti)
  -- Per retention: 0 (non significativo)
  COALESCE(mfs.total_subs_month, 0) AS total_subs_month
FROM aggregated a
LEFT JOIN monthly_first_subs mfs
  ON a.country      = mfs.country
 AND a.month        = mfs.month
 AND a.cohort_type  = 'new_sub';