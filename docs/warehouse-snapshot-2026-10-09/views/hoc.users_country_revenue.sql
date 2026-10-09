-- BigQuery Standard SQL

WITH users_country_list_dedup AS (
  SELECT
    LOWER(TRIM(username)) AS username_norm,
    nickname,
    country_label,
    labeled_by,
    labeled_at,
    active
  FROM `house-of-creators-358213.hoc.users_country_list`
  WHERE username IS NOT NULL
    AND TRIM(username) != ''
    AND active = TRUE
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY LOWER(TRIM(username))
    ORDER BY labeled_at DESC
  ) = 1
),

labeled_users AS (
  -- risolve username -> user_id (OF)
  SELECT
    pu.id AS user_id,
    pu.username AS of_username,
    ucl.nickname,
    ucl.country_label,
    ucl.labeled_by,
    ucl.labeled_at
  FROM users_country_list_dedup ucl
  JOIN `postgres.public_users` pu
    ON LOWER(TRIM(pu.username)) = ucl.username_norm
  WHERE pu.deleted_at IS NULL
),

subs AS (
  SELECT
    os.*,
    TIMESTAMP(os.created_at) AS sub_start_at,
    LEAD(TIMESTAMP(os.created_at)) OVER (
      PARTITION BY os.creator_id, os.user_id
      ORDER BY TIMESTAMP(os.created_at)
    ) AS next_sub_start_at,
    ROW_NUMBER() OVER (
      PARTITION BY os.creator_id, os.user_id
      ORDER BY TIMESTAMP(os.created_at)
    ) AS sub_seq
  FROM `onlyfans.organic_subscriptions` os
),

tx AS (
  SELECT
    creator_id,
    user_id,
    TIMESTAMP(created_at) AS tx_at,
    net
  FROM `onlyfans.attributed_transactions`
  WHERE type != 'subscription'
),

subs_with_revenue AS (
  SELECT
    s.creator_id,
    s.user_id,
    s.sub_seq,
    s.sub_start_at,
    s.next_sub_start_at,
    SUM(t.net) AS revenue
  FROM subs s
  LEFT JOIN tx t
    ON t.creator_id = s.creator_id
   AND t.user_id = s.user_id
   AND t.tx_at >= s.sub_start_at
   AND (s.next_sub_start_at IS NULL OR t.tx_at < s.next_sub_start_at)
  GROUP BY 1,2,3,4,5
),

redirects_dedup AS (
  SELECT
    creator_id,
    funnel_id,
    account_id
  FROM (
    SELECT
      r.creator_id,
      r.funnel_id,
      r.account_id,
      ROW_NUMBER() OVER (
        PARTITION BY r.creator_id, r.funnel_id
        ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC
      ) AS rn
    FROM `postgres.public_redirects` r
    WHERE (r.retired IS NULL OR r.retired = FALSE)
      AND r.deleted_at IS NULL
      AND r.account_id IS NOT NULL
      AND r.funnel_id IS NOT NULL
  )
  WHERE rn = 1
),

accounts AS (
  SELECT
    a.id AS account_id,
    a.username,
    p.name AS alterego
  FROM `postgres.public_accounts` a
  LEFT JOIN `postgres.public_alteregos` p ON p.id = a.alterego_id
  WHERE a.deleted_at IS NULL
)

SELECT
  s.*,
  COALESCE(r.revenue, 0) AS revenue,

  -- placement IG (da redirect)
  a.username AS placement_username,
  a.alterego,

  -- ✅ info label ES (o country_label) dallo sheet
  lu.of_username AS labeled_of_username,
  lu.nickname AS labeled_nickname,
  lu.country_label,
  lu.labeled_by,
  lu.labeled_at

FROM subs s

-- ✅ filtro: solo user_id presenti nella lista
JOIN labeled_users lu
  ON lu.user_id = s.user_id

LEFT JOIN subs_with_revenue r
  ON r.creator_id = s.creator_id
 AND r.user_id = s.user_id
 AND r.sub_seq = s.sub_seq
 AND r.sub_start_at = s.sub_start_at

LEFT JOIN redirects_dedup rd
  ON rd.creator_id = s.creator_id
 AND rd.funnel_id = s.funnel_id

LEFT JOIN accounts a
  ON a.account_id = rd.account_id

ORDER BY s.user_id, s.sub_start_at;
