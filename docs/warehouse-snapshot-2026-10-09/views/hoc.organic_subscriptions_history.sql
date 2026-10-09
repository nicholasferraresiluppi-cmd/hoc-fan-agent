SELECT
  creator_id,
  creator_name,
  user_id,
  funnel_id,
  funnel_name,
  NULL AS trial_id,
  NULL AS trial_name,
  created_at,
  DATE(created_at, 'UTC') AS calendar_date,
  sub_type,
  active,
  LANGUAGE,
  spending_id
FROM
  `hoc.organic_tracking_subscriptions_history`
UNION ALL
SELECT
  creator_id,
  creator_name,
  user_id,
  NULL AS funnel_name,
  NULL AS funnel_id,
  trial_id,
  trial_name,
  created_at,
  DATE(created_at, 'UTC') AS calendar_date,
  sub_type,
  active,
  LANGUAGE,
  spending_id
FROM
  `hoc.organic_trials_subscriptions_history`
ORDER BY
  created_at DESC