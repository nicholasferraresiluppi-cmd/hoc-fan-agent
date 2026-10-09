WITH
  date_range AS (
  SELECT
    day,
    DATE_DIFF(DATE(DATE_TRUNC(day, MONTH) + INTERVAL 1 MONTH), DATE_TRUNC(day, MONTH), DAY) AS days_in_month
  FROM
    UNNEST(GENERATE_DATE_ARRAY(DATE_SUB(CURRENT_DATE('UTC'), INTERVAL 6 MONTH), CURRENT_DATE('UTC'))) AS day ),
  transactions AS (
  SELECT
    creator_id,
    DATE(created_at) AS day,
    SUM(COALESCE(CAST(net AS FLOAT64), 0)) AS net
  FROM
    `house-of-creators-358213.postgres.public_transactions`
  GROUP BY
    creator_id,
    day ),
  creators AS (
  SELECT
    id AS creator_id,
    IFNULL(alias, `name`) AS creator_name
  FROM
    `house-of-creators-358213.postgres.public_creators`
  WHERE
    active ),
  targets AS (
  SELECT
    creator_id,
    CAST(`target` AS FLOAT64) AS `target`,
    EXTRACT(YEAR
    FROM
      date) AS year,
    EXTRACT(MONTH
    FROM
      date) AS month
  FROM
    `house-of-creators-358213.postgres.public_creator_analytic_targets` )
SELECT
  d.day,
  c.creator_id,
  c.creator_name,
  IFNULL(ROUND(t.net, 2), 0) AS net,
  IFNULL(ROUND(t.net - LAG(t.net, 30, 0) OVER (PARTITION BY c.creator_id ORDER BY d.day), 2), 0) AS net_diff,
  IFNULL(ROUND(SAFE_DIVIDE(t.net * 100.0, tg.target), 2), 0) AS net_target_percentage,
  IFNULL(ROUND(SAFE_DIVIDE(tg.target, d.days_in_month), 2), 0) AS daily_target,
  IFNULL(ROUND(SAFE_DIVIDE(100.0, d.days_in_month), 2), 0) AS daily_target_percentage,
  IFNULL(ROUND(t.net - SAFE_DIVIDE(tg.target, d.days_in_month), 2), 0) AS net_target_spread,
  IFNULL(ROUND(SAFE_DIVIDE(t.net * 100.0, tg.target) - SAFE_DIVIDE(100.0, d.days_in_month), 2), 0) AS net_target_spread_percentage
FROM
  date_range d
CROSS JOIN
  creators c
LEFT JOIN
  transactions t
ON
  d.day = t.day
  AND c.creator_id = t.creator_id
LEFT JOIN
  targets tg
ON
  c.creator_id = tg.creator_id
  AND EXTRACT(YEAR
  FROM
    d.day) = tg.year
  AND EXTRACT(MONTH
  FROM
    d.day) = tg.month
ORDER BY
  d.day,
  c.creator_id