SELECT
  sq2.*,
  COALESCE(SUM(att.net), 0) AS revenue
FROM (
  SELECT
    sq.*,
    COALESCE(COUNT(shi.user_id), 0) AS subs
  FROM (
    SELECT
      fds.date_stats AS calendar_date,
      f.creator_id,
      fds.funnel_id,
      MAX(fds.clicks) AS clicks
    FROM
      `hoc.funnels_daily_stats` fds
    RIGHT JOIN
      `hoc.funnels` f
    ON
      fds.funnel_id = f.id
    GROUP BY
      fds.date_stats,
      f.creator_id,
      fds.funnel_id
    ORDER BY
      calendar_date DESC,
      funnel_id DESC) AS sq
  LEFT JOIN
    `hoc.subscriptions_history_intervals` shi
  ON
    sq.funnel_id = shi.funnel_id
    AND sq.calendar_date >= shi.start_calendar_date
  GROUP BY
    sq.calendar_date,
    sq.creator_id,
    sq.funnel_id,
    sq.clicks ) AS sq2
FULL JOIN
  `hoc.attributed_transactions` att
ON
  sq2.funnel_id = att.funnel_id
  AND sq2.calendar_date >= att.calendar_date
GROUP BY
  sq2.calendar_date,
  sq2.creator_id,
  sq2.funnel_id,
  sq2.clicks,
  sq2.subs