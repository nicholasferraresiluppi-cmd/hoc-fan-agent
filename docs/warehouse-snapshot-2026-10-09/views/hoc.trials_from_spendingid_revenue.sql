WITH
  date_range AS (
  SELECT
    calendar_date
  FROM
    UNNEST(GENERATE_DATE_ARRAY( (
        SELECT
          MIN(calendar_date)
        FROM
          hoc.trials_from_spendingid), CURRENT_DATE() )) AS calendar_date ),
  summed_transactions AS (
  SELECT
    t.creator_id,
    t.user_id,
    t.trial_id,
    t.calendar_date,
    SUM(t.net) AS total_net
  FROM
    hoc.attributed_transactions t
  LEFT JOIN
    `house-of-creators-358213.hoc.cache_subs_notifications` c
  ON
    t.creator_id = c.creator_id
    AND t.user_id = c.user_id
    and t.trial_id=c.trial_id
  WHERE
    t.calendar_date >= c.calendar_date
  GROUP BY
    t.creator_id,
    t.user_id,
    t.trial_id,
    t.calendar_date ),
  unique_creators AS (
  SELECT
    DISTINCT creator_id,
    creator_name,
    spending_id
  FROM
    hoc.trials_from_spendingid )
SELECT DISTINCT
  dr.calendar_date,
  uc.creator_id,
  uc.creator_name,
  s.user_id,
  u.username,
  s.trial_id,
  s.trial_name,
  uc.spending_id,
  s.contribution,
  "trial" AS label,
  (st.total_net * s.contribution) AS revenue
FROM
  date_range dr
CROSS JOIN
  unique_creators uc
LEFT JOIN
  `hoc.trials_from_spendingid` s
ON
  dr.calendar_date = s.calendar_date
  AND uc.creator_id = s.creator_id
  AND uc.spending_id = s.spending_id
LEFT JOIN
  summed_transactions st
ON
  s.creator_id = st.creator_id
  AND s.user_id = st.user_id
  AND st.calendar_date >= s.calendar_date
LEFT JOIN hoc.users u on u.id=s.user_id
ORDER BY
  dr.calendar_date DESC,
  uc.creator_id,
  uc.spending_id;