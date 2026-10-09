WITH hoc_creators AS (
  SELECT id AS creator_id, alias AS creator_alias
  FROM `postgres.public_creators`
  WHERE silent = FALSE AND active = TRUE
),

first_hoc_entry AS (
  SELECT
    user_id,
    MIN(calendar_date) AS first_hoc_date
  FROM `onlyfans.organic_subscriptions`
  WHERE creator_id IN (SELECT creator_id FROM hoc_creators)
    AND sub_type = 'new_subscriber'
  GROUP BY user_id
),

entry_users_ranked AS (
  SELECT
    s.user_id,
    s.creator_id AS entry_creator_id,
    s.spending_id,
    s.calendar_date AS entry_date,
    ROW_NUMBER() OVER (PARTITION BY s.user_id ORDER BY s.calendar_date) AS rn
  FROM `onlyfans.organic_subscriptions` s
  JOIN `onlyfans.ad_def_spent` a
    ON s.creator_id = a.creator_id
    AND s.calendar_date = a.calendar_date
    AND s.spending_id = a.spending_id
    AND a.def_spent > 0
  WHERE s.creator_id IN (SELECT creator_id FROM hoc_creators)
    AND s.sub_type = 'new_subscriber'
),

entry_users AS (
  SELECT 
    e.user_id, 
    e.entry_creator_id, 
    e.entry_date, 
    e.spending_id,
    f.first_hoc_date
  FROM entry_users_ranked e
  JOIN first_hoc_entry f
    ON e.user_id = f.user_id AND e.entry_date = f.first_hoc_date
  WHERE e.rn = 1
),

ltvp AS (
  SELECT
    e.user_id,
    SUM(CAST(t.net AS FLOAT64)) AS ltvp
  FROM entry_users e
  JOIN `onlyfans.attributed_transactions` t
    ON e.user_id = t.user_id 
    AND t.creator_id = e.entry_creator_id
    AND t.calendar_date >= e.entry_date
    AND e.entry_date = e.first_hoc_date
  GROUP BY e.user_id
),

ltva AS (
  SELECT
    e.user_id,
    SUM(CAST(t.net AS FLOAT64)) AS ltva
  FROM entry_users e
  JOIN `onlyfans.attributed_transactions` t
    ON e.user_id = t.user_id
    AND t.calendar_date >= e.entry_date
    AND t.creator_id != e.entry_creator_id
  JOIN `onlyfans.organic_subscriptions` s
    ON t.user_id = s.user_id AND t.creator_id = s.creator_id AND t.calendar_date = s.calendar_date
  JOIN hoc_creators h ON t.creator_id = h.creator_id
  WHERE s.spending_id IS NULL
    AND DATE_DIFF(s.calendar_date, e.entry_date, DAY) <= 30
  GROUP BY e.user_id
),

creator_subs_count AS (
  SELECT
    e.user_id,
    COUNT(DISTINCT s.creator_id) AS num_creators
  FROM entry_users e
  JOIN `onlyfans.organic_subscriptions` s
    ON e.user_id = s.user_id
    AND s.creator_id != e.entry_creator_id
    AND s.spending_id IS NULL
    AND DATE_DIFF(s.calendar_date, e.entry_date, DAY) <= 30
    JOIN hoc_creators h
  ON s.creator_id = h.creator_id
  GROUP BY e.user_id
),

days_to_second_sub AS (
  SELECT
    e.user_id,
    MIN(DATE_DIFF(s.calendar_date, e.entry_date, DAY)) AS days_between_first_and_second
  FROM entry_users e
  JOIN `onlyfans.organic_subscriptions` s
    ON e.user_id = s.user_id
    AND s.calendar_date > e.entry_date  -- ← solo dopo la sub di ingresso
    AND s.spending_id IS NULL
    AND s.creator_id != e.entry_creator_id
    AND DATE_DIFF(s.calendar_date, e.entry_date, DAY) <= 30
    JOIN hoc_creators h
  ON s.creator_id = h.creator_id
  GROUP BY e.user_id
),

conversion_users AS (
  SELECT
    e.user_id,
    
    -- Conversione sul profilo di ingresso
    MAX(CASE 
      WHEN t.creator_id = e.entry_creator_id THEN 1 
      ELSE 0 
    END) AS is_entry_creator_conversion,
    
    -- Conversione su altro profilo HOC, senza spending_id e entro 30gg
    MAX(CASE 
      WHEN t.creator_id != e.entry_creator_id 
        AND s.spending_id IS NULL 
        AND DATE_DIFF(s.calendar_date, e.entry_date, DAY) BETWEEN 0 AND 30 
      THEN 1 
      ELSE 0 
    END) AS is_other_creator_conversion

  FROM entry_users e

  JOIN `onlyfans.attributed_transactions` t
    ON e.user_id = t.user_id
    AND t.net > 0
    AND t.calendar_date >= e.entry_date

  JOIN `onlyfans.organic_subscriptions` s
    ON t.user_id = s.user_id 
    AND t.creator_id = s.creator_id 
    AND t.calendar_date = s.calendar_date

  -- Filtro esplicito sulle sole creator HOC
  JOIN hoc_creators hc
    ON t.creator_id = hc.creator_id

  GROUP BY e.user_id
),
conversion_status as(
SELECT
  user_id,
  is_entry_creator_conversion,
  is_other_creator_conversion,
  
  -- Entrambe le conversioni
  CASE 
    WHEN is_entry_creator_conversion = 1 AND is_other_creator_conversion = 1 THEN 1 
    ELSE 0 
  END AS is_both_conversion,

  -- Qualsiasi conversione
  CASE 
    WHEN is_entry_creator_conversion = 1 OR is_other_creator_conversion = 1 THEN 1 
    ELSE 0 
  END AS is_any_conversion

FROM conversion_users),


adv_spent_per_creator AS (
  SELECT
    e.entry_creator_id AS creator_id,
    SUM(a.def_spent) AS total_adv_spent
  FROM (
    SELECT DISTINCT entry_creator_id, entry_date, spending_id
    FROM entry_users
  ) e
  JOIN `onlyfans.ad_def_spent` a
    ON e.entry_creator_id = a.creator_id
    AND e.entry_date = a.calendar_date
    AND e.spending_id = a.spending_id
  GROUP BY e.entry_creator_id
),
final_data AS (
  SELECT
    e.user_id,
    e.entry_creator_id,
    ch.creator_alias,
    ltvp.ltvp,
    ltva.ltva,
    c.num_creators,
    a.days_between_first_and_second,
    conv.is_any_conversion,
    conv.is_both_conversion,
    conv.is_entry_creator_conversion,
    conv.is_other_creator_conversion,
    CASE WHEN c.num_creators > 0 THEN 1 ELSE 0 END AS is_multisub,
    CASE WHEN ltva.ltva > 100 THEN 1 ELSE 0 END AS is_high_ltv,
    CASE WHEN ltva.ltva > 100 THEN ltva.ltva ELSE NULL END AS high_ltv_value,
    SAFE_DIVIDE(ltva.ltva, NULLIF(c.num_creators, 0)) AS gateway_value
  FROM entry_users e
  LEFT JOIN ltvp ON e.user_id = ltvp.user_id
  LEFT JOIN ltva ON e.user_id = ltva.user_id
  LEFT JOIN creator_subs_count c ON e.user_id = c.user_id
  LEFT JOIN days_to_second_sub a ON e.user_id = a.user_id
  LEFT JOIN hoc_creators ch ON ch.creator_id = e.entry_creator_id
  LEFT JOIN conversion_status conv ON e.user_id = conv.user_id
)

SELECT
  f.entry_creator_id,
  f.creator_alias,
  COUNT(DISTINCT f.user_id) AS num_users_adv_entry,
  ROUND(SUM(f.ltvp), 2) AS total_ltvp,
  ROUND(SUM(f.ltva), 2) AS total_ltva,
  ROUND(AVG(f.num_creators), 2) AS avg_num_creators,
  ROUND(AVG(f.days_between_first_and_second), 2) AS avg_days_between_first_and_second,
  ROUND(100 * SUM(f.is_multisub) / COUNT(f.user_id), 2) AS perc_multisub_users,
  ROUND(100 * SUM(f.is_high_ltv) / COUNT(f.user_id), 2) AS perc_high_ltv_users,
  ROUND(AVG(f.high_ltv_value), 2) AS avg_ltva_above_100,
  ROUND(AVG(IF(f.gateway_value > 0, f.gateway_value, NULL)), 2) AS avg_cross_creator_value,
  COUNTIF(f.gateway_value > 0) AS num_cross_creator_users,
  ROUND(s.total_adv_spent, 2) AS total_adv_spent,
  COUNT(DISTINCT CASE WHEN f.is_any_conversion = 1 THEN f.user_id END) AS num_users_converted_total,
  COUNT(DISTINCT CASE WHEN f.is_both_conversion = 1 THEN f.user_id END) AS num_users_converted_both,
  COUNT(DISTINCT CASE WHEN f.is_entry_creator_conversion = 1 THEN f.user_id END) AS num_users_converted_entry_creator,
  COUNT(DISTINCT CASE WHEN f.is_other_creator_conversion = 1 THEN f.user_id END) AS num_users_converted_other_creators
FROM final_data f
LEFT JOIN adv_spent_per_creator s ON f.entry_creator_id = s.creator_id
GROUP BY f.entry_creator_id, f.creator_alias, s.total_adv_spent
ORDER BY total_ltva DESC
