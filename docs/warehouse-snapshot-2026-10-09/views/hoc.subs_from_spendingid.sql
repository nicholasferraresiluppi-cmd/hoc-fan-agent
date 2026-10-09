SELECT
  s.started_calendar_date as calendar_date,
  s.creator_id,
  s.creator_name,
  s.user_id,
  s.username,
  s.funnel_id,
  s.trial_id,
  s.link_name,
  s.contribution,
  s.spending_id,
  s.ended_calendar_date
FROM
  `onlyfans.subscriptions_intervals` s
WHERE
  spending_id IS NOT NULL
GROUP BY
  s.started_calendar_date,
  s.creator_id,
  s.creator_name,
  s.user_id,
  s.username,
  s.funnel_id,
  s.trial_id,
  s.link_name,
  s.contribution,
  s.spending_id,
  s.ended_calendar_date
ORDER BY
  calendar_date desc