SELECT
  fdd.*,
  fs.spending_id,
  f.link,
  f.created_at,
  (fdd.subs / NULLIF(fdd.clicks, 0)) AS CR
FROM
  hoc.funnels_daily_diffs AS fdd
LEFT JOIN
  hoc.funnels_sheets AS fs ON fs.id = fdd.funnel_id
LEFT JOIN
  hoc.creators AS c ON c.id = fdd.creator_id
LEFT JOIN
  hoc.funnels AS f ON f.id = fdd.funnel_id