WITH hoc_creators AS (
  SELECT id AS creator_id, alias
  FROM `postgres.public_creators`
  WHERE silent = FALSE AND active = TRUE
),

-- Iscrizioni organiche da ADV in date con spesa effettiva
base_subs AS (
  SELECT
    s.user_id,
    s.creator_id AS entry_creator_id,
    LOWER(s.spending_id) AS spending_id,
    s.calendar_date AS entry_date
  FROM `onlyfans.organic_subscriptions` s
  INNER JOIN `onlyfans.ad_def_spent` a
    ON s.creator_id = a.creator_id
    AND LOWER(s.spending_id) = LOWER(a.spending_id)
    AND s.calendar_date = a.calendar_date
  WHERE s.spending_id IS NOT NULL
    AND s.creator_id IN (SELECT creator_id FROM hoc_creators)
    AND s.calendar_date = (
      SELECT MIN(s2.calendar_date)
      FROM `onlyfans.organic_subscriptions` s2
      WHERE s2.user_id = s.user_id
        AND s2.creator_id = s.creator_id
    )
),

entry_creators AS (
  SELECT
    b.*,
    hc.alias AS entry_creator_alias
  FROM base_subs b
  LEFT JOIN hoc_creators hc
    ON b.entry_creator_id = hc.creator_id
),

-- Spesa post-ingresso entro 30gg
user_spending AS (
  SELECT
    e.user_id,
    e.entry_creator_id,
    e.entry_creator_alias,
    e.spending_id,
    t.creator_id AS destination_creator_id,
    t.net,
    t.calendar_date,
    DATE_DIFF(t.calendar_date, e.entry_date, DAY) AS days_after_entry
  FROM entry_creators e
  LEFT JOIN `onlyfans.attributed_transactions` t
    ON e.user_id = t.user_id
  WHERE t.creator_id IN (SELECT creator_id FROM hoc_creators)
    AND t.calendar_date >= e.entry_date
    AND DATE_DIFF(t.calendar_date, e.entry_date, DAY) <= 30
),

-- Aggregazione spesa utente per creator
agg_spending AS (
  SELECT
    entry_creator_alias,
    entry_creator_id,
    spending_id,
    COUNT(DISTINCT user_id) AS users_total,
    COUNT(DISTINCT CASE WHEN destination_creator_id = entry_creator_id THEN user_id END) AS users_who_spent_entry,
    COUNT(DISTINCT CASE WHEN destination_creator_id != entry_creator_id THEN user_id END) AS users_who_spent_other,
    SUM(CASE WHEN destination_creator_id = entry_creator_id THEN net ELSE 0 END) AS ltv_entry_total,
    SUM(CASE WHEN destination_creator_id != entry_creator_id THEN net ELSE 0 END) AS ltv_other_total
  FROM user_spending
  GROUP BY entry_creator_alias, entry_creator_id, spending_id
),

-- Spesa ADV reale per creator e spending_id
adv_costs AS (
  SELECT
    creator_id AS entry_creator_id,
    LOWER(spending_id) AS spending_id,
    SUM(def_spent) AS adv_cost
  FROM `onlyfans.ad_def_spent`
  GROUP BY creator_id, spending_id
)

-- Join finale
SELECT
  a.*,
  adv.adv_cost,
  (ltv_entry_total + ltv_other_total) as ltv_total,
  SAFE_DIVIDE(ltv_entry_total + ltv_other_total, adv.adv_cost) AS roas_total,
  SAFE_DIVIDE(adv.adv_cost, users_total) AS cpa_total,
  SAFE_DIVIDE(users_who_spent_other, users_total) AS perc_users_cross,
  SAFE_DIVIDE(ltv_other_total, (ltv_entry_total + ltv_other_total)) AS perc_ltv_cross
FROM agg_spending a
LEFT JOIN adv_costs adv
  ON a.entry_creator_id = adv.entry_creator_id AND a.spending_id = adv.spending_id
ORDER BY ltv_other_total DESC
