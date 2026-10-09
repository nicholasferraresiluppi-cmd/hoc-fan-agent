SELECT
    l.creator_id,
    l.spending_id,
    lds.calendar_date,
    SUM(lds.unions * l.contribution) AS unions
  FROM
    `house-of-creators-358213.telegram.links_daily_stats` lds
  LEFT JOIN
    `house-of-creators-358213.telegram.links_sheets` l
  ON
    l.link_id = lds.link_id
  WHERE
    l.spending_id IS NOT NULL
  GROUP BY
    l.creator_id,
    l.spending_id,
    lds.calendar_date