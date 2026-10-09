SELECT
  c.name AS creator_name,
  SUM(CASE WHEN s.calendar_date = CURRENT_DATE() THEN s.net ELSE 0 END) AS revenue_today,
  SUM(CASE WHEN s.calendar_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.net ELSE 0 END) AS revenue_yesterday,
  SUM(CASE WHEN s.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.net ELSE 0 END) AS revenue_last_3_days,
  SUM(CASE WHEN s.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.net ELSE 0 END) AS revenue_last_7_days,
  SUM(CASE WHEN s.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.net ELSE 0 END) AS revenue_last_14_days,
  SUM(CASE WHEN s.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.net ELSE 0 END) AS revenue_last_28_days
FROM
  `hoc.attributed_transactions` AS s
LEFT JOIN
  hoc.creators AS c
ON
  c.id=s.creator_id
GROUP BY
  c.name
ORDER BY
  revenue_today DESC
