SELECT DISTINCT
  Report__Date AS calendar_date,
  --ad.creator_name AS creator_name,
  Account__Account_name AS account_name,
  Campaign__Campaign_name AS campaign_name,
  Ad_group__Ad_group_name AS adset_name,
  Ad__Ad_name AS ad_name,
  -- non abbiamo più Dimension__Created_date: uso un placeholder
  CAST(NULL AS DATE) AS ad_created_date,
  MAX(Performance__Impressions) AS total_impressions,
  MAX(Performance__Reach) AS total_reach,
  MAX(Performance__Clicks) AS total_clicks,
  MAX(Cost__Amount_spend) AS total_spent,
  AVG(Clicks__CTR) AS CTR,
  AVG(Cost__CPM) AS CPM,
  -- nuovo nome campo content views
  MAX(Conversions__Views_Content___Total) AS total_content_views,
  MAX(Conversions__Landing_Page_Views___Total) AS total_landingpage_views,
  -- Aggiunta del campo label
  CASE
    WHEN LOWER(Campaign__Campaign_name) LIKE '%sales%' THEN 'sales'
    WHEN LOWER(Campaign__Campaign_name) LIKE '%farm%' THEN 'farming'
    WHEN LOWER(Campaign__Campaign_name) LIKE '%traffic%' THEN 'traffic'
    WHEN LOWER(Campaign__Campaign_name) LIKE '%pagelike%' THEN 'pagelike'
    WHEN LOWER(Campaign__Campaign_name) LIKE '%page like%' THEN 'pagelike'
    ELSE 'other'
  END AS label
FROM
  `ads.datasource` AS a
GROUP BY
  Report__Date,
  --creator_name,
  Account__Account_name,
  Campaign__Campaign_name,
  Ad_group__Ad_group_name,
  Ad__Ad_name,
  label
ORDER BY
  Report__Date DESC;
