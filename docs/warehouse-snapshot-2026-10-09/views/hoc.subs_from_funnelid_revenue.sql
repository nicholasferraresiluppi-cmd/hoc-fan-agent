WITH
  date_range AS (
    SELECT
      calendar_date
    FROM
      UNNEST(GENERATE_DATE_ARRAY(
        (SELECT MIN(calendar_date) FROM `house-of-creators-358213.hoc.cache_subs_notifications`),
        CURRENT_DATE()
      )) AS calendar_date
  ),
  summed_transactions AS (
    SELECT
      t.creator_id,
      t.user_id,
      t.funnel_id,
      t.calendar_date,
      SUM(t.net) AS revenue
    FROM
      hoc.attributed_transactions t
    LEFT JOIN
    `onlyfans.organic_subscriptions` c
    ON
      t.creator_id = c.creator_id
      AND t.user_id = c.user_id
      AND t.funnel_id = c.funnel_id
    WHERE
      t.calendar_date >= c.calendar_date
    GROUP BY
      t.creator_id,
      t.user_id,
      t.funnel_id,
      t.calendar_date
  ),
  unique_creators AS (
    SELECT
      DISTINCT creator_id,
      creator_name
    FROM
      `house-of-creators-358213.hoc.cache_subs_notifications`
  )
SELECT
  DISTINCT dr.calendar_date,
  uc.creator_id,
  uc.creator_name,
  s.user_id,
  s.funnel_id,
  f.name as funnel_name,
  fs.spending_id,
  fs.contribution,
  st.revenue
FROM
  date_range dr
CROSS JOIN
  unique_creators uc
LEFT JOIN
  onlyfans.organic_subscriptions s
ON
  dr.calendar_date = s.calendar_date
  AND uc.creator_id = s.creator_id
LEFT JOIN
  summed_transactions st
ON
  uc.creator_id = st.creator_id
  AND s.user_id = st.user_id
  AND st.calendar_date >= s.calendar_date
  AND s.funnel_id = st.funnel_id
LEFT JOIN `hoc.funnels_sheets` as fs on fs.id=s.funnel_id
LEFT JOIN `postgres.public_creators` c on c.id=s.creator_id
LEFT JOIN `postgres.public_funnels` f on f.id=s.funnel_id
LEFT JOIN `postgres.public_trials` t on t.id=s.trial_id
ORDER BY
  dr.calendar_date DESC,
  uc.creator_id;
