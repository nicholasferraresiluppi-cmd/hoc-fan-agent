WITH base_data AS (
  SELECT 
    owner_username,
    content_type,
    data_creazione,
    status_contenuto,
    status_dettagliato,
    post_id,
    
    -- Normalizzazione degli status per gestire variazioni
    CASE 
      WHEN UPPER(status_contenuto) IN ('NORMALE', 'NORMAL', 'ATTIVO', 'ACTIVE') THEN 'NORMALE'
      WHEN UPPER(status_contenuto) IN ('BANNATO', 'BANNED', 'BLOCCATO', 'BLOCKED') THEN 'BANNATO'
      WHEN UPPER(status_contenuto) IN ('PERSO', 'LOST', 'MISSING', 'NON_TROVATO') THEN 'PERSO'
      WHEN UPPER(status_contenuto) IN ('RIMOSSO', 'REMOVED', 'DELETED', 'CANCELLATO') THEN 'RIMOSSO'
      WHEN UPPER(status_contenuto) IN ('SHADOWBAN', 'SHADOW_BAN', 'LIMITATO') THEN 'SHADOWBAN'
      ELSE COALESCE(status_contenuto, 'SCONOSCIUTO')
    END as status_normalizzato,
    
    -- Categorizzazione binaria per analisi semplificata
    CASE 
      WHEN UPPER(status_contenuto) IN ('NORMALE', 'NORMAL', 'ATTIVO', 'ACTIVE') THEN 'SANO'
      ELSE 'PROBLEMATICO'
    END as status_categoria,
    
    -- Flags di controllo
    is_lost_from_graph_7d,
    is_lost_from_graph_30d,
    ha_dati_deep,
    
    -- Metriche di performance per correlazione con status
    COALESCE(graph_likes, 0) as graph_likes,
    COALESCE(graph_comments, 0) as graph_comments,
    COALESCE(graph_total_interactions, 0) as graph_total_interactions,
    COALESCE(graph_reach, 0) as graph_reach,
    
    -- Calcoli temporali
    EXTRACT(YEAR FROM data_creazione) as year,
    EXTRACT(MONTH FROM data_creazione) as month,
    EXTRACT(WEEK FROM data_creazione) as week,
    FORMAT_DATE('%Y-%m', data_creazione) as year_month,
    FORMAT_DATE('%Y-W%U', data_creazione) as year_week,
    data_creazione as creation_date
    
  FROM `house-of-creators-358213.graph.heal_check`
  WHERE data_creazione IS NOT NULL
),

-- Aggregazione mensile per status
monthly_status_analysis AS (
  SELECT
    owner_username,
    year_month as period,
    'monthly' as period_type,
    year,
    month,
    MIN(creation_date) as period_start_date,
    MAX(creation_date) as period_end_date,
    
    -- Conteggi totali
    COUNT(*) as total_posts,
    COUNT(CASE WHEN content_type = 'Post' THEN 1 END) as total_posts_feed,
    COUNT(CASE WHEN content_type = 'Reel' THEN 1 END) as total_reels,
    
    -- Distribuzione per status normalizzato
    COUNT(CASE WHEN status_normalizzato = 'NORMALE' THEN 1 END) as posts_normali,
    COUNT(CASE WHEN status_normalizzato = 'BANNATO' THEN 1 END) as posts_bannati,
    COUNT(CASE WHEN status_normalizzato = 'PERSO' THEN 1 END) as posts_persi,
    COUNT(CASE WHEN status_normalizzato = 'RIMOSSO' THEN 1 END) as posts_rimossi,
    COUNT(CASE WHEN status_normalizzato = 'SHADOWBAN' THEN 1 END) as posts_shadowban,
    COUNT(CASE WHEN status_normalizzato = 'SCONOSCIUTO' THEN 1 END) as posts_status_sconosciuto,
    
    -- Categorizzazione semplificata
    COUNT(CASE WHEN status_categoria = 'SANO' THEN 1 END) as posts_sani,
    COUNT(CASE WHEN status_categoria = 'PROBLEMATICO' THEN 1 END) as posts_problematici,
    
    -- Percentuali (calcolate come misure in Looker per performance)
    ROUND((COUNT(CASE WHEN status_normalizzato = 'NORMALE' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_normali,
    ROUND((COUNT(CASE WHEN status_normalizzato = 'BANNATO' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_bannati,
    ROUND((COUNT(CASE WHEN status_normalizzato = 'PERSO' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_persi,
    ROUND((COUNT(CASE WHEN status_categoria = 'PROBLEMATICO' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_problematici,
    
    -- Correlazione con flags di sistema
    COUNT(CASE WHEN is_lost_from_graph_7d THEN 1 END) as posts_lost_graph_7d,
    COUNT(CASE WHEN is_lost_from_graph_30d THEN 1 END) as posts_lost_graph_30d,
    COUNT(CASE WHEN NOT ha_dati_deep THEN 1 END) as posts_senza_dati_deep,
    
    -- Metriche di performance per post sani vs problematici
    ROUND(AVG(CASE WHEN status_categoria = 'SANO' THEN graph_total_interactions END), 2) as avg_interactions_posts_sani,
    ROUND(AVG(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_total_interactions END), 2) as avg_interactions_posts_problematici,
    ROUND(AVG(CASE WHEN status_categoria = 'SANO' THEN graph_reach END), 2) as avg_reach_posts_sani,
    ROUND(AVG(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_reach END), 2) as avg_reach_posts_problematici,
    
    -- Engagement rate per categoria
    ROUND(
      CASE 
        WHEN SUM(CASE WHEN status_categoria = 'SANO' THEN graph_reach END) > 0 
        THEN (SUM(CASE WHEN status_categoria = 'SANO' THEN graph_total_interactions END) / 
              SUM(CASE WHEN status_categoria = 'SANO' THEN graph_reach END)) * 100 
        ELSE 0 
      END, 2
    ) as engagement_rate_posts_sani,
    
    ROUND(
      CASE 
        WHEN SUM(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_reach END) > 0 
        THEN (SUM(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_total_interactions END) / 
              SUM(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_reach END)) * 100 
        ELSE 0 
      END, 2
    ) as engagement_rate_posts_problematici
    
  FROM base_data
  GROUP BY owner_username, year_month, year, month
),

-- Aggregazione settimanale per status
weekly_status_analysis AS (
  SELECT
    owner_username,
    year_week as period,
    'weekly' as period_type,
    year,
    week,
    MIN(creation_date) as period_start_date,
    MAX(creation_date) as period_end_date,
    
    -- Conteggi totali
    COUNT(*) as total_posts,
    COUNT(CASE WHEN content_type = 'Post' THEN 1 END) as total_posts_feed,
    COUNT(CASE WHEN content_type = 'Reel' THEN 1 END) as total_reels,
    
    -- Distribuzione per status normalizzato
    COUNT(CASE WHEN status_normalizzato = 'NORMALE' THEN 1 END) as posts_normali,
    COUNT(CASE WHEN status_normalizzato = 'BANNATO' THEN 1 END) as posts_bannati,
    COUNT(CASE WHEN status_normalizzato = 'PERSO' THEN 1 END) as posts_persi,
    COUNT(CASE WHEN status_normalizzato = 'RIMOSSO' THEN 1 END) as posts_rimossi,
    COUNT(CASE WHEN status_normalizzato = 'SHADOWBAN' THEN 1 END) as posts_shadowban,
    COUNT(CASE WHEN status_normalizzato = 'SCONOSCIUTO' THEN 1 END) as posts_status_sconosciuto,
    
    -- Categorizzazione semplificata
    COUNT(CASE WHEN status_categoria = 'SANO' THEN 1 END) as posts_sani,
    COUNT(CASE WHEN status_categoria = 'PROBLEMATICO' THEN 1 END) as posts_problematici,
    
    -- Percentuali
    ROUND((COUNT(CASE WHEN status_normalizzato = 'NORMALE' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_normali,
    ROUND((COUNT(CASE WHEN status_normalizzato = 'BANNATO' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_bannati,
    ROUND((COUNT(CASE WHEN status_normalizzato = 'PERSO' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_persi,
    ROUND((COUNT(CASE WHEN status_categoria = 'PROBLEMATICO' THEN 1 END) / COUNT(*)) * 100, 2) as perc_posts_problematici,
    
    -- Correlazione con flags di sistema
    COUNT(CASE WHEN is_lost_from_graph_7d THEN 1 END) as posts_lost_graph_7d,
    COUNT(CASE WHEN is_lost_from_graph_30d THEN 1 END) as posts_lost_graph_30d,
    COUNT(CASE WHEN NOT ha_dati_deep THEN 1 END) as posts_senza_dati_deep,
    
    -- Metriche di performance per post sani vs problematici
    ROUND(AVG(CASE WHEN status_categoria = 'SANO' THEN graph_total_interactions END), 2) as avg_interactions_posts_sani,
    ROUND(AVG(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_total_interactions END), 2) as avg_interactions_posts_problematici,
    ROUND(AVG(CASE WHEN status_categoria = 'SANO' THEN graph_reach END), 2) as avg_reach_posts_sani,
    ROUND(AVG(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_reach END), 2) as avg_reach_posts_problematici,
    
    -- Engagement rate per categoria
    ROUND(
      CASE 
        WHEN SUM(CASE WHEN status_categoria = 'SANO' THEN graph_reach END) > 0 
        THEN (SUM(CASE WHEN status_categoria = 'SANO' THEN graph_total_interactions END) / 
              SUM(CASE WHEN status_categoria = 'SANO' THEN graph_reach END)) * 100 
        ELSE 0 
      END, 2
    ) as engagement_rate_posts_sani,
    
    ROUND(
      CASE 
        WHEN SUM(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_reach END) > 0 
        THEN (SUM(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_total_interactions END) / 
              SUM(CASE WHEN status_categoria = 'PROBLEMATICO' THEN graph_reach END)) * 100 
        ELSE 0 
      END, 2
    ) as engagement_rate_posts_problematici
    
  FROM base_data
  GROUP BY owner_username, year_week, year, week
)

-- Union delle aggregazioni mensili e settimanali
SELECT * FROM monthly_status_analysis
UNION ALL
SELECT * FROM weekly_status_analysis
ORDER BY owner_username, period_type, period