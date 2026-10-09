WITH prep AS (
    SELECT
        DATE_SUB(DATE(batch_timestamp), INTERVAL 1 DAY) AS date_key,
        id,
        platform_id,
        COALESCE(JSON_VALUE(`data`, '$.media.owner.full_name'), JSON_VALUE(`data`, '$.owner.full_name'), JSON_VALUE(`data`, '$.user.full_name')) AS owner_full_name,
        COALESCE(JSON_VALUE(`data`, '$.media.pk'), JSON_VALUE(`data`, '$.id')) AS content_id,
        JSON_VALUE(`data`, '$.fbid') AS fbid,
        commit_timestamp,
        TIMESTAMP_SECONDS(CAST(COALESCE(JSON_VALUE(`data`, '$.media.taken_at'), JSON_VALUE(`data`, '$.taken_at')) AS INT64)) AS create_time,
        COALESCE(JSON_VALUE(`data`, '$.media.code'), JSON_VALUE(`data`, '$.code')) AS code,
        COALESCE(JSON_VALUE(`data`, '$.media.clips_metadata.music_canonical_id'), JSON_VALUE(`data`, '$.clips_metadata.music_canonical_id')) AS music_code,
        JSON_VALUE(`data`, '$.thumbnail_url') AS thumbnail_url,

        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.play_count'), JSON_VALUE(`data`, '$.play_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.play_count'), JSON_VALUE(`data`, '$.play_count')) AS INT64)) AS play_count,
        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.ig_play_count'), JSON_VALUE(`data`, '$.ig_play_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.ig_play_count'), JSON_VALUE(`data`, '$.ig_play_count')) AS INT64)) AS ig_play_count,
        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_play_count'), JSON_VALUE(`data`, '$.fb_play_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_play_count'), JSON_VALUE(`data`, '$.fb_play_count')) AS INT64)) AS fb_play_count,

        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.like_count'), JSON_VALUE(`data`, '$.like_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.like_count'), JSON_VALUE(`data`, '$.like_count')) AS INT64)) AS like_count,
        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.ig_like_count'), JSON_VALUE(`data`, '$.ig_like_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.ig_like_count'), JSON_VALUE(`data`, '$.ig_like_count')) AS INT64)) AS ig_like_count,
        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_like_count'), JSON_VALUE(`data`, '$.fb_like_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_like_count'), JSON_VALUE(`data`, '$.fb_like_count')) AS INT64)) AS fb_like_count,

        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.comment_count'), JSON_VALUE(`data`, '$.comment_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.comment_count'), JSON_VALUE(`data`, '$.comment_count')) AS INT64)) AS comment_count,
        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.ig_comment_count'), JSON_VALUE(`data`, '$.ig_comment_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.ig_comment_count'), JSON_VALUE(`data`, '$.ig_comment_count')) AS INT64)) AS ig_comment_count,
        IF(CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_comment_count'), JSON_VALUE(`data`, '$.fb_comment_count')) AS INT64) = 0, NULL, CAST(COALESCE(JSON_VALUE(`data`, '$.media.fb_comment_count'), JSON_VALUE(`data`, '$.fb_comment_count')) AS INT64)) AS fb_comment_count,
        COALESCE(JSON_VALUE(`data`, '$.media.caption.text'), JSON_VALUE(`data`, '$.caption.text')) AS caption,
        
        TIMESTAMP_TRUNC(batch_timestamp, HOUR) AS batch_timestamp,
        label,
        organization_id
    FROM
        `house-of-creators-358213.ig.raw_reels`
)

SELECT 
    date_key,
    id,
    platform_id,
    owner_full_name,
    content_id,
    fbid,
    commit_timestamp,
    create_time,
    code,
    music_code,
    thumbnail_url,
    COALESCE(ig_play_count, play_count - COALESCE(fb_play_count, 0)) AS play_count,
    COALESCE(ig_like_count, like_count - COALESCE(fb_like_count, 0)) AS like_count,
    COALESCE(ig_comment_count, comment_count - COALESCE(fb_comment_count, 0)) AS comment_count,
    caption,
    batch_timestamp,
    label,
    organization_id
FROM 
    prep