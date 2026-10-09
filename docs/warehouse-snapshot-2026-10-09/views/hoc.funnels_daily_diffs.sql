SELECT
  calendar_date,
  creator_id,
  creator_name,
  funnel_id,
  funnel_name,
  COALESCE(subs - LAG(subs) OVER (PARTITION BY creator_id, funnel_id ORDER BY calendar_date), subs) AS subs,
  COALESCE(clicks - LAG(clicks) OVER (PARTITION BY creator_id, funnel_id ORDER BY calendar_date), clicks) AS clicks,
  COALESCE(revenue - LAG(revenue) OVER (PARTITION BY creator_id, funnel_id ORDER BY calendar_date), revenue) AS revenue
FROM (
  SELECT
    fd.calendar_date,
    fd.creator_id,
    cr.name AS creator_name,
    fd.funnel_id,
    f.name AS funnel_name,
    fd.subs,
    fd.clicks,
    fd.revenue
  FROM
    hoc.funnels_daily_revenues AS fd
  LEFT JOIN
    hoc.funnels f ON f.id = fd.funnel_id
  LEFT JOIN
    hoc.creators cr ON cr.id = fd.creator_id
) AS data
ORDER BY
  creator_name,
  funnel_name,
  calendar_date;
