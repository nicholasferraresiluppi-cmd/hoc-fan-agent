WITH
  most_recent_funnels AS (
  SELECT
    creator_id,
    user_id,
    DATE(created_at,'UTC') AS calendar_date,
    MAX(funnel_id) AS recent_funnel_id
  FROM
    `postgres.public_subscriptions_history`
  GROUP BY
    creator_id,
    user_id,
    calendar_date )
SELECT
  sh.creator_id,
  sh.user_id,
  MIN(sh.created_at) AS created_at,
  sh.funnel_id,
  DATE(sh.created_at,'UTC') AS calendar_date
FROM
  `postgres.public_subscriptions_history` sh
JOIN
  most_recent_funnels mrf
ON
  sh.creator_id = mrf.creator_id
  AND sh.user_id = mrf.user_id
  AND DATE(sh.created_at,'UTC') = mrf.calendar_date
  AND sh.funnel_id = mrf.recent_funnel_id
GROUP BY
  creator_id,
  user_id,
  funnel_id,
  calendar_date