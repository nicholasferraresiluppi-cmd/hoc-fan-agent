SELECT
  sh1.creator_id,
  sh1.user_id,
  sh1.funnel_id,
  sh1.created_at AS start_time,
  IFNULL(MIN(sh2.created_at), TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)) AS end_time,
  sh1.calendar_date AS start_calendar_date,
  IFNULL(MIN(sh2.calendar_date), DATE_ADD(CURRENT_DATE('UTC'), INTERVAL 1 DAY)) AS end_calendar_date
FROM
  `hoc.organic_tracking_subscriptions_history` AS sh1
LEFT JOIN
  `hoc.organic_tracking_subscriptions_history` AS sh2
ON
  sh1.creator_id = sh2.creator_id
  AND sh1.user_id = sh2.user_id
  AND sh1.calendar_date < sh2.calendar_date
GROUP BY
  sh1.creator_id,
  sh1.user_id,
  sh1.funnel_id,
  sh1.created_at,
  sh1.calendar_date