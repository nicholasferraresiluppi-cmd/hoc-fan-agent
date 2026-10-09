WITH vols AS (
  SELECT
    DATE(batch_timestamp) AS batch_timestamp,
    COUNT(DISTINCT CONCAT(a.id, JSON_VALUE(`data`, '$.video_id'))) as cnt
  FROM
    `house-of-creators-358213.tt.raw_posts` AS a
    INNER JOIN `house-of-creators-358213.postgres.public_accounts` AS b ON a.id=b.id AND platform = "TIKTOK" AND deleted_at IS NULL AND permanently_deleted IS FALSE
  WHERE 
    DATE(batch_timestamp) >= CURRENT_DATE('UTC') - 1
  GROUP BY 1
),

prep AS (
  SELECT
    MAX(CASE WHEN DATE(batch_timestamp) = CURRENT_DATE('UTC') THEN cnt END) AS today_cnt,
    MAX(CASE WHEN DATE(batch_timestamp) = CURRENT_DATE('UTC') - 1 THEN cnt END) AS yesterday_cnt
  FROM
    vols
)


SELECT
  *
FROM
  prep
WHERE
  today_cnt IS NULL                   -- oggi non ha dati
  OR today_cnt < yesterday_cnt * 0.9