WITH subs AS (
  SELECT os.*, TIMESTAMP(os.created_at) AS sub_start_at,
    LEAD(TIMESTAMP(os.created_at)) OVER (PARTITION BY os.creator_id, os.user_id ORDER BY TIMESTAMP(os.created_at)) AS next_sub_start_at,
    ROW_NUMBER() OVER (PARTITION BY os.creator_id, os.user_id ORDER BY TIMESTAMP(os.created_at)) AS sub_seq
  FROM `onlyfans.organic_subscriptions` os
),
tx AS (
  SELECT creator_id, user_id, TIMESTAMP(created_at) AS tx_at, net
  FROM `onlyfans.attributed_transactions` WHERE type != 'subscription'
),
subs_with_revenue AS (
  SELECT s.creator_id, s.user_id, s.sub_seq, s.sub_start_at, s.next_sub_start_at, SUM(t.net) AS revenue
  FROM subs s
  LEFT JOIN tx t ON t.creator_id = s.creator_id AND t.user_id = s.user_id
   AND t.tx_at >= s.sub_start_at AND (s.next_sub_start_at IS NULL OR t.tx_at < s.next_sub_start_at)
  GROUP BY 1,2,3,4,5
),
redirects_dedup AS (
  SELECT creator_id, funnel_id, account_id FROM (
    SELECT r.creator_id, r.funnel_id, r.account_id,
      ROW_NUMBER() OVER (PARTITION BY r.creator_id, r.funnel_id ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC) AS rn
    FROM `postgres.public_redirects` r
    WHERE (r.retired IS NULL OR r.retired = FALSE) AND r.deleted_at IS NULL AND r.account_id IS NOT NULL AND r.funnel_id IS NOT NULL
  ) WHERE rn = 1
),
accounts AS (
  SELECT a.id AS account_id, a.username, p.name as alterego
  FROM `postgres.public_accounts` a
  LEFT JOIN `postgres.public_alteregos` p ON p.id = a.alterego_id
  WHERE a.deleted_at IS NULL
)
SELECT s.*, COALESCE(r.revenue, 0) AS revenue, a.username AS placement_username, a.alterego
FROM subs s
LEFT JOIN subs_with_revenue r ON r.creator_id = s.creator_id AND r.user_id = s.user_id AND r.sub_seq = s.sub_seq AND r.sub_start_at = s.sub_start_at
LEFT JOIN redirects_dedup rd ON rd.creator_id = s.creator_id AND rd.funnel_id = s.funnel_id
LEFT JOIN accounts a ON a.account_id = rd.account_id