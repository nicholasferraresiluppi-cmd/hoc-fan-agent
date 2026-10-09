SELECT
  DATE_SUB(DATE(batch_timestamp), INTERVAL 1 DAY) AS date_key,
  COALESCE(JSON_VALUE(`data`, '$.media.owner.id'), JSON_VALUE(`data`, '$.owner.id'), JSON_VALUE(`data`, '$.user.id')) AS owner_id,
  COALESCE(JSON_VALUE(`data`, '$.media.owner.full_name'), JSON_VALUE(`data`, '$.owner.full_name'), JSON_VALUE(`data`, '$.user.full_name')) AS owner_full_name,
  COALESCE(JSON_VALUE(`data`, '$.media.pk'), JSON_VALUE(`data`, '$.id')) AS id,
  JSON_VALUE(`data`, '$.fbid') AS fbid,
  commit_timestamp,
  TIMESTAMP_SECONDS(CAST(COALESCE(JSON_VALUE(`data`, '$.media.taken_at'), JSON_VALUE(`data`, '$.taken_at')) AS INT64)) AS create_time,
  COALESCE(JSON_VALUE(`data`, '$.media.code'), JSON_VALUE(`data`, '$.code')) AS code,
  COALESCE(JSON_VALUE(`data`, '$.media.clips_metadata.music_canonical_id'), JSON_VALUE(`data`, '$.clips_metadata.music_canonical_id'), JSON_VALUE(`data`, '$.clips_metadata.music_info.music_asset_info.audio_id')) AS music_code,
  JSON_VALUE(`data`, '$.thumbnail_url') AS thumbnail_url,
  GREATEST(IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.play_count'), JSON_VALUE(`data`, '$.play_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.play_count'), JSON_VALUE(`data`, '$.play_count')) AS INT64)), 0) AS play_count,
  IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.like_count'), JSON_VALUE(`data`, '$.like_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.like_count'), JSON_VALUE(`data`, '$.like_count')) AS INT64)) AS like_count,
  IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.comment_count'), JSON_VALUE(`data`, '$.comment_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.comment_count'), JSON_VALUE(`data`, '$.comment_count')) AS INT64)) AS comment_count,
  COALESCE(JSON_VALUE(`data`, '$.media.caption.text'), JSON_VALUE(`data`, '$.caption.text')) AS caption,
  TIMESTAMP_TRUNC(batch_timestamp, HOUR) AS batch_timestamp,
  label,
  IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_play_count'), JSON_VALUE(`data`, '$.fb_play_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_play_count'), JSON_VALUE(`data`, '$.fb_play_count')) AS INT64)) AS fb_play_count,
  JSON_VALUE(`data`, '$.clips_metadata.music_info.music_asset_info.title') music_title,
  JSON_VALUE(`data`, '$.clips_metadata.music_info.music_asset_info.duration_in_ms') music_duration_ms,
  JSON_VALUE(`data`, '$.clips_metadata.music_info.music_asset_info.progressive_download_url') music_download_url
FROM
  `house-of-creators-358213.tf.raw_reels`
WHERE
  COALESCE(JSON_VALUE(`data`, '$.media.owner.id'), JSON_VALUE(`data`, '$.owner.id'), JSON_VALUE(`data`, '$.user.id')) IS NOT NULL