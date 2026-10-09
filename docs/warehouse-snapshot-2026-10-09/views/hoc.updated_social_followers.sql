WITH tt_ordered_snapshots AS (
  SELECT
    user.uniqueId AS uniqueId,
    DATE(commit_timestamp) AS calendar_date,
    stats.followerCount AS followerCount,
    ROW_NUMBER() OVER (
      PARTITION BY user.uniqueId, DATE(commit_timestamp)
      ORDER BY commit_timestamp DESC
    ) AS row_number
  FROM
    tt.info
),
tt_daily_diff AS (
  SELECT
    uniqueId,
    calendar_date,
    followerCount,
    followerCount - LAG(followerCount) OVER (
      PARTITION BY uniqueId
      ORDER BY calendar_date DESC
    ) AS follower_diff
  FROM
    tt_ordered_snapshots
  WHERE
    row_number = 1
),
tt_followers_agg AS (
  SELECT
    uniqueId AS username,
    SUM(CASE WHEN calendar_date = CURRENT_DATE() THEN follower_diff ELSE 0 END) AS followers_today,
    SUM(CASE WHEN calendar_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_yesterday,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_3_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_7_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_14_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_28_days,
    'TikTok_' || uniqueId AS platform_username
  FROM
    tt_daily_diff
  GROUP BY
    uniqueId
),
ig_ordered_snapshots AS (
  SELECT
    owner_id,
    owner_username,
    DATE(commit_timestamp) AS calendar_date,
    followed_by,
    ROW_NUMBER() OVER (
      PARTITION BY owner_id, DATE(commit_timestamp)
      ORDER BY commit_timestamp DESC
    ) AS row_number
  FROM
    ig.info
),
ig_daily_diff AS (
  SELECT
    owner_username,
    calendar_date,
    followed_by,
    followed_by - LAG(followed_by) OVER (
      PARTITION BY owner_id
      ORDER BY calendar_date
    ) AS follower_diff
  FROM
    ig_ordered_snapshots
  WHERE
    row_number = 1
),
ig_followers_agg AS (
  SELECT
    owner_username AS username,
    SUM(CASE WHEN calendar_date = CURRENT_DATE() THEN follower_diff ELSE 0 END) AS followers_today,
    SUM(CASE WHEN calendar_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_yesterday,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_3_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_7_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_14_days,
    SUM(CASE WHEN calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN follower_diff ELSE 0 END) AS followers_last_28_days,
    'Instagram_' || owner_username AS platform_username
  FROM
    ig_daily_diff
  GROUP BY
    owner_username
)
SELECT
  username,
  followers_today,
  followers_yesterday,
  followers_last_3_days,
  followers_last_7_days,
  followers_last_14_days,
  followers_last_28_days,
  platform_username
FROM
  tt_followers_agg

UNION ALL

SELECT
  username,
  followers_today,
  followers_yesterday,
  followers_last_3_days,
  followers_last_7_days,
  followers_last_14_days,
  followers_last_28_days,
  platform_username
FROM
  ig_followers_agg
ORDER BY
username
