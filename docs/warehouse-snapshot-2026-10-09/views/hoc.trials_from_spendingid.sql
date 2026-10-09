SELECT
  s.calendar_date,
  s.creator_id,
  s.creator_name,
  s.user_id,
  u.username,
  s.trial_id,
  s.trial_name,
  t.contribution,
  t.spending_id
FROM
  `hoc.organic_trials_subscriptions_history` s
LEFT JOIN
  `house-of-creators-358213.hoc.trials_sheets` t
ON
  t.id = s.trial_id
LEFT JOIN
  hoc.users u
ON
  u.id=s.user_id
WHERE
  t.spending_id IS NOT NULL
GROUP BY
  s.calendar_date,
  s.creator_id,
  s.creator_name,
  s.user_id,
  u.username,
  s.trial_id,
  s.trial_name,
  t.contribution,
  t.spending_id
ORDER BY
  calendar_date desc