WITH hoc_creators AS (
  SELECT id AS creator_id, name AS creator_name, alias
  FROM `postgres.public_creators`
  WHERE silent = FALSE AND active = TRUE
),

-- STEP 1: utenti entrati da campagne attive
entry_users AS (
  SELECT
    s.user_id,
    s.creator_id AS entry_creator_id,
    s.calendar_date AS entry_date,
    LOWER(s.spending_id) AS spending_id
  FROM `onlyfans.organic_subscriptions` s
  INNER JOIN `onlyfans.ad_def_spent` a
    ON s.creator_id = a.creator_id
    AND LOWER(s.spending_id) = LOWER(a.spending_id)
    AND s.calendar_date = a.calendar_date
  WHERE s.creator_id IN (SELECT creator_id FROM hoc_creators)
    AND s.calendar_date = (
      SELECT MIN(s2.calendar_date)
      FROM `onlyfans.organic_subscriptions` s2
      WHERE s2.user_id = s.user_id
        AND s2.creator_id = s.creator_id
    )
),

-- STEP 2: spesa ADV totale per combo creator + spending_id
adv_spending AS (
  SELECT
    LOWER(spending_id) AS spending_id,
    creator_id,
    SUM(def_spent) AS adv_cost
  FROM `onlyfans.ad_def_spent`
  GROUP BY creator_id, spending_id
),

-- STEP 3: conteggio utenti entrati da ADV
entry_user_count AS (
  SELECT
    entry_creator_id,
    spending_id,
    COUNT(DISTINCT user_id) AS total_entered
  FROM entry_users
  GROUP BY entry_creator_id, spending_id
),

-- STEP 4: spese degli utenti dopo la sub di ingresso (su tutte le creator HOC, max 30 giorni dopo)
user_spending_post_entry AS (
  SELECT
    e.user_id,
    e.entry_creator_id,
    e.entry_date,
    e.spending_id,
    t.creator_id AS destination_creator_id,
    SUM(CAST(t.net AS FLOAT64)) AS total_net
  FROM `onlyfans.attributed_transactions` t
  JOIN entry_users e
    ON t.user_id = e.user_id 
    AND t.calendar_date BETWEEN e.entry_date AND DATE_ADD(e.entry_date, INTERVAL 30 DAY)
  WHERE t.creator_id IN (SELECT creator_id FROM hoc_creators)
  GROUP BY e.user_id, e.entry_creator_id, e.entry_date, e.spending_id, t.creator_id
),

-- STEP 5: aggregazione a livello utente
user_ltv_aggregated AS (
  SELECT
    user_id,
    entry_creator_id,
    spending_id,
    SUM(CASE WHEN destination_creator_id = entry_creator_id THEN total_net ELSE 0 END) AS ltv_entry,
    SUM(CASE WHEN destination_creator_id != entry_creator_id THEN total_net ELSE 0 END) AS ltv_other,
    SUM(total_net) AS ltv_total
  FROM user_spending_post_entry
  GROUP BY user_id, entry_creator_id, spending_id
),

-- STEP 6: aggregazione finale per creator e spending_id
final AS (
  SELECT
  hc.alias AS creator_alias,
  u.entry_creator_id,
  u.spending_id,
  euc.total_entered,
  COUNT(DISTINCT u.user_id) AS users_spent,
  SUM(u.ltv_entry) AS total_ltv_entry,
  SUM(u.ltv_other) AS total_ltv_other,
  SUM(u.ltv_total) AS total_ltv,
  adv.adv_cost,
  SAFE_DIVIDE(SUM(u.ltv_total), adv.adv_cost) AS roas,
  SAFE_DIVIDE(SUM(u.ltv_total), euc.total_entered) AS breakeven_cpa,
  SAFE_DIVIDE(adv.adv_cost, euc.total_entered) AS cpa_entry,
  SAFE_DIVIDE(adv.adv_cost, COUNT(DISTINCT u.user_id)) AS cpa_paid,
  SAFE_DIVIDE(SUM(u.ltv_total), euc.total_entered) - SAFE_DIVIDE(adv.adv_cost, euc.total_entered) AS delta_vs_breakeven
  FROM user_ltv_aggregated u
  LEFT JOIN hoc_creators hc ON u.entry_creator_id = hc.creator_id
  LEFT JOIN adv_spending adv ON u.entry_creator_id = adv.creator_id AND u.spending_id = adv.spending_id
  LEFT JOIN entry_user_count euc ON u.entry_creator_id = euc.entry_creator_id AND u.spending_id = euc.spending_id
  GROUP BY hc.alias, u.entry_creator_id, u.spending_id, adv.adv_cost, euc.total_entered
)

SELECT *
FROM final;
