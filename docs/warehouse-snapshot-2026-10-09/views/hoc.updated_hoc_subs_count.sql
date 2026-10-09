SELECT
c.id AS creator_id,
c.name AS creator_name,
  COUNT(DISTINCT
    CASE
      WHEN DATE((s.calendar_date)) = CURRENT_DATE() THEN s.user_id
  END
    ) AS subs_count_today,
  COUNT(DISTINCT
    CASE
      WHEN DATE(s.calendar_date) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.user_id
    END
) AS subs_count_yesterday,

COUNT(DISTINCT
    CASE
      WHEN DATE(s.calendar_date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.user_id
    END
) AS subs_count_3d,

COUNT(DISTINCT
    CASE
      WHEN DATE(s.calendar_date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.user_id
    END
) AS subs_count_7d,

COUNT(DISTINCT
    CASE
      WHEN DATE(s.calendar_date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.user_id
    END
) AS subs_count_14d,

COUNT(DISTINCT
    CASE
      WHEN DATE(s.calendar_date) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.user_id
    END
) AS subs_count_28d

FROM
  hoc.subs_notifications AS s
LEFT JOIN
  hoc.creators AS c
ON
  c.id=s.creator_id
   where sub_type in('new_subscriber','new_subscriber_trial','returning_subscriber')
  group by c.id, c.name
  order by subs_count_28d desc