SELECT
  DATE(event_datetime) AS calendar_date,
  IFNULL(c.alias, c.name) AS creator_name,
  cl.creator_id,
  ls.page_link,
  ls.stream_id,
  COUNT(event_name) AS unique_visitors
FROM
  hoc.linksinbio_simplify AS ls
LEFT JOIN
  `hoc.creators_linkinbio` cl
ON
  cl.url = ls.page_link
  AND cl.stream_id = ls.stream_id
LEFT JOIN
  `postgres.public_creators` c
ON
  cl.creator_id = c.id
GROUP BY
  calendar_date,
  creator_name,
  creator_id,
  page_link,
  stream_id
ORDER BY
  calendar_date desc