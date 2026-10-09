WITH IG_UniquePosts AS (
  SELECT
    dr.creator_id,
    dr.creator_name,
    dr.owner_username,
    'Instagram_' || dr.owner_username AS platform_username,
    COUNT(DISTINCT CASE WHEN DATE(sr.create_time) = CURRENT_DATE() THEN sr.id_key END) AS posts_count_today,
    COUNT(DISTINCT CASE WHEN DATE(dr.create_time) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.id_key END) AS posts_count_yesterday,
    COUNT(DISTINCT CASE WHEN DATE(dr.create_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.id_key END) AS posts_count_3d,
    COUNT(DISTINCT CASE WHEN DATE(dr.create_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.id_key END) AS posts_count_7d,
    COUNT(DISTINCT CASE WHEN DATE(dr.create_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.id_key END) AS posts_count_14d,
    COUNT(DISTINCT CASE WHEN DATE(dr.create_time) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.id_key END) AS posts_count_28d
FROM
    `dataform_ig.cache_deep_reels` AS dr
LEFT JOIN 
    (SELECT owner_username, id_key, create_time
     FROM `dataform_ig.cache_shallow_reels`
     WHERE DATE(create_time) = CURRENT_DATE()) AS sr
ON sr.owner_username = dr.owner_username
GROUP BY
    dr.creator_id, dr.creator_name, dr.owner_username
),
TT_UniquePosts AS (
  SELECT
    pc.creator_id,
    pc.creator_name,
    p.unique_id AS unique_id,
    'TikTok_' || p.unique_id AS platform_username,
    COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(p.create_time)) = CURRENT_DATE() THEN p.video_id END) AS posts_count_today,
    COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(p.create_time)) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN p.video_id END) AS posts_count_yesterday,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(p.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN p.video_id END) AS posts_count_3d,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(p.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN p.video_id END) AS posts_count_7d,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(p.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN p.video_id END) AS posts_count_14d,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(p.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN p.video_id END) AS posts_count_28d
  FROM
    `tt.posts` AS p
  JOIN `tt.profiles_creators` AS pc ON pc.unique_id = p.unique_id
  GROUP BY
    pc.creator_id, pc.creator_name, p.unique_id
)
SELECT
  creator_id,
  creator_name,
  username,
  posts_count_today,
  posts_count_yesterday,
  posts_count_3d,
  posts_count_7d,
  posts_count_14d,
  posts_count_28d,
  platform_username
FROM
  (
    SELECT
      creator_id,
      creator_name,
      owner_username AS username,
      posts_count_today,
      posts_count_yesterday,
      posts_count_3d,
      posts_count_7d,
      posts_count_14d,
      posts_count_28d,
      platform_username
    FROM
      IG_UniquePosts
    UNION ALL
    SELECT
      creator_id,
      creator_name,
      unique_id AS username,
      posts_count_today,
      posts_count_yesterday,
      posts_count_3d,
      posts_count_7d,
      posts_count_14d,
      posts_count_28d,
      platform_username
    FROM
      TT_UniquePosts
  )
ORDER BY
  creator_name, platform_username;
