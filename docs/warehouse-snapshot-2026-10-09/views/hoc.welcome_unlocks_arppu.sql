WITH valid_price_tags AS (
  SELECT
    creator_id,
    amount,
    type,
    start_date,
    COALESCE(end_date, CURRENT_DATE()) AS end_date
  FROM `house-of-creators-358213.hoc.price_tags`
),

subs AS (
  SELECT
    creator_id,
    user_id,
    MIN(DATE(created_at)) AS sub_date
  FROM `onlyfans.organic_subscriptions`
  WHERE sub_type IN ('new_subscriber','new_subscriber_trial','returning_subscriber')
  GROUP BY 1,2
),

tx_10d AS (
  SELECT
    s.creator_id,
    s.user_id,
    s.sub_date,
    t.calendar_date AS tx_date,
    TIMESTAMP(t.created_at) AS tx_at,
    t.amount,
    t.net
  FROM subs s
  JOIN `onlyfans.attributed_transactions` t
    ON t.creator_id = s.creator_id
   AND t.user_id = s.user_id
   AND t.calendar_date BETWEEN s.sub_date AND DATE_ADD(s.sub_date, INTERVAL 10 DAY)
  WHERE t.type NOT IN ('subscription','recurring_subscription')
),

unlock_event AS (
  SELECT
    x.creator_id,
    x.user_id,
    x.sub_date,
    MIN(x.tx_at) AS unlock_at
  FROM tx_10d x
  JOIN valid_price_tags p
    ON p.creator_id = x.creator_id
   AND x.tx_date BETWEEN p.start_date AND p.end_date
   AND x.amount = p.amount
  GROUP BY 1,2,3
),

user_metrics AS (
  SELECT
    s.creator_id,
    s.user_id,
    s.sub_date,
    IF(u.unlock_at IS NULL, 0, 1) AS is_unlocker,

    -- totale spend entro 10gg dalla sub (include anche l'unlock se presente)
    SUM(COALESCE(x.net,0)) AS spend_10d,

    -- spend DOPO unlock (esclude l'unlock stesso usando >)
    SUM(
      CASE
        WHEN u.unlock_at IS NOT NULL AND x.tx_at > u.unlock_at THEN x.net
        ELSE 0
      END
    ) AS spend_after_unlock_10d
  FROM subs s
  LEFT JOIN tx_10d x
    ON x.creator_id = s.creator_id
   AND x.user_id = s.user_id
   AND x.sub_date = s.sub_date
  LEFT JOIN unlock_event u
    ON u.creator_id = s.creator_id
   AND u.user_id = s.user_id
   AND u.sub_date = s.sub_date
  GROUP BY 1,2,3,4
)

SELECT
  um.creator_id,
  c.alias AS creator_name,
  um.sub_date,

  -- popolazioni
  COUNTIF(um.is_unlocker = 1) AS unlockers,
  COUNTIF(um.is_unlocker = 0) AS non_unlockers,

  -- spenders per gruppo (entro 10d)
  COUNTIF(um.is_unlocker = 1 AND um.spend_10d > 0) AS unlockers_spenders,       -- dovrebbe ~= unlockers
  COUNTIF(um.is_unlocker = 0 AND um.spend_10d > 0) AS non_unlockers_spenders,

  -- revenue per gruppo (entro 10d)
  SUM(CASE WHEN um.is_unlocker = 1 THEN um.spend_10d ELSE 0 END) AS unlockers_revenue_10d,
  SUM(CASE WHEN um.is_unlocker = 0 THEN um.spend_10d ELSE 0 END) AS non_unlockers_revenue_10d,

  -- revenue incrementale post-unlock (solo unlockers)
  SUM(CASE WHEN um.is_unlocker = 1 THEN um.spend_after_unlock_10d ELSE 0 END) AS unlockers_revenue_after_unlock_10d,

  -- ARPPU (avg per spender)
  SAFE_DIVIDE(
    SUM(CASE WHEN um.is_unlocker = 1 THEN um.spend_10d ELSE 0 END),
    NULLIF(COUNTIF(um.is_unlocker = 1 AND um.spend_10d > 0), 0)
  ) AS arppu_unlockers_10d_including_unlock,

  SAFE_DIVIDE(
    SUM(CASE WHEN um.is_unlocker = 1 THEN um.spend_after_unlock_10d ELSE 0 END),
    NULLIF(COUNTIF(um.is_unlocker = 1 AND um.spend_after_unlock_10d > 0), 0)
  ) AS arppu_unlockers_10d_after_unlock,

  SAFE_DIVIDE(
    SUM(CASE WHEN um.is_unlocker = 0 THEN um.spend_10d ELSE 0 END),
    NULLIF(COUNTIF(um.is_unlocker = 0 AND um.spend_10d > 0), 0)
  ) AS arppu_non_unlockers_10d

FROM user_metrics um
LEFT JOIN `postgres.public_creators` c
  ON um.creator_id = c.id
WHERE c.silent = FALSE
GROUP BY 1,2,3
ORDER BY um.sub_date DESC, um.creator_id;
