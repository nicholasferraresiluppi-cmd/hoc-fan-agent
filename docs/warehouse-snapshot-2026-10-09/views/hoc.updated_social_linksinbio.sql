WITH base_data AS (
  SELECT
    calendar_date,
    creator_name,
    page_link,
    unique_visitors
  FROM
    `hoc.linksinbio_visits`
),

aggregated_visits AS (
  SELECT
    creator_name,
    page_link,
    SUM(CASE WHEN calendar_date = CURRENT_DATE() THEN unique_visitors ELSE NULL END) AS visits_today,
    SUM(CASE WHEN calendar_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN unique_visitors ELSE NULL END) AS visits_yesterday,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN unique_visitors ELSE NULL END) AS visits_last_3_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN unique_visitors ELSE NULL END) AS visits_last_7_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN unique_visitors ELSE NULL END) AS visits_last_14_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN unique_visitors ELSE NULL END) AS visits_last_28_days
  FROM
    base_data
  GROUP BY
    creator_name,
    page_link
)

SELECT
  creator_name,
  page_link,
  visits_today,
  visits_yesterday,
  visits_last_3_days,
  visits_last_7_days,
  visits_last_14_days,
  visits_last_28_days
FROM
  aggregated_visits
ORDER BY
  creator_name,
  page_link;
