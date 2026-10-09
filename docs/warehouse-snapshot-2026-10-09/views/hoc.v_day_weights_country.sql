WITH monthly_totals AS (
  SELECT
    country,
    month,
    SUM(daily_revenue) AS monthly_revenue
  FROM `house-of-creators-358213.hoc.v_daily_revenue_country`
  WHERE month < DATE_TRUNC(CURRENT_DATE(), MONTH)
  GROUP BY 1, 2
),
 
day_weights_raw AS (
  SELECT
    d.country,
    d.day_of_month,
    d.month,
    SAFE_DIVIDE(d.daily_revenue, m.monthly_revenue) AS day_weight
  FROM `house-of-creators-358213.hoc.v_daily_revenue_country` d
  JOIN monthly_totals m
    ON d.country = m.country
   AND d.month   = m.month
)
 
SELECT
  country,
  day_of_month,
 
  -- Peso semplice (media piana, per confronto)
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
 
FROM day_weights_raw
GROUP BY 1, 2;