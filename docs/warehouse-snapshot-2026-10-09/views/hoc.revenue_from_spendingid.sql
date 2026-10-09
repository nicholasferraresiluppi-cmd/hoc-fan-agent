WITH
  date_range AS (
    SELECT
      DATE_SUB(CURRENT_DATE(), INTERVAL n DAY) AS calendar_date
    FROM
      UNNEST(GENERATE_ARRAY(0, 1000)) AS n -- Questo genera un intervallo di date degli ultimi 1000 giorni
  ),
  stats AS (
    SELECT
      dr.calendar_date,
      f.creator_id,
      f.spending_id,
      SUM(t.net * f.contribution) AS revenue
    FROM
      date_range dr
    LEFT JOIN
      `house-of-creators-358213.hoc.funnels_sheets` f
    ON
      TRUE
    LEFT JOIN
      `hoc.organic_subscriptions_history` s
    ON
      f.creator_id = s.creator_id
      AND f.id = s.funnel_id
      AND dr.calendar_date = s.calendar_date
    LEFT JOIN
      `house-of-creators-358213.hoc.attributed_transactions` t
    ON
      s.creator_id = t.creator_id
      AND s.user_id = t.user_id
      AND s.funnel_id = t.funnel_id
      AND dr.calendar_date = t.calendar_date
    GROUP BY
    dr.calendar_date,
    f.creator_id,
    f.spending_id
    ORDER BY
      dr.calendar_date DESC)
    SELECT * from stats 
    order by calendar_date desc