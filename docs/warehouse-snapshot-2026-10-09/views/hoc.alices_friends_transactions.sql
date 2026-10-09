WITH subscriptions AS (
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
    creator_id IN (
      505032297, 93666613, 64413654, 80577130,
      160406145, 160294962, 161443571
    )
    AND type = 'subscribed'
    AND calendar_date > '2025-06-20'
),

-- Timestamp prima sub ad Alice
alice_first_subs AS (
  SELECT
    user_id,
    MIN(created_at) AS alice_created_at
  FROM subscriptions
  WHERE creator_id = 505032297
  GROUP BY user_id
),

-- Creator di origine (prima di Alice nello stesso giorno)
origin_creator AS (
  SELECT
    r.user_id,
    r.creator_id,
    r.creator_name
  FROM subscriptions r
  JOIN alice_first_subs a
    ON r.user_id = a.user_id
   AND r.created_at < a.alice_created_at
   AND r.creator_id != 505032297
   AND r.calendar_date = DATE(a.alice_created_at)
),

-- Utenti con spending_id not null sulla sub ad Alice
direct_alice_spenders AS (
  SELECT DISTINCT user_id
  FROM subscriptions
  WHERE creator_id = 505032297
    AND spending_id IS NOT NULL
),

-- Transazioni su Alice dopo la sub
alice_transactions AS (
  SELECT
    t.user_id,
    t.calendar_date,
    t.net
  FROM
    `onlyfans.attributed_transactions` t
  JOIN alice_first_subs a
    ON t.user_id = a.user_id
  WHERE
    t.created_at >= a.alice_created_at
    AND t.creator_id = 505032297
),

-- Join delle origini con le transazioni su Alice
attributed_by_creator AS (
  SELECT
    t.calendar_date,
    o.creator_id,
    t.net
  FROM
    alice_transactions t
  JOIN origin_creator o ON t.user_id = o.user_id
),

-- Totale speso da utenti con spending_id (non già attribuiti)
direct_only AS (
  SELECT
    t.calendar_date,
    SUM(t.net) AS direct_alice_spent
  FROM alice_transactions t
  JOIN direct_alice_spenders s ON t.user_id = s.user_id
  LEFT JOIN origin_creator o ON t.user_id = o.user_id
  WHERE o.user_id IS NULL  -- escludiamo quelli già attribuiti
  GROUP BY t.calendar_date
),

-- Spesa totale giorno per giorno
total_alice AS (
  SELECT calendar_date, SUM(net) AS total_spent
  FROM alice_transactions
  GROUP BY calendar_date
),

-- Somma attribuita per creator (come prima)
creator_breakdown AS (
  SELECT
    calendar_date,
    SUM(CASE WHEN creator_id = 93666613 THEN net ELSE 0 END) AS `GiuliaOttorini_IT`,
    SUM(CASE WHEN creator_id = 64413654 THEN net ELSE 0 END) AS `Stormy_IT`,
    SUM(CASE WHEN creator_id = 80577130 THEN net ELSE 0 END) AS `Iri_IT`,
    SUM(CASE WHEN creator_id = 160406145 THEN net ELSE 0 END) AS `MichelaMucciante_IT`,
    SUM(CASE WHEN creator_id = 160294962 THEN net ELSE 0 END) AS `Fishball_IT`,
    SUM(CASE WHEN creator_id = 161443571 THEN net ELSE 0 END) AS `AnnaritaEsposito_IT`
  FROM attributed_by_creator
  GROUP BY calendar_date
)

-- Final merge
SELECT
  cb.calendar_date,
  ROUND(`GiuliaOttorini_IT`, 2) AS `GiuliaOttorini_IT`,
  ROUND(`Stormy_IT`, 2) AS `Stormy_IT`,
  ROUND(`Iri_IT`, 2) AS `Iri_IT`,
  ROUND(`MichelaMucciante_IT`, 2) AS `MichelaMucciante_IT`,
  ROUND(`Fishball_IT`, 2) AS `Fishball_IT`,
  ROUND(`AnnaritaEsposito_IT`, 2) AS `AnnaritaEsposito_IT`,
  ROUND(direct.direct_alice_spent, 2) AS ads_alice_spenders,
  ROUND(t.total_spent 
        - COALESCE(`GiuliaOttorini_IT`, 0)
        - COALESCE(`Stormy_IT`, 0)
        - COALESCE(`Iri_IT`, 0)
        - COALESCE(`MichelaMucciante_IT`, 0)
        - COALESCE(`Fishball_IT`, 0)
        - COALESCE(`AnnaritaEsposito_IT`, 0)
        - COALESCE(direct.direct_alice_spent, 0), 2) AS unattributed,
  ROUND(t.total_spent, 2) AS totale
FROM creator_breakdown cb
LEFT JOIN direct_only direct ON cb.calendar_date = direct.calendar_date
LEFT JOIN total_alice t ON cb.calendar_date = t.calendar_date
ORDER BY cb.calendar_date DESC;
