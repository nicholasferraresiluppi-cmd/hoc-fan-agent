WITH IGData AS (
  SELECT
    pci.creator_id,
    pci.creator_name,
    pci.username AS owner_username,
    max(i.followed_by) AS instagram_followers
  FROM
    ig.profiles_creators pci
  LEFT JOIN
    ig.info i ON i.owner_username = pci.username
  WHERE
    DATE(i.commit_timestamp) = CURRENT_DATE()
  group by creator_id, pci.creator_name, owner_username
),
TTData AS (
  SELECT
    pct.creator_id,
    pct.creator_name,
    pct.unique_id,
    max(t.stats.followerCount) AS tiktok_followers
  FROM
    tt.profiles_creators pct
  LEFT JOIN
    tt.info t ON t.user.uniqueid = pct.unique_id
    WHERE
    DATE(t.commit_timestamp) = CURRENT_DATE()
    group by creator_id, pct.creator_name, unique_id
),
Creators AS (
  SELECT
    creator_id,
    creator_name,
    'Instagram' AS platform,
    owner_username AS username,
    instagram_followers AS followers
  FROM
    IGData
  UNION ALL
  SELECT
    creator_id,
    creator_name,
    'TikTok' AS platform,
    unique_id AS username,
    tiktok_followers AS followers
  FROM
    TTData
)
SELECT
  creator_name,
  platform,
  username,
  CONCAT(platform, '_', username) AS platform_username,
  followers
FROM
  Creators
ORDER BY
  creator_id, platform;
