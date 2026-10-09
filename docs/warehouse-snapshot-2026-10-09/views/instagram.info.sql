WITH raw_values AS (
    SELECT
        DATE_SUB(DATE(batch_timestamp), INTERVAL 1 DAY) AS date_key,
        id,
        platform_id,
        JSON_VALUE(`data`, '$.username') AS owner_username,
        JSON_VALUE(`data`, '$.full_name') AS owner_full_name,
        CAST(JSON_VALUE(`data`, '$.follower_count') AS INT64) AS followed_by,
        CAST(JSON_VALUE(`data`, '$.media_count') AS INT64) AS media_count,
        commit_timestamp,
        JSON_VALUE(`data`, '$.biography') AS bio,
        NULLIF(REGEXP_REPLACE(JSON_VALUE(`data`, '$.external_url'), '/$', ''), '') AS bio_link,
        CAST(JSON_VALUE(`data`, '$.is_private') AS BOOL) AS is_private,
        JSON_VALUE(`data`, '$.hd_profile_pic_url_info.url') AS profile_pic_url,
        TIMESTAMP_TRUNC(batch_timestamp, HOUR) AS batch_timestamp,
        label,
        organization_id
    FROM
        `house-of-creators-358213.ig.raw_info`
),

duplicated AS (
  SELECT
    date_key,
    platform_id,
    owner_username
  FROM 
    raw_values
  GROUP BY ALL
  HAVING COUNT(DISTINCT id) > 1
)

SELECT
    riv.date_key,
    riv.id, 
    riv.platform_id,
    CASE WHEN d.owner_username IS NOT NULL THEN acc.username ELSE riv.owner_username END AS owner_username,
    owner_full_name,
    IF(followed_by = 0, NULL, followed_by) AS followed_by,
    IF(media_count = 0, NULL, media_count) AS media_count,
    commit_timestamp,
    riv.bio,
    bio_link,
    is_private,
    profile_pic_url,
    batch_timestamp,
    label,
    riv.organization_id
FROM
    raw_values AS riv
    LEFT JOIN duplicated AS d ON riv.date_key = d.date_key AND riv.owner_username = d.owner_username AND riv.platform_id = d.platform_id
    LEFT JOIN `house-of-creators-358213.postgres.public_accounts` AS acc USING(id)