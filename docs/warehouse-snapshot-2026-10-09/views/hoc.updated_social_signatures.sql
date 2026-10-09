WITH TT_RankedCommits AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY user.uniqueId ORDER BY commit_timestamp DESC) AS rn,
    'TikTok_' || user.uniqueid AS platform_username,
    pc.creator_id as tt_creator_id,
    pc.creator_name as tt_creator_name,
  FROM
    `tt.info` as i
  LEFT JOIN `tt.profiles_creators` pc on pc.unique_id=i.user.uniqueId
  WHERE
    user.uniqueid <> ""
  and active is true
),
IG_RankedCommits AS (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY owner_username ORDER BY commit_timestamp DESC) AS rn,
    'Instagram_' || owner_username AS platform_username,
    pc.creator_id as ig_creator_id,
    pc.creator_name as ig_creator_name
  FROM
    `ig.info` i
  left join ig.profiles_creators pc on pc.username=i.owner_username
  WHERE
    owner_username <> ""
  and active is true
)
SELECT
  user.uniqueid AS username,
  user.avatarmedium as thumb_url,
  user.signature as signature,
  NULL as link_bio,
  "tiktok" as social,
  commit_timestamp,
  platform_username,
  creator_id,
  creator_name
FROM
  TT_RankedCommits tt
WHERE
  rn = 1
UNION ALL
SELECT
  owner_username as username,
  profile_pic_url as thumb_url,
  bio as signature,
  bio_link as link_bio,
  "instagram" as social,
  commit_timestamp,
  platform_username,
  ig.creator_id,
  ig.creator_name
FROM
  IG_RankedCommits ig
WHERE
  rn = 1
ORDER BY
  platform_username;