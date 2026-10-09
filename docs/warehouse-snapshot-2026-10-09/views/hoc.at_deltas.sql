WITH
  ig_ordered_info AS (
  SELECT
    CONCAT(owner_username, '-', 'Instagram') AS account_id,
    is_private,
    followed_by,
    profile_pic_url,
    bio,
    bio_link,
    ROW_NUMBER() OVER (PARTITION BY owner_username ORDER BY commit_timestamp DESC ) AS row_number
  FROM
    `instagram.info`
  WHERE
    commit_timestamp >= TIMESTAMP(DATE_SUB(CURRENT_DATE('UTC'), INTERVAL 1 DAY))),
  ig_info AS (
  SELECT
    *
  FROM
    ig_ordered_info
  WHERE
    row_number = 1 ),
  tt_ordered_info AS (
  SELECT
    CONCAT(unique_id, '-', 'TikTok') AS account_id,
    private_account AS is_private,
    follower_count AS followed_by,
    avatar_larger AS profile_pic_url,
    signature AS bio,
    ROW_NUMBER() OVER (PARTITION BY unique_id ORDER BY commit_timestamp DESC ) AS row_number
  FROM
    `tiktok.info`
  WHERE
    commit_timestamp >= TIMESTAMP(DATE_SUB(CURRENT_DATE('UTC'), INTERVAL 1 DAY))),
  tt_info AS (
  SELECT
    *
  FROM
    tt_ordered_info
  WHERE
    row_number = 1 ),
  ig_todays_deltas AS (
  SELECT
    CONCAT(owner_username, '-', 'Instagram') AS account_id,
    MAX(sap.posts_count) AS posts_today,
    MAX(sar.reels_count) AS reels_today,
    COUNT(DISTINCT cs.id_key) AS stories_today
  FROM
    `instagram.cache_shallow_accounts_posts` sap
  LEFT JOIN
    `instagram.cache_shallow_accounts_reels` sar
  USING
    (owner_username)
  LEFT JOIN
    `instagram.cache_stories` cs
  USING
    (owner_username)
  WHERE
    cs.date_key = CURRENT_DATE('UTC')
  GROUP BY
    owner_username ),
  tt_todays_deltas AS (
  SELECT
    CONCAT(author_unique_id, '-', 'TikTok') AS account_id,
    MAX(posts_count) AS posts_today
  FROM
    `tiktok.cache_shallow_accounts_posts`
  GROUP BY
    author_unique_id ),
  ig_agg_deltas AS (
  SELECT
    CONCAT(owner_username, '-', 'Instagram') AS account_id,
    DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) AS today,
    SUM(CASE
        WHEN DATE(date_key) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_yesterday,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_3days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 8 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_7days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 15 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_14days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_28days,
    SUM(CASE
        WHEN DATE(date_key) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN reels_count_diff
        ELSE 0
    END
      ) AS reels_delta_yesterday,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY) THEN reels_count_diff
        ELSE 0
    END
      ) AS reels_delta_3days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 8 DAY) THEN reels_count_diff
        ELSE 0
    END
      ) AS reels_delta_7days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 15 DAY) THEN reels_count_diff
        ELSE 0
    END
      ) AS reels_delta_14days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) THEN reels_count_diff
        ELSE 0
    END
      ) AS reels_delta_28days,
    SUM(CASE
        WHEN DATE(date_key) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN stories_count
        ELSE 0
    END
      ) AS stories_delta_yesterday,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY) THEN stories_count
        ELSE 0
    END
      ) AS stories_delta_3days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 8 DAY) THEN stories_count
        ELSE 0
    END
      ) AS stories_delta_7days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 15 DAY) THEN stories_count
        ELSE 0
    END
      ) AS stories_delta_14days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) THEN stories_count
        ELSE 0
    END
      ) AS stories_delta_28days
  FROM
    `instagram.cache_accounts`
  WHERE
    DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY)
  GROUP BY
    owner_username ),
  tt_agg_deltas AS (
  SELECT
    CONCAT(author_unique_id, '-', 'TikTok') AS account_id,
    DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) AS today,
    SUM(CASE
        WHEN DATE(date_key) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_yesterday,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 4 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_3days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 8 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_7days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 15 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_14days,
    SUM(CASE
        WHEN DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY) THEN posts_count_diff
        ELSE 0
    END
      ) AS posts_delta_28days,
  FROM
    `tiktok.cache_accounts`
  WHERE
    DATE(date_key) >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY)
  GROUP BY
    author_unique_id ),
  accounts AS (
  SELECT
    CONCAT(username, '-', 'Instagram') AS account_id
  FROM
    `ig.profiles_creators`
  UNION ALL
  SELECT
    CONCAT(unique_id, '-', 'TikTok') AS account_id
  FROM
    `tt.profiles_creators`)
SELECT
  account_id,
  COALESCE(ii.is_private, ti.is_private) AS is_private,
  COALESCE(ii.followed_by, ti.followed_by) AS followed_by,
  COALESCE(ii.profile_pic_url, ti.profile_pic_url) AS profile_pic_url,
  COALESCE(ii.bio, ti.bio) AS bio,
  IFNULL(ii.bio_link, '') AS bio_link,
  COALESCE(iad.posts_delta_yesterday, tad.posts_delta_yesterday, 0) AS posts_delta_yesterday,
  COALESCE(id.posts_today, td.posts_today, 0) AS posts_today,
  COALESCE(iad.posts_delta_3days, tad.posts_delta_3days, 0) AS posts_delta_3days,
  COALESCE(iad.posts_delta_7days, tad.posts_delta_7days, 0) AS posts_delta_7days,
  COALESCE(iad.posts_delta_14days, tad.posts_delta_14days, 0) AS posts_delta_14days,
  COALESCE(iad.posts_delta_28days, tad.posts_delta_28days, 0) AS posts_delta_28days,
  IFNULL(reels_delta_yesterday, 0) AS reels_delta_yesterday,
  IFNULL(reels_today, 0) AS reels_today,
  IFNULL(reels_delta_3days, 0) AS reels_delta_3days,
  IFNULL(reels_delta_7days, 0) AS reels_delta_7days,
  IFNULL(reels_delta_14days, 0) AS reels_delta_14days,
  IFNULL(reels_delta_28days, 0) AS reels_delta_28days,
  IFNULL(stories_delta_yesterday, 0) AS stories_delta_yesterday,
  IFNULL(stories_today, 0) AS stories_today,
  IFNULL(stories_delta_3days, 0) AS stories_delta_3days,
  IFNULL(stories_delta_7days, 0) AS stories_delta_7days,
  IFNULL(stories_delta_14days, 0) AS stories_delta_14days,
  IFNULL(stories_delta_28days, 0) AS stories_delta_28days
FROM
  accounts
LEFT JOIN
  ig_info ii
USING
  (account_id)
LEFT JOIN
  tt_info ti
USING
  (account_id)
LEFT JOIN
  ig_todays_deltas id
USING
  (account_id)
LEFT JOIN
  tt_todays_deltas td
USING
  (account_id)
LEFT JOIN
  ig_agg_deltas iad
USING
  (account_id)
LEFT JOIN
  tt_agg_deltas tad
USING
  (account_id)
WHERE
  ii.is_private IS NOT NULL
  OR ti.is_private IS NOT NULL