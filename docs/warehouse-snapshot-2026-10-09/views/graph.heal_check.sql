WITH
-- STEP 1: Get active accounts from info table (filtered for yesterday)
ActiveAccounts AS (
  SELECT DISTINCT
    owner_username
  FROM
    `house-of-creators-358213.instagram_graph.info`
  WHERE
    owner_username IS NOT NULL
    AND owner_username != ''
    AND DATE(batch_timestamp) = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
),

-- STEP 2: Get reels data from Graph API with latest tracking and metrics
GraphReels AS (
  SELECT
    SAFE_CAST(id_key AS INT64) AS id_key,
    owner_username,
    'Reel' AS content_type,
    created_at,
    permalink,
    timestamp_key AS ultimo_timestamp_graph,
    likes,
    comments,
    ig_reels_avg_watch_time AS avg_watch_time,
    ig_reels_video_view_total_time AS video_view_total_time,
    saved,
    shares,
    total_interactions,
    reach
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY id_key ORDER BY timestamp_key DESC) as rn
    FROM
      `house-of-creators-358213.instagram_graph.cache_reels`
    WHERE 
      id_key IS NOT NULL 
      AND owner_username IS NOT NULL
      AND owner_username IN (SELECT owner_username FROM ActiveAccounts)
  )
  WHERE rn = 1
),

-- STEP 3: Get posts data from Graph API with latest tracking and metrics
GraphPosts AS (
  SELECT
    SAFE_CAST(id_key AS INT64) AS id_key,
    owner_username,
    'Post' AS content_type,
    created_at,
    permalink,
    timestamp_key AS ultimo_timestamp_graph,
    likes,
    comments,
    follows,
    profile_activity,
    profile_visits,
    saved,
    shares,
    total_interactions,
    reach,
    NULL AS avg_watch_time,
    NULL AS video_view_total_time
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY id_key ORDER BY timestamp_key DESC) as rn
    FROM
      `house-of-creators-358213.instagram_graph.cache_posts`
    WHERE 
      id_key IS NOT NULL 
      AND owner_username IS NOT NULL
      AND owner_username IN (SELECT owner_username FROM ActiveAccounts)
  )
  WHERE rn = 1
),

-- STEP 4: Get latest deep reels data with metrics
DeepReels AS (
  SELECT
    SAFE_CAST(fbid AS INT64) AS fbid,
    commit_date AS ultimo_timestamp_deep,
    play_count AS deep_play_count,
    fb_play_count AS deep_fb_play_count,
    like_count AS deep_like_count,
    comment_count AS deep_comment_count
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY fbid ORDER BY commit_date DESC) as rn
    FROM
      `house-of-creators-358213.instagram.cache_deep_reels`
    WHERE fbid IS NOT NULL
  )
  WHERE rn = 1
),

-- STEP 5: Get latest deep posts data with metrics
DeepPosts AS (
  SELECT
    SAFE_CAST(fbid AS INT64) AS fbid,
    commit_date AS ultimo_timestamp_deep,
    NULL AS deep_play_count,
    NULL AS deep_fb_play_count,
    like_count AS deep_like_count,
    comment_count AS deep_comment_count
  FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY fbid ORDER BY commit_date DESC) as rn
    FROM
      `house-of-creators-358213.instagram.cache_deep_posts`
    WHERE fbid IS NOT NULL
  )
  WHERE rn = 1
),

-- STEP 6: Union all Graph content with standardized metrics (filter out NULL id_key)
AllGraphContent AS (
  SELECT 
    id_key, owner_username, content_type, created_at, permalink, ultimo_timestamp_graph,
    likes, comments, saved, shares, total_interactions, reach,
    NULL AS follows, NULL AS profile_activity, NULL AS profile_visits,
    avg_watch_time, video_view_total_time
  FROM GraphReels
  WHERE id_key IS NOT NULL
  UNION ALL
  SELECT 
    id_key, owner_username, content_type, created_at, permalink, ultimo_timestamp_graph,
    likes, comments, saved, shares, total_interactions, reach,
    follows, profile_activity, profile_visits,
    avg_watch_time, video_view_total_time
  FROM GraphPosts
  WHERE id_key IS NOT NULL
),

-- STEP 7: Union all Deep content with metrics (filter out NULL fbid)
AllDeepContent AS (
  SELECT fbid AS id_key, ultimo_timestamp_deep, deep_play_count, deep_fb_play_count, deep_like_count, deep_comment_count FROM DeepReels WHERE fbid IS NOT NULL
  UNION ALL
  SELECT fbid AS id_key, ultimo_timestamp_deep, deep_play_count, deep_fb_play_count, deep_like_count, deep_comment_count FROM DeepPosts WHERE fbid IS NOT NULL
)

-- STEP 8: Final detailed analysis - one row per post/reel with all metrics
SELECT
  G.id_key AS post_id,
  G.owner_username,
  G.content_type,
  G.permalink,
  
  -- Date fields
  DATE(G.created_at) AS data_creazione,
  DATE(G.ultimo_timestamp_graph) AS data_ultimo_tracking_graph,
  DATE(D.ultimo_timestamp_deep) AS data_ultimo_tracking_deep,
  
  -- Days calculations
  DATE_DIFF(CURRENT_DATE(), DATE(G.ultimo_timestamp_graph), DAY) AS giorni_da_ultimo_tracking_graph,
  DATE_DIFF(CURRENT_DATE(), DATE(D.ultimo_timestamp_deep), DAY) AS giorni_da_ultimo_tracking_deep,
  DATE_DIFF(DATE(G.ultimo_timestamp_graph), DATE(G.created_at), DAY) AS giorni_vita_tracking,
  
  -- Graph API metrics (latest values)
  G.likes AS graph_likes,
  G.comments AS graph_comments,
  G.saved AS graph_saved,
  G.shares AS graph_shares,
  G.total_interactions AS graph_total_interactions,
  G.reach AS graph_reach,
  
  -- Posts-specific Graph metrics
  CASE WHEN G.content_type = 'Post' THEN G.follows ELSE NULL END AS graph_follows,
  CASE WHEN G.content_type = 'Post' THEN G.profile_activity ELSE NULL END AS graph_profile_activity,
  CASE WHEN G.content_type = 'Post' THEN G.profile_visits ELSE NULL END AS graph_profile_visits,
  
  -- Reels-specific Graph metrics
  CASE WHEN G.content_type = 'Reel' THEN G.avg_watch_time ELSE NULL END AS graph_avg_watch_time,
  CASE WHEN G.content_type = 'Reel' THEN G.video_view_total_time ELSE NULL END AS graph_video_view_total_time,
  
  -- Deep API metrics (latest values)
  D.deep_like_count,
  D.deep_comment_count,
  
  -- Reels-specific Deep metrics
  CASE WHEN G.content_type = 'Reel' THEN D.deep_play_count ELSE NULL END AS deep_play_count,
  CASE WHEN G.content_type = 'Reel' THEN D.deep_fb_play_count ELSE NULL END AS deep_fb_play_count,
  
  -- Metrics comparison (when both sources available)
  CASE 
    WHEN G.likes IS NOT NULL AND D.deep_like_count IS NOT NULL 
    THEN ABS(G.likes - CAST(D.deep_like_count AS INT64))
    ELSE NULL 
  END AS diff_likes_graph_vs_deep,
  
  CASE 
    WHEN G.comments IS NOT NULL AND D.deep_comment_count IS NOT NULL 
    THEN ABS(G.comments - D.deep_comment_count)
    ELSE NULL 
  END AS diff_comments_graph_vs_deep,
  
  -- Content classification
  CASE
    WHEN D.ultimo_timestamp_deep IS NULL THEN 'BANNATO'
    WHEN DATE(D.ultimo_timestamp_deep) > DATE(G.ultimo_timestamp_graph) THEN 'PERSO'
    WHEN DATE(D.ultimo_timestamp_deep) <= DATE(G.ultimo_timestamp_graph) THEN 'NORMALE'
    ELSE 'SCONOSCIUTO'
  END AS status_contenuto,
  
  -- Status flags
  CASE 
    WHEN DATE_DIFF(CURRENT_DATE(), DATE(G.ultimo_timestamp_graph), DAY) > 7 THEN TRUE 
    ELSE FALSE 
  END AS is_lost_from_graph_7d,
  
  CASE 
    WHEN DATE_DIFF(CURRENT_DATE(), DATE(G.ultimo_timestamp_graph), DAY) > 30 THEN TRUE 
    ELSE FALSE 
  END AS is_lost_from_graph_30d,
  
  -- Deep API availability flag
  CASE 
    WHEN D.ultimo_timestamp_deep IS NOT NULL THEN TRUE 
    ELSE FALSE 
  END AS ha_dati_deep,
  
  -- Performance category based on Graph metrics
  CASE
    WHEN G.content_type = 'Reel' AND G.video_view_total_time >= 10000 THEN 'High Performance'
    WHEN G.content_type = 'Post' AND G.total_interactions >= 1000 THEN 'High Performance'
    WHEN G.total_interactions >= 100 THEN 'Medium Performance'
    WHEN G.total_interactions > 0 THEN 'Low Performance'
    ELSE 'No Data'
  END AS performance_category,
  
  -- Detailed status for filtering
  CASE
    WHEN D.ultimo_timestamp_deep IS NULL THEN 'Bannato'
    WHEN DATE(D.ultimo_timestamp_deep) > DATE(G.ultimo_timestamp_graph) AND DATE_DIFF(CURRENT_DATE(), DATE(G.ultimo_timestamp_graph), DAY) > 30 THEN 'Perso da >30gg'
    WHEN DATE(D.ultimo_timestamp_deep) > DATE(G.ultimo_timestamp_graph) AND DATE_DIFF(CURRENT_DATE(), DATE(G.ultimo_timestamp_graph), DAY) > 7 THEN 'Perso da >7gg'
    WHEN DATE(D.ultimo_timestamp_deep) > DATE(G.ultimo_timestamp_graph) THEN 'Perso recente'
    ELSE 'Normale'
  END AS status_dettagliato,
  
  -- TOTALI PER ACCOUNT E TIPO CONTENUTO
  COUNT(*) OVER (PARTITION BY G.owner_username, G.content_type) AS totale_contenuti_per_tipo,
  
  CURRENT_TIMESTAMP() AS timestamp_analisi

FROM AllGraphContent G
LEFT JOIN AllDeepContent D ON G.id_key = D.id_key

ORDER BY
  G.owner_username,
  G.content_type,
  DATE(G.ultimo_timestamp_graph) DESC;