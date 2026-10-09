WITH daily_new_subs AS (
  SELECT
    DATE(created_at)                          AS date,
    DATE_TRUNC(DATE(created_at), MONTH)       AS month,
    EXTRACT(DAY FROM created_at)              AS day_of_month,
    CASE
      WHEN creator_id = 411251447  THEN 'EN'
      WHEN creator_id = 250167499  THEN 'IT'
      WHEN creator_id = 1000000344 THEN 'ES'
    END                                       AS country,
    COUNT(DISTINCT user_id)                   AS new_subs
  FROM `house-of-creators-358213.onlyfans.organic_subscriptions`
  WHERE
    creator_id IN (411251447, 250167499, 1000000344)
    AND date(created_at) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
  GROUP BY 1, 2, 3, 4
),
 
monthly_totals AS (
  SELECT
    country,
    month,
    SUM(new_subs) AS monthly_new_subs
  FROM daily_new_subs
  WHERE month < DATE_TRUNC(CURRENT_DATE(), MONTH)
  GROUP BY 1, 2
),
 
weights_raw AS (
  SELECT
    d.country,
    d.day_of_month,
    d.month,
    SAFE_DIVIDE(d.new_subs, m.monthly_new_subs) AS day_weight
  FROM daily_new_subs d
  JOIN monthly_totals m
    ON d.country = m.country
   AND d.month   = m.month
)
 
SELECT
  country,
  day_of_month,
  AVG(day_weight) AS avg_day_weight,
 
  -- Peso ponderato 3-tier: ≤3 mesi = 3x | ≤6 mesi = 2x | resto = 1x
  SAFE_DIVIDE(
    SUM(day_weight * CASE
      WHEN DATE_DIFF(DATE_TRUNC(CURRENT_DATE(), MONTH), month, MONTH) <= 3 THEN 3.0
      WHEN DATE_DIFF(DATE_TRUNC(CURRENT_DATE(), MONTH), month, MONTH) <= 6 THEN 2.0
      ELSE 1.0
    END),
    SUM(CASE
      WHEN DATE_DIFF(DATE_TRUNC(CURRENT_DATE(), MONTH), month, MONTH) <= 3 THEN 3.0
      WHEN DATE_DIFF(DATE_TRUNC(CURRENT_DATE(), MONTH), month, MONTH) <= 6 THEN 2.0
      ELSE 1.0
    END)
  ) AS weighted_day_weight
 
FROM weights_raw
GROUP BY 1, 2;