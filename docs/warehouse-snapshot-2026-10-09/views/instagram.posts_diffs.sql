SELECT
  date_key,
  id,
  content_id,
  platform_id,
  fbid,
  commit_timestamp,
  batch_timestamp,
  type,
  owner_username,
  create_time,
  CONCAT('https://www.instagram.com/p/', code, '/') AS url,
  thumbnail_url,
  like_count,
  IF(DATE(create_time) = date_key, like_count, GREATEST(like_count - IFNULL(LAG(like_count) OVER(PARTITION BY id, content_id ORDER BY date_key), like_count), 0)) AS like_count_diff,
  comment_count,
  IF(DATE(create_time) = date_key, comment_count, GREATEST(comment_count - IFNULL(LAG(comment_count) OVER(PARTITION BY id, content_id ORDER BY date_key), comment_count), 0)) AS comment_count_diff,
  caption,
  1 AS posts_count,
  CASE date_key = DATE(create_time, 'UTC') WHEN TRUE THEN 1 ELSE 0 END AS posts_count_diff,
  organization_id
FROM
  `house-of-creators-358213.instagram.posts_gaps_filled`