SELECT
  DATE(date_stats, 'UTC') AS date_stats,
  clicks,
  subs,
  updated_at,
  funnel_id,
  datastream_metadata
FROM
  `postgres.public_funnels_daily_stats`