WITH market_creator AS (
  SELECT 'IT' AS market, 250167499 AS creator_id UNION ALL
  SELECT 'ES', 1000000344 UNION ALL
  SELECT 'EN', 411251447
)
SELECT
  v.date, v.slug, v.domain, v.folder_name, v.source_channel, v.market,
  v.visits, v.bots, v.of_clicks_daily,
  lm.funnel_id, lm.creator_id, lm.funnel_type, lm.alias, lm.ls_id,
  ROUND(SUM(COALESCE(sr.contribution, 1)), 1)               AS attributed_subs,
  ROUND(SUM(sr.revenue * COALESCE(sr.contribution, 1)), 2)  AS attributed_revenue,
  COUNT(sr.notification_id)                                  AS raw_subs,
  ROUND(SAFE_DIVIDE(v.of_clicks_daily, v.visits) * 100, 2)  AS btn_ctr_pct,
  ROUND(SAFE_DIVIDE(SUM(COALESCE(sr.contribution,1)), v.visits) * 100, 2) AS cvr_pct
FROM (
  SELECT
    s.date, s.slug, ll.domain, s.folder_name, s.source_channel,
    mc.market, SUM(s.clicks) AS visits, SUM(s.bots) AS bots,
    SUM(s.of_clicks_daily) AS of_clicks_daily
  FROM `house-of-creators-358213.hoc.ls_daily_link_stats` s
  LEFT JOIN `house-of-creators-358213.hoc.ls_links` ll ON ll.link_id = s.link_id
  JOIN market_creator mc ON mc.market = (
    SELECT lcs.market FROM `house-of-creators-358213.hoc.ls_link_country_stats` lcs
    WHERE lcs.link_id = s.link_id AND lcs.date = s.date
    ORDER BY lcs.visits DESC LIMIT 1
  )
  GROUP BY s.date, s.slug, ll.domain, s.folder_name, s.source_channel, mc.market
) v
JOIN market_creator mc ON v.market = mc.market
JOIN `house-of-creators-358213.hoc.link_mapping` lm
  ON lm.ls_id IS NOT NULL
  AND lm.ls_id = (SELECT link_id FROM `house-of-creators-358213.hoc.ls_daily_link_stats` WHERE slug = v.slug LIMIT 1)
  AND lm.creator_id = mc.creator_id
  AND lm.valid_from <= v.date
  AND (lm.valid_to IS NULL OR lm.valid_to >= v.date)
LEFT JOIN `house-of-creators-358213.onlyfans.spending_revenue` sr
  ON sr.funnel_id = lm.funnel_id AND sr.calendar_date = v.date
GROUP BY v.date, v.slug, v.domain, v.folder_name, v.source_channel, v.market,
         v.visits, v.bots, v.of_clicks_daily,
         lm.funnel_id, lm.creator_id, lm.funnel_type, lm.alias, lm.ls_id