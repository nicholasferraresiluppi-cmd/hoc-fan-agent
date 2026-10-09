WITH checkins AS (
  SELECT
    shift_id,
    SUM(TIMESTAMP_DIFF(TIMESTAMP(ended_at), TIMESTAMP(started_at), HOUR)) AS worked_hours
  FROM
    `house-of-creators-358213.postgres.public_checkins`
  WHERE
    ended_at IS NOT NULL
  GROUP BY shift_id
),

takes AS (
  SELECT
    tk.shift_id,
    tk.member_id,
    t.creator_id,
    ROUND(CAST(SUM(t.amount * tk.attribution) AS FLOAT64), 2) AS amount
  FROM
    `house-of-creators-358213.postgres.public_takes` AS tk
    JOIN `house-of-creators-358213.postgres.public_transactions` AS t ON tk.transaction_id = t.id
  WHERE
    `status` = 'ACCEPTED'
  GROUP BY
    shift_id,
    member_id,
    creator_id 
)

SELECT
  s.id AS shift_id,
  s.event_id,
  e.interval_id,
  s.member_id,
  ec.creator_id,
  i.name AS interval_name,
  CONCAT(m.first_name, ' ', m.last_name) AS member_name,
  IFNULL(cr.alias, cr.name) AS creator_name,
  e.started_at,
  e.ended_at,
  DATE(e.started_at) AS started_date,
  DATE_DIFF(DATE(DATE_TRUNC(DATE(e.started_at), MONTH) + INTERVAL 1 MONTH), DATE_TRUNC(DATE(e.started_at), MONTH), DAY) AS days_in_month,
  IFNULL(t.amount, 0) AS amount,
  IFNULL(SUM(c.worked_hours) OVER (PARTITION BY s.id), 0) AS effective_working_hours,
  TIMESTAMP_DIFF(TIMESTAMP(e.ended_at), TIMESTAMP(e.started_at), HOUR) AS expected_working_hours,
  GREATEST(IFNULL(SAFE_SUBTRACT(SUM(c.worked_hours) OVER (PARTITION BY s.id), TIMESTAMP_DIFF(TIMESTAMP(e.ended_at), TIMESTAMP(e.started_at), HOUR)), 0), 0) AS extra_working_hours,
  1 AS count,
  CASE WHEN (c.worked_hours < TIMESTAMP_DIFF(TIMESTAMP(e.ended_at), TIMESTAMP(e.started_at), HOUR)) IS NULL THEN 0 ELSE 1 END AS worked,
  pt.organization_id
FROM
  `house-of-creators-358213.postgres.public_shifts` AS s
  LEFT JOIN `house-of-creators-358213.postgres.public_events` AS e ON s.event_id = e.id
  LEFT JOIN `house-of-creators-358213.postgres.public_events_creators` AS ec USING (event_id)
  LEFT JOIN `house-of-creators-358213.postgres.public_intervals` AS i ON e.interval_id = i.id
  LEFT JOIN checkins AS c ON s.id = c.shift_id
  LEFT JOIN takes AS t ON s.id= t.shift_id AND s.member_id = t.member_id AND ec.creator_id = t.creator_id
  LEFT JOIN `house-of-creators-358213.postgres.public_creators` AS cr ON ec.creator_id = cr.id
  LEFT JOIN `house-of-creators-358213.postgres.public_members` AS m ON s.member_id = m.id
  LEFT JOIN `house-of-creators-358213.postgres.public_talents` AS pt ON pt.id = cr.talent_id