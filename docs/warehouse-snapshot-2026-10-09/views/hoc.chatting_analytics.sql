-- Step 1: Calcolo interazioni e proposte in chat
WITH chat_data AS (
  SELECT
    creator_id,
    user_id,
    DATE(created_at) AS calendar_date,
    SUM(CAST(price AS FLOAT64)) AS proposed_revenue,
    COUNT(*) AS total_messages,
    COUNTIF(price > 0) AS paid_messages
  FROM
    onlyfans.chat
  GROUP BY
    creator_id, user_id, calendar_date
),

-- Step 2: Spesa effettiva in chat
realized_spending AS (
  SELECT
    creator_id,
    user_id,
    calendar_date,
    SUM(net) AS realized_revenue,
    SUM(net) > 0 AS has_spent
  FROM
    onlyfans.attributed_transactions
  GROUP BY
    creator_id, user_id, calendar_date
),

-- Step 3: Join chat + spending
merged_chat AS (
  SELECT
    c.creator_id,
    c.calendar_date,
    COUNT(DISTINCT c.user_id) AS unique_users,
    COUNTIF(c.paid_messages > 0) AS users_proposed_paid_content,
    SUM(c.proposed_revenue) AS total_proposed_revenue,
    SUM(COALESCE(r.realized_revenue, 0)) AS total_realized_revenue,
    COUNTIF(r.has_spent) AS spenders
  FROM
    chat_data c
  LEFT JOIN
    realized_spending r
  ON
    c.creator_id = r.creator_id
    AND c.user_id = r.user_id
    AND c.calendar_date = r.calendar_date
  GROUP BY
    c.creator_id, c.calendar_date
),

-- Step 4: Sub giornaliere per creator
daily_subs AS (
  SELECT
    creator_id,
    calendar_date,
    COUNT(DISTINCT user_id) AS total_subs
  FROM
    onlyfans.organic_subscriptions
  GROUP BY
    creator_id, calendar_date
),

-- Step 5: Sub che hanno speso in chat
sub_converted AS (
  SELECT
    s.creator_id,
    s.calendar_date,
    COUNT(DISTINCT s.user_id) AS sub_converted_chat
  FROM
    onlyfans.organic_subscriptions s
  INNER JOIN onlyfans.attributed_transactions t
    ON s.creator_id = t.creator_id
    AND s.user_id = t.user_id
    AND t.calendar_date >= s.calendar_date
  WHERE t.net > 0 and t.type not in ('subscription' , 'recurring_subscription')
  GROUP BY s.creator_id, s.calendar_date
)
-- Step 6: Join finale con alias
SELECT
  mc.calendar_date,
  mc.creator_id,
  pc.alias as creator_name,
  mc.unique_users as texted_users,
  mc.users_proposed_paid_content,
  mc.spenders as users_converted,
  mc.total_proposed_revenue,
  mc.total_realized_revenue,
  SAFE_DIVIDE(mc.spenders, mc.users_proposed_paid_content) AS conversion_rate_users,
  SAFE_DIVIDE(mc.total_realized_revenue, mc.total_proposed_revenue) AS conversion_rate_value,
  COALESCE(ds.total_subs, 0) AS daily_newsubs,
  COALESCE(sc.sub_converted_chat, 0) AS newsub_converted,
  SAFE_DIVIDE(sc.sub_converted_chat, ds.total_subs) AS conversion_rate_newsubs
FROM
  merged_chat mc
LEFT JOIN postgres.public_creators pc
  ON mc.creator_id = pc.id
LEFT JOIN daily_subs ds
  ON mc.creator_id = ds.creator_id AND mc.calendar_date = ds.calendar_date
LEFT JOIN sub_converted sc
  ON mc.creator_id = sc.creator_id AND mc.calendar_date = sc.calendar_date
WHERE pc.silent = FALSE
ORDER BY
  mc.calendar_date DESC, mc.total_realized_revenue DESC