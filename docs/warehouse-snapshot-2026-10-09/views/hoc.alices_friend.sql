WITH all_subs AS (
  SELECT
    user_id,
    creator_id,
    creator_name,
    calendar_date,
    created_at,
    spending_id
  FROM
    `onlyfans.organic_subscriptions`
  WHERE
    type = 'subscribed'
),

alice_subs AS (
  SELECT
    user_id,
    calendar_date,
    created_at AS alice_created_at,
    spending_id
  FROM
    all_subs
  WHERE creator_id = 505032297
),

ranked_all AS (
  SELECT
    *,
    RANK() OVER (PARTITION BY user_id, calendar_date ORDER BY created_at ASC) AS rank_order
  FROM
    all_subs
),

origin_creator AS (
  SELECT
    r.user_id,
    r.calendar_date,
    r.creator_id,
    r.creator_name
  FROM
    ranked_all r
  JOIN alice_subs a
    ON r.user_id = a.user_id
    --AND r.calendar_date = a.calendar_date
    AND r.created_at < a.alice_created_at
    AND r.creator_id != 505032297
    AND r.creator_id IN (
      93666613, 64413654, 80577130,
      160406145, 160294962, 161443571
    )
),

alice_all_dates AS (
  SELECT DISTINCT calendar_date FROM alice_subs
)

SELECT
  d.calendar_date,
  COUNT(DISTINCT IF(o.creator_id = 93666613, o.user_id, NULL)) AS GiuliaOttorini_IT,
  COUNT(DISTINCT IF(o.creator_id = 64413654, o.user_id, NULL)) AS Stormy_IT,
  COUNT(DISTINCT IF(o.creator_id = 80577130, o.user_id, NULL)) AS Iri_IT,
  COUNT(DISTINCT IF(o.creator_id = 160406145, o.user_id, NULL)) AS MichelaMucciante_IT,
  COUNT(DISTINCT IF(o.creator_id = 160294962, o.user_id, NULL)) AS Fishball_IT,
  COUNT(DISTINCT IF(o.creator_id = 161443571, o.user_id, NULL)) AS AnnaritaEsposito_IT,
  COUNT(DISTINCT o.user_id) AS AliceViaCreator,
  COUNT(DISTINCT IF(a.spending_id IS NOT NULL AND o.user_id IS NULL, a.user_id, NULL)) AS AliceTracked,
  COUNT(DISTINCT IF(a.spending_id IS NULL AND o.user_id IS NULL, a.user_id, NULL)) AS AliceUnattributed,
  COUNT(DISTINCT a.user_id) AS AliceTotal
FROM
  alice_all_dates d
LEFT JOIN alice_subs a ON a.calendar_date = d.calendar_date
LEFT JOIN origin_creator o ON o.user_id = a.user_id -- AND o.calendar_date = a.calendar_date
GROUP BY
  d.calendar_date
ORDER BY
  d.calendar_date DESC;
