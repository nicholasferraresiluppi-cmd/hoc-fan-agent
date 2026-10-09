WITH
  most_recent_trials AS (
  SELECT
    creator_id,
    user_id,
    DATE(created_at, 'UTC') AS calendar_date,
    MAX(trial_id) AS recent_trial_id
  FROM
    `postgres.public_trials_subscriptions_history`
  GROUP BY
    creator_id,
    user_id,
    calendar_date )
SELECT
  tsh.creator_id,
  tsh.user_id,
  MIN(created_at) AS created_at,
  tsh.trial_id,
  DATE(tsh.created_at, 'UTC') AS calendar_date
FROM
  `postgres.public_trials_subscriptions_history` tsh
JOIN
  most_recent_trials mrt
ON
  tsh.creator_id = mrt.creator_id
  AND tsh.user_id = mrt.user_id
  AND DATE(tsh.created_at, 'UTC') = mrt.calendar_date
  AND tsh.trial_id = mrt.recent_trial_id
GROUP BY
  creator_id,
  user_id,
  trial_id,
  calendar_date