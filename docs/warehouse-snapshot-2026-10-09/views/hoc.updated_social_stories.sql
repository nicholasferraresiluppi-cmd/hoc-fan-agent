WITH IG_UniqueStories AS (
  SELECT
    pc.creator_id,
    pc.creator_name,
    po.owner_username,
    'Instagram_' || po.owner_username AS platform_username,
    COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(s.create_time)) = CURRENT_DATE() THEN s.id END) AS stories_count_today,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(s.create_time)) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.id END) AS stories_count_yesterday,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(s.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.id END) AS stories_count_3d,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(s.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.id END) AS stories_count_7d,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(s.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.id END) AS stories_count_14d,
COUNT(DISTINCT CASE WHEN DATE(TIMESTAMP_SECONDS(s.create_time)) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN s.id END) AS stories_count_28d
  FROM
    `ig.stories` AS s
  JOIN `ig.profiles_owners` AS po ON po.owner_id = s.owner_id
  JOIN `ig.profiles_creators` AS pc ON pc.username = po.owner_username
  GROUP BY
    pc.creator_id, pc.creator_name, po.owner_username
)
SELECT * FROM IG_UniqueStories order by creator_name