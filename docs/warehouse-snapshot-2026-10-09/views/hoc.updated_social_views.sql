WITH tt_posts_views AS (
  SELECT
    pc.creator_id,
    pc.creator_name,
    pd.unique_id,
    SUM(CASE WHEN pd.calendar_date = CURRENT_DATE() THEN pd.play_count_var ELSE 0 END) AS views_today,
    SUM(CASE WHEN pd.calendar_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN pd.play_count_var ELSE 0 END) AS views_yesterday,
    SUM(CASE WHEN pd.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN pd.play_count_var ELSE 0 END) AS views_last_3_days,
    SUM(CASE WHEN pd.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN pd.play_count_var ELSE 0 END) AS views_last_7_days,
    SUM(CASE WHEN pd.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN pd.play_count_var ELSE 0 END) AS views_last_14_days,
    SUM(CASE WHEN pd.calendar_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN pd.play_count_var ELSE 0 END) AS views_last_28_days,
    'TikTok_' || pd.unique_id AS platform_username
  FROM
    `tt.cacheTT_tiktoks_diffs` AS pd
  JOIN `tt.profiles_creators` AS pc ON pc.unique_id = pd.unique_id
  GROUP BY
    pc.creator_id, pc.creator_name, pd.unique_id
),
ig_reels_views AS (
  SELECT
   dr.creator_id,
   dr.creator_name,
   dr.owner_username,
   coalesce (sr.play_count_diff,0) AS views_today, -- Somma solo dalla shallow per il giorno corrente
   SUM(CASE WHEN dr.date_key = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.play_count_diff ELSE 0 END) AS views_yesterday,
   SUM(CASE WHEN dr.date_key BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.play_count_diff ELSE 0 END) AS views_last_3_days,
   SUM(CASE WHEN dr.date_key BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.play_count_diff ELSE 0 END) AS views_last_7_days,
   SUM(CASE WHEN dr.date_key BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.play_count_diff ELSE 0 END) AS views_last_14_days,
   SUM(CASE WHEN dr.date_key BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 28 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) THEN dr.play_count_diff ELSE 0 END) AS views_last_28_days,
   'Instagram_' || dr.owner_username AS platform_username
FROM
   `dataform_ig.cache_deep_reels` AS dr
LEFT JOIN 
   (SELECT owner_username, SUM(play_count_diff) AS play_count_diff
    FROM `dataform_ig.cache_shallow_reels`
    WHERE DATE(create_time) = CURRENT_DATE()
    GROUP BY owner_username) AS sr
ON sr.owner_username = dr.owner_username
GROUP BY
   dr.creator_id, dr.creator_name, dr.owner_username, sr.play_count_diff
)
SELECT
  creator_id,
  creator_name,
  username,
  views_today,
  views_yesterday,
  views_last_3_days,
  views_last_7_days,
  views_last_14_days,
  views_last_28_days,
  platform_username
FROM
  (
    SELECT
      creator_id,
      creator_name,
      unique_id AS username,
      views_today,
      views_yesterday,
      views_last_3_days,
      views_last_7_days,
      views_last_14_days,
      views_last_28_days,
      platform_username
    FROM
      tt_posts_views
    UNION ALL
    SELECT
      creator_id,
      creator_name,
      owner_username AS username,
      views_today,
      views_yesterday,
      views_last_3_days,
      views_last_7_days,
      views_last_14_days,
      views_last_28_days,
      platform_username
    FROM
      ig_reels_views
  )
ORDER BY
  creator_name, platform_username;
