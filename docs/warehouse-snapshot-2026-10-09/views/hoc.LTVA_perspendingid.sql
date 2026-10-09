WITH hoc_creators AS (
  SELECT id AS creator_id, name AS creator_name, alias
  FROM `postgres.public_creators`
  WHERE silent = FALSE AND active = TRUE
),

first_subs AS (
  SELECT
    user_id,
    ARRAY_AGG(
      STRUCT(creator_id, calendar_date, spending_id)
      ORDER BY calendar_date ASC
      LIMIT 1
    )[OFFSET(0)] AS first_sub_info
  FROM `onlyfans.organic_subscriptions`
  WHERE creator_id IN (SELECT creator_id FROM hoc_creators)
  GROUP BY user_id
),

ltva_by_user AS (
  SELECT
    user_id,
    SUM(CAST(net AS FLOAT64)) AS ltva
  FROM `onlyfans.attributed_transactions`
  WHERE creator_id IN (SELECT creator_id FROM hoc_creators)
  GROUP BY user_id
),

user_data AS (
  SELECT
    f.user_id,
    f.first_sub_info.creator_id AS first_creator_id,
    f.first_sub_info.spending_id,
    l.ltva
  FROM first_subs f
  JOIN ltva_by_user l ON f.user_id = l.user_id
)

SELECT
  c.alias,
  u.spending_id,
  COUNT(DISTINCT u.user_id) AS total_users,
  SUM(u.ltva) AS total_ltva,
  SAFE_DIVIDE(SUM(u.ltva), COUNT(DISTINCT u.user_id)) AS avg_ltva_per_user
FROM user_data u
LEFT JOIN hoc_creators c ON u.first_creator_id = c.creator_id
GROUP BY c.alias, u.first_creator_id, u.spending_id
ORDER BY total_ltva DESC
