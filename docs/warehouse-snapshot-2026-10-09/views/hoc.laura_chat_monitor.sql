WITH ids AS (
  SELECT 250167499 AS creator_id, 'IT' AS country UNION ALL
  SELECT 411251447, 'EN' UNION ALL
  SELECT 1000000344, 'ES'
),
-- --- Metriche da CHAT ---
chat_w AS (
  SELECT
    i.country,
    DATE_TRUNC(DATE(c.created_at), WEEK(MONDAY)) AS settimana,
    COUNT(DISTINCT IF(c.sender_id = c.user_id, c.user_id, NULL)) AS fan_attivi,
    COUNTIF(c.sender_id = c.user_id)  AS msg_fan,
    COUNTIF(c.sender_id != c.user_id) AS msg_chatter,
    COUNTIF(c.sender_id != c.user_id AND c.price > 0) AS msg_chatter_priced,  -- PPV/contenuti a pagamento spinti
    ROUND(COUNTIF(c.sender_id = c.user_id) / NULLIF(COUNTIF(c.sender_id != c.user_id),0), 3) AS ratio_fan_chatter,
    ROUND(AVG(IF(c.sender_id = c.user_id, c.words, NULL)), 1) AS avg_parole_fan
  FROM `house-of-creators-358213.onlyfans.chat` c
  JOIN ids i ON c.creator_id = i.creator_id
  WHERE c.created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 182 DAY))
  GROUP BY 1,2
),
-- --- Metriche da TRANSAZIONI (split DM 1:1 vs mass) ---
tx AS (
  SELECT
    atr.creator_id,
    DATE_TRUNC(atr.calendar_date, WEEK(MONDAY)) AS settimana,
    atr.type,
    CAST(atr.net AS FLOAT64) AS net,
    atr.user_id,
    CASE WHEN mt.id IS NOT NULL THEN 'mass' ELSE 'dm' END AS msg_kind
  FROM `house-of-creators-358213.onlyfans.attributed_transactions` atr
  LEFT JOIN `house-of-creators-358213.onlyfans.mass_transactions` mt ON atr.id = mt.id
  WHERE atr.creator_id IN (250167499, 411251447, 1000000344)
    AND atr.calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 182 DAY)
),
tx_w AS (
  SELECT
    i.country,
    tx.settimana,
    ROUND(SUM(tx.net), 2) AS revenue_tot,
    ROUND(SUM(IF(tx.type='message' AND tx.msg_kind='dm',   tx.net, 0)), 2) AS revenue_dm,
    ROUND(SUM(IF(tx.type='message' AND tx.msg_kind='mass', tx.net, 0)), 2) AS revenue_mass,
    ROUND(SUM(IF(tx.type='tip', tx.net, 0)), 2) AS revenue_tip,
    COUNT(DISTINCT tx.user_id) AS paying_users
  FROM tx JOIN ids i ON tx.creator_id = i.creator_id
  GROUP BY 1,2
)
SELECT
  c.country,
  c.settimana,
  -- volumi chat
  c.fan_attivi,
  c.msg_fan,
  c.msg_chatter,
  c.msg_chatter_priced,
  c.ratio_fan_chatter,
  c.avg_parole_fan,
  -- revenue
  t.revenue_tot,
  t.revenue_dm,
  t.revenue_mass,
  t.revenue_tip,
  t.paying_users,
  -- metriche derivate (KPI early-warning)
  ROUND(SAFE_DIVIDE(t.revenue_dm,  c.msg_chatter_priced), 2) AS revenue_per_msg_chatter,  -- efficienza: revenue DM per PPV spinto
  ROUND(SAFE_DIVIDE(t.revenue_tot, c.fan_attivi), 2)  AS revenue_per_fan_attivo,    -- monetizzazione per fan
  ROUND(SAFE_DIVIDE(t.revenue_mass, t.revenue_tot), 3) AS quota_mass,               -- dipendenza dal mass
  -- flag settimana parziale (in corso)
  c.settimana >= DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)) AS settimana_parziale
FROM chat_w c
LEFT JOIN tx_w t ON c.country = t.country AND c.settimana = t.settimana
ORDER BY c.country, c.settimana