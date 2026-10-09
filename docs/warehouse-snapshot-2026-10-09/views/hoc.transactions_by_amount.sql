WITH transactions_buckets AS (
  SELECT
    t.calendar_date,
    t.creator_id,
    c.alias AS creator_name,

    CASE
      WHEN t.net < 5 THEN 'range_1-4.99'
      WHEN t.net >= 5  AND t.net < 10 THEN 'range_5-9.99'
      WHEN t.net >= 10 AND t.net < 20 THEN 'range_10-19.99'
      WHEN t.net >= 20 AND t.net < 50 THEN 'range_20-49.99'
      WHEN t.net >= 50 AND t.net < 100 THEN 'range_50-99.99'
      WHEN t.net >= 100 AND t.net < 150 THEN 'range_100-149.99'
      WHEN t.net >= 150 THEN 'range_150+'
      ELSE '0_UNKNOWN'
    END AS amount_range,

    SUM(t.net) AS revenue,
    COUNT(1) AS num_transactions,
    COUNT(DISTINCT t.user_id) AS unique_users
  FROM `onlyfans.attributed_transactions` t
  JOIN `postgres.public_creators` c
    ON t.creator_id = c.id
  GROUP BY 1,2,3,4
),

subs AS (
  SELECT
    calendar_date,
    creator_id,
    COUNT(DISTINCT user_id) AS new_subs
  FROM `onlyfans.organic_subscriptions`
  WHERE sub_type IN ('new_subscriber','new_subscriber_trial','returning_subscriber')
  GROUP BY 1,2
)

SELECT
  tb.calendar_date,
  tb.creator_id,
  tb.creator_name,
  tb.amount_range,
  tb.revenue,
  tb.num_transactions,
  tb.unique_users,
  COALESCE(s.new_subs, 0) AS new_subs
FROM transactions_buckets tb
LEFT JOIN subs s
  USING (calendar_date, creator_id)
ORDER BY tb.calendar_date DESC, tb.creator_id, tb.amount_range;
