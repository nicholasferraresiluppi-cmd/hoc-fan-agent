WITH utc AS (
  SELECT TIMESTAMP(DATETIME(date_account_tz, TIME(hour_account_tz, 0, 0)), IFNULL(account_timezone,'UTC')) AS ts_utc, *
  FROM `house-of-creators-358213.hoc.meta_ads_campaign_hourly`
)
SELECT DATE(ts_utc) AS date_utc, account_id, account_name, account_timezone, account_currency, campaign_id,
  ANY_VALUE(campaign_name) AS campaign_name, SUM(spend) AS spend, SUM(impressions) AS impressions,
  SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks, SUM(landing_page_views) AS landing_page_views,
  SUM(leads) AS leads, SUM(registrations) AS registrations, SUM(custom_conversions) AS custom_conversions,
  MAX(ingested_at) AS ingested_at
FROM utc
GROUP BY date_utc, account_id, account_name, account_timezone, account_currency, campaign_id