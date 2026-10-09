SELECT
  calendar_date,
  link_id,
  COALESCE(unions - LAG(unions) OVER (PARTITION BY link_id ORDER BY calendar_date), unions) AS unions
FROM (
  SELECT
    lds.calendar_date,
    lds.link_id,
    lds.unions
  FROM
    `telegram.links_daily_stats` lds) AS data