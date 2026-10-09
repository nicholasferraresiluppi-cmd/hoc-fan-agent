WITH shift_amounts_by_user AS (
  SELECT
    started_date,
    member_id,
    SUM(amount) AS amount_by_member
  FROM
    `house-of-creators-358213.onlyfans.sales_by_interval`
  GROUP BY
    started_date,
    member_id 
),

shift_amounts_by_creator AS (
  SELECT
    started_date,
    creator_id,
    SUM(amount) AS amount_by_creator
  FROM
    `house-of-creators-358213.onlyfans.sales_by_interval` s
  GROUP BY
    started_date,
    creator_id 
),

targets AS (
  SELECT
    creator_id,
    CAST(`target` AS FLOAT64) AS `target`,
    DATE_TRUNC(DATE(`date`), MONTH) AS `month`
  FROM
    `house-of-creators-358213.postgres.public_creator_analytic_targets` 
)

SELECT
  started_date,
  member_id,
  MAX_BY(member_name, started_date) AS member_name,
  s.creator_id,
  MAX_BY(s.creator_name, started_date) AS creator_name,
  amount_by_member,
  SUM(amount) AS amount_by_creator,
  IFNULL(ROUND(SAFE_DIVIDE(SUM(amount) * 100, amount_by_member), 2),0) AS percentage_by_creator,
  AVG(amount) AS avg_amount,
  SUM(effective_working_hours) AS effective_working_hours,
  SUM(expected_working_hours) AS expected_working_hours,
  SUM(extra_working_hours) AS extra_working_hours,
  SUM(count) AS total_shifts,
  SUM(worked) AS worked_shifts,
  IFNULL(ROUND(amount_by_creator - LAG(amount_by_creator, 30, 0) OVER (PARTITION BY s.creator_id ORDER BY started_date), 2), 0) AS amount_diff,
  IFNULL(ROUND(SAFE_DIVIDE(amount_by_creator * 100, t.target), 2), 0) AS target_percentage,
  IFNULL(ROUND(SAFE_DIVIDE(t.target, s.days_in_month), 2), 0) AS daily_target,
  IFNULL(ROUND(SAFE_DIVIDE(100, s.days_in_month), 2), 0) AS daily_target_percentage,
  IFNULL(ROUND(amount_by_creator - SAFE_DIVIDE(t.target, s.days_in_month), 2), 0) AS target_spread,
  IFNULL(ROUND(SAFE_DIVIDE(amount_by_creator * 100, t.target) - SAFE_DIVIDE(100, s.days_in_month), 2), 0) AS target_spread_percentage,
  s.organization_id
FROM
  `house-of-creators-358213.onlyfans.sales_by_interval` AS s
  LEFT JOIN shift_amounts_by_user AS sau USING (started_date, member_id)
  LEFT JOIN shift_amounts_by_creator AS sac USING (started_date, creator_id)
  LEFT JOIN targets AS t ON s.creator_id = t.creator_id AND DATE_TRUNC(s.started_date, MONTH) = t.`month`
GROUP BY
  started_date,
  member_id,
  creator_id,
  organization_id,
  amount_by_member,
  sac.amount_by_creator,
  TARGET,
  days_in_month