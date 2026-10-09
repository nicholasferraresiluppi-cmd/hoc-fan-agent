SELECT
  DATE_SUB(DATE(batch_timestamp), INTERVAL 1 DAY) AS date_key,
  JSON_VALUE(`data`, '$.id') AS owner_id,
  JSON_VALUE(`data`, '$.username') AS owner_username,
  JSON_VALUE(`data`, '$.full_name') AS owner_full_name,
  IF(CAST(JSON_VALUE(`data`, '$.follower_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.follower_count') AS INT64)) AS followed_by,
  IF(CAST(JSON_VALUE(`data`, '$.media_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.media_count') AS INT64)) AS media_count,
  commit_timestamp,
  JSON_VALUE(`data`, '$.biography') AS bio,
  NULLIF(REGEXP_REPLACE(JSON_VALUE(`data`, '$.external_url'), '/$', ''), '') AS bio_link,
  CAST(JSON_VALUE(`data`, '$.is_private') AS BOOL) AS is_private,
  JSON_VALUE(`data`, '$.hd_profile_pic_url_info.url') AS profile_pic_url,
  TIMESTAMP_TRUNC(batch_timestamp, HOUR) AS batch_timestamp,
  label,
FROM
  `house-of-creators-358213.tf.raw_info`