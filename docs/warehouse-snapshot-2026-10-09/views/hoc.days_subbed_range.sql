WITH subs AS (
  SELECT
    os.creator_id,
    os.user_id,
    TIMESTAMP(os.created_at) AS sub_start_at,
    DATE(os.created_at) AS entry_date,
    LEAD(TIMESTAMP(os.created_at)) OVER (
      PARTITION BY os.creator_id, os.user_id
      ORDER BY TIMESTAMP(os.created_at)
    ) AS next_sub_start_at,
    ROW_NUMBER() OVER (
      PARTITION BY os.creator_id, os.user_id
      ORDER BY TIMESTAMP(os.created_at)
    ) AS sub_seq
  FROM `onlyfans.organic_subscriptions` os
  WHERE os.sub_type IN ('new_subscriber','new_subscriber_trial','returning_subscriber')
),

tx AS (
  SELECT
    creator_id,
    user_id,
    TIMESTAMP(created_at) AS tx_at,
    DATE(created_at) AS calendar_date,
    net
  FROM `onlyfans.attributed_transactions`
  WHERE type NOT IN ('subscription','recurring_subscription')
),

tx_episode AS (
  SELECT
    s.creator_id,
    s.user_id,
    s.sub_seq,
    s.entry_date,
    t.calendar_date,
    DATE_DIFF(t.calendar_date, s.entry_date, DAY) AS days_since_entry,
    t.net
  FROM subs s
  JOIN tx t
    ON t.creator_id = s.creator_id
   AND t.user_id = s.user_id
   AND t.tx_at >= s.sub_start_at
   AND (s.next_sub_start_at IS NULL OR t.tx_at < s.next_sub_start_at)
),

tx_bucketed AS (
  SELECT
    creator_id,
    user_id,
    entry_date,
    calendar_date,
    CASE
      WHEN days_since_entry BETWEEN 0 AND 15 THEN '1_0-15'
      WHEN days_since_entry BETWEEN 16 AND 30 THEN '2_16-30'
      WHEN days_since_entry BETWEEN 31 AND 45 THEN '3_31-45'
      WHEN days_since_entry BETWEEN 46 AND 60 THEN '4_46-60'
      WHEN days_since_entry BETWEEN 61 AND 90 THEN '5_61-90'
      WHEN days_since_entry BETWEEN 91 AND 120 THEN '6_91-120'
      WHEN days_since_entry BETWEEN 121 AND 180 THEN '7_121-180'
      WHEN days_since_entry BETWEEN 181 AND 365 THEN '8_181-365'
      WHEN days_since_entry >= 366 THEN '9_366-UP'
      ELSE '0_UNKNOWN'
    END AS subscription_range,
    net
  FROM tx_episode
),

user_day_bucket AS (
  SELECT
    creator_id,
    user_id,
    entry_date,
    calendar_date,
    subscription_range,
    SUM(net) AS revenue,
    COUNT(*) AS num_transactions
  FROM tx_bucketed
  GROUP BY 1,2,3,4,5
)

SELECT
  udb.creator_id,
  pc.alias AS creator_name,
  udb.user_id,
  udb.entry_date,
  udb.calendar_date,
  udb.subscription_range,
  udb.revenue,
  udb.num_transactions
FROM user_day_bucket udb
JOIN `postgres.public_creators` pc
  ON udb.creator_id = pc.id
WHERE pc.silent = FALSE
  AND pc.active IS NULL;
