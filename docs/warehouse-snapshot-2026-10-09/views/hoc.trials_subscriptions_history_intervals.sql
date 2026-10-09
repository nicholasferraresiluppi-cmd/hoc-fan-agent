SELECT
  tsh1.creator_id,
  tsh1.user_id,
  tsh1.trial_id,
  tsh1.created_at AS start_time,
  IFNULL(MIN(tsh2.created_at), TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)) AS end_time,
  tsh1.calendar_date AS start_calendar_date,
  IFNULL(MIN(tsh2.calendar_date), DATE_ADD(CURRENT_DATE('UTC'), INTERVAL 1 DAY)) AS end_calendar_date
FROM
  `hoc.organic_trials_subscriptions_history` AS tsh1
LEFT JOIN
  `hoc.organic_trials_subscriptions_history` AS tsh2
ON
  tsh1.creator_id = tsh2.creator_id
  AND tsh1.user_id = tsh2.user_id
  AND tsh1.calendar_date < tsh2.calendar_date
GROUP BY
  tsh1.creator_id,
  tsh1.user_id,
  tsh1.trial_id,
  tsh1.created_at,
  tsh1.calendar_date