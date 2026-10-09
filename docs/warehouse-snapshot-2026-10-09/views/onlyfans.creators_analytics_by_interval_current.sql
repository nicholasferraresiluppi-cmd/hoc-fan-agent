WITH
  creators AS (
  SELECT
    id AS creator_id,
    IFNULL(alias, `name`) AS creator_name
  FROM
    `house-of-creators-358213.postgres.public_creators`
  WHERE
    active ),
  intervals AS (
  SELECT
    CURRENT_DATE('UTC') AS day,
    c.creator_id,
    c.creator_name,
    i.name AS interval_name,
    TIMESTAMP(CONCAT(CURRENT_DATE('UTC'), ' ', TIME(ic.started_at))) AS started_at,
  IF
    (TIME(ic.started_at) < TIME(ic.ended_at), TIMESTAMP(CONCAT(CURRENT_DATE('UTC'), ' ', TIME(ic.ended_at))), TIMESTAMP(CONCAT(DATE_ADD(CURRENT_DATE('UTC'), INTERVAL 1 DAY), ' ', TIME(ic.ended_at)))) AS ended_at
  FROM
    creators c
  LEFT JOIN
    `house-of-creators-358213.postgres.public_intervals_creators` ic
  USING
    (creator_id)
  LEFT JOIN
    `house-of-creators-358213.postgres.public_intervals` i
  ON
    ic.interval_id = i.id ),
  transactions_by_intervals AS (
  SELECT
    i.day,
    DATE_DIFF(DATE(DATE_TRUNC(day, MONTH) + INTERVAL 1 MONTH), DATE_TRUNC(day, MONTH), DAY) days_in_month,
    i.creator_id,
    i.creator_name,
    i.interval_name,
    i.started_at,
    i.ended_at,
    COUNT(i.interval_name) OVER (PARTITION BY i.day, i.creator_id) AS intervals_count,
    CAST(SUM(t.net) AS FLOAT64) AS net
  FROM
    intervals i
  LEFT JOIN
    `house-of-creators-358213.postgres.public_transactions` t
  ON
    i.creator_id = t.creator_id
    AND i.started_at <= t.created_at
    AND i.ended_at > t.created_at
  GROUP BY
    i.day,
    i.creator_id,
    i.creator_name,
    i.interval_name,
    i.started_at,
    i.ended_at ),
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
  ti.day,
  ti.creator_id,
  ti.creator_name,
  ti.interval_name,
  ti.started_at,
  ti.ended_at,
  ti.intervals_count,
  IFNULL(ROUND(ti.net, 2), 0) AS net,
  IFNULL(ROUND(ti.net - LAG(ti.net, 1, 0) OVER (PARTITION BY ti.creator_id ORDER BY ti.started_at), 2), 0) AS net_diff,
  IFNULL(ROUND(SAFE_DIVIDE(ti.net * 100.0, tg.target), 2), 0) AS net_target_percentage,
  IFNULL(ROUND(SAFE_DIVIDE(tg.target, ti.days_in_month * ti.intervals_count), 2), 0) AS daily_target,
  IFNULL(ROUND(SAFE_DIVIDE(100.0, ti.days_in_month * ti.intervals_count), 2), 0) AS daily_target_percentage,
  IFNULL(ROUND(ti.net - SAFE_DIVIDE(tg.target, ti.days_in_month * ti.intervals_count), 2), 0) AS net_target_spread,
  IFNULL(ROUND(SAFE_DIVIDE(ti.net * 100.0, tg.target) - SAFE_DIVIDE(100.0, ti.days_in_month * ti.intervals_count), 2), 0) AS net_target_spread_percentage
FROM
  transactions_by_intervals ti
LEFT JOIN
  targets tg
ON
  ti.creator_id = tg.creator_id
  AND EXTRACT(YEAR
  FROM
    ti.day) = tg.year
  AND EXTRACT(MONTH
  FROM
    ti.day) = tg.month
WHERE
  started_at < CURRENT_TIMESTAMP()
  OR ended_at <= CURRENT_TIMESTAMP()