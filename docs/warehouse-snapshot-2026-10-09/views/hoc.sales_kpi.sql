
WITH base AS (
  SELECT
    creator_id,
    creator_name,
    DATE_TRUNC(calendar_date, MONTH) AS month_date,
    CAST(net AS FLOAT64) AS net
  FROM `onlyfans.attributed_transactions`
  WHERE net IS NOT NULL
    AND net > 0
),

-- Media ponderata mensile
agg AS (
  SELECT
    creator_id,
    creator_name,
    month_date,
    COUNT(*) AS num_transactions,
    SUM(net) AS total_revenue,
    SAFE_DIVIDE(SUM(net), COUNT(*)) AS avg_transaction
  FROM base
  GROUP BY creator_id, creator_name, month_date
),

-- Mediana vera mensile
med AS (
  SELECT DISTINCT
    creator_id,
    creator_name,
    month_date,
    PERCENTILE_CONT(net, 0.5) OVER (PARTITION BY creator_id, month_date) AS median_transaction
  FROM base
)

-- Join risultati
SELECT
  a.creator_id,
  a.creator_name,
  a.month_date,
  a.num_transactions,
  a.total_revenue,
  a.avg_transaction,
  m.median_transaction,
  SAFE_DIVIDE(a.avg_transaction, m.median_transaction) AS RR
FROM agg a
JOIN med m
  USING (creator_id, creator_name, month_date);