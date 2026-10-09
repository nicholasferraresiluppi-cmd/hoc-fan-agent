WITH prep AS (
    SELECT
        DATE_SUB(DATE(batch_timestamp), INTERVAL 1 DAY) AS date_key,
        id,
        platform_id,
        COALESCE(JSON_VALUE(`data`, '$.owner.username'), JSON_VALUE(`data`, '$.user.username')) AS owner_username,
        COALESCE(JSON_VALUE(`data`, '$.pk'), JSON_VALUE(`data`, '$.id')) AS content_id, 
        JSON_VALUE(`data`, '$.fbid') AS fbid,
        JSON_VALUE(`data`, '$.product_type') AS type,
        commit_timestamp,
        TIMESTAMP_SECONDS(CAST(JSON_VALUE(`data`, '$.taken_at') AS INT64)) AS create_time,
        JSON_VALUE(`data`, '$.code') AS code,
        JSON_VALUE(`data`, '$.thumbnail_url') AS thumbnail_url,
        
        IF(CAST(JSON_VALUE(`data`, '$.like_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.like_count') AS INT64))  AS like_count,
        IF(CAST(JSON_VALUE(`data`, '$.ig_like_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.ig_like_count') AS INT64))  AS ig_like_count,
        IF(CAST(JSON_VALUE(`data`, '$.fb_like_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.fb_like_count') AS INT64))  AS fb_like_count,

        IF(CAST(JSON_VALUE(`data`, '$.comment_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.comment_count') AS INT64))  AS comment_count,
        IF(CAST(JSON_VALUE(`data`, '$.ig_comment_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.ig_comment_count') AS INT64))  AS ig_comment_count,
        IF(CAST(JSON_VALUE(`data`, '$.fb_comment_count') AS INT64) = 0, NULL, CAST(JSON_VALUE(`data`, '$.fb_comment_count') AS INT64))  AS fb_comment_count,
        
        COALESCE(JSON_VALUE(`data`, '$.accessibility_caption'), JSON_VALUE(`data`, '$.caption.text')) AS caption,
        TIMESTAMP_TRUNC(batch_timestamp, HOUR) AS batch_timestamp,
        label,
        organization_id
    FROM
        `house-of-creators-358213.ig.raw_posts`
)

SELECT 
    date_key,
    id,
    platform_id,
    owner_username,
    content_id, 
    fbid,
    type,
    commit_timestamp,
    create_time,
    code,
    thumbnail_url,
    COALESCE(ig_like_count, like_count - COALESCE(fb_like_count, 0)) AS like_count,
    COALESCE(ig_comment_count, comment_count - COALESCE(fb_comment_count, 0)) AS comment_count,
    caption,
    batch_timestamp,
    label,
    organization_id
FROM 
    prep