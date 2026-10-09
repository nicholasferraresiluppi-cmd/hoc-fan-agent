WITH prep AS (
  SELECT
    DATE_SUB(DATE(batch_timestamp), INTERVAL 1 DAY) AS date_key,
    id, 
    platform_id,
    JSON_VALUE(`data`, '$.author.unique_id') AS author_unique_id,
    JSON_VALUE(`data`, '$.video_id') AS video_id,
    commit_timestamp,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(`data`, '$.create_time') AS INT64)) AS create_time,
    JSON_VALUE(`data`, '$.aweme_id') AS aweme_id,
    JSON_VALUE(`data`, '$.region') AS region,
    CAST(JSON_VALUE(`data`, '$.duration')AS INT64) AS duration,
    JSON_VALUE(`data`, '$.play') AS play_url,
    CAST(JSON_VALUE(`data`, '$.music_info.id') AS STRING) AS music_id,
    JSON_VALUE(`data`, '$.music_info.play') AS music_play,
    JSON_VALUE(`data`, '$.cover') AS thumbnail_url,
    JSON_VALUE(`data`, '$.ai_dynamic_cover') AS thumbnail_url_gif,
    IF(CAST(JSON_VALUE(`data`, '$.play_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.play_count') AS INT64)) AS play_count,
    IF(CAST(JSON_VALUE(`data`, '$.comment_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.comment_count') AS INT64)) AS comment_count,
    IF(CAST(JSON_VALUE(`data`, '$.digg_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.digg_count') AS INT64)) AS digg_count,
    IF(CAST(JSON_VALUE(`data`, '$.share_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.share_count') AS INT64)) AS share_count,
    IF(CAST(JSON_VALUE(`data`, '$.download_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.download_count') AS INT64)) AS download_count,
    IF(CAST(JSON_VALUE(`data`, '$.collect_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.collect_count') AS INT64)) AS collect_count,
    JSON_VALUE(`data`, '$.title') AS caption,
    TIMESTAMP_TRUNC(batch_timestamp, HOUR) AS batch_timestamp,
    label,
    organization_id
  FROM
    `house-of-creators-358213.tt.raw_posts`
)

SELECT
    date_key,
    id, 
    platform_id,
    author_unique_id,
    video_id,
    commit_timestamp,
    create_time,
    aweme_id,
    region,
    duration,
    play_url,
    music_id,
    music_play,
    thumbnail_url,
    thumbnail_url_gif,
    MAX(IFNULL(play_count, 0)) OVER (PARTITION BY id, video_id ORDER BY date_key ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS play_count,
    comment_count,
    digg_count,
    share_count,
    download_count,
    collect_count,
    caption,
    batch_timestamp,
    label,
    organization_id
FROM
    prep