WITH
  month_totals AS (
  SELECT
    DATE_TRUNC(started_date, MONTH) AS started_month,
    member_id,
    SUM(amount_by_member) AS amount_by_member
  FROM
    `house-of-creators-358213.onlyfans.sales_by_day`
  GROUP BY
    started_month,
    member_id )
SELECT
  DATE_TRUNC(s.started_date, MONTH) AS started_month,
  s.member_id,
  MAX_BY(s.member_name, s.started_date) AS member_name,
  s.creator_id,
  MAX_BY(s.creator_name, s.started_date) AS creator_name,
  m.amount_by_member,
  SUM(amount_by_creator) AS amount_by_creator,
  IFNULL(ROUND(SAFE_DIVIDE(SUM(amount_by_creator), m.amount_by_member), 2),0) * 100 AS percentage_by_creator,
  AVG(m.amount_by_member) AS avg_amount,
  SUM(effective_working_hours) AS effective_working_hours,
  SUM(expected_working_hours) AS expected_working_hours,
  SUM(extra_working_hours) AS extra_working_hours,
  SUM(total_shifts) AS total_shifts,
  SUM(worked_shifts) AS worked_shifts,
FROM
  `house-of-creators-358213.onlyfans.sales_by_day` s
LEFT JOIN
  month_totals m
ON
  DATE_TRUNC(s.started_date, MONTH) = m.started_month
  AND s.member_id = m.member_id
GROUP BY
  started_month,
  member_id,
  creator_id,
  amount_by_member