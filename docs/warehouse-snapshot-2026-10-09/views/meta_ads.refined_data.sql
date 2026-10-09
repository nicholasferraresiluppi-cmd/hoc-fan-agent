WITH src_dedup AS (
  SELECT a.*
  FROM `house-of-creators-358213.meta_ads.datasource` a
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY
      Report__Date,
      Account__Account_name,
      Campaign__Campaign_Id,
      Ad_group__Ad_group_Id,
      Ad__Ad_Id,
      Audience__Gender,
      Audience__Age
    ORDER BY Row_Updated_At DESC
  ) = 1
),

src_creator AS (
  SELECT
    a.*,
    pc.alias AS creator_name,
    ROW_NUMBER() OVER (
      PARTITION BY
        a.Report__Date,
        a.Account__Account_name,
        a.Campaign__Campaign_Id,
        a.Ad_group__Ad_group_Id,
        a.Ad__Ad_Id,
        a.Audience__Gender,
        a.Audience__Age
      ORDER BY LENGTH(pc.alias) DESC
    ) AS rn_creator
  FROM src_dedup a
  LEFT JOIN `postgres.public_creators` pc
    ON pc.silent = FALSE
   AND LOWER(a.Campaign__Campaign_name) LIKE CONCAT('%', LOWER(pc.alias), '%')
),

clean AS (
  SELECT
    *,
    CASE
      WHEN LOWER(Campaign__Campaign_name) LIKE '%sales%'    THEN 'sales'
      WHEN LOWER(Campaign__Campaign_name) LIKE '%farm%'     THEN 'farming'
      WHEN LOWER(Campaign__Campaign_name) LIKE '%traffic%'  THEN 'traffic'
      WHEN LOWER(Campaign__Campaign_name) LIKE '%pagelike%' THEN 'pagelike'
      WHEN LOWER(Campaign__Campaign_name) LIKE '%page like%' THEN 'pagelike'
      ELSE 'other'
    END AS label
  FROM src_creator
  WHERE rn_creator = 1
),

totals AS (
  SELECT
    Report__Date AS calendar_date,
    creator_name,
    Account__Account_name AS account_name,
    Campaign__Campaign_name AS campaign_name,
    Ad_group__Ad_group_name AS adset_name,
    Ad__Ad_name AS ad_name,
    Ad__Ad_Id AS ad_id,
    label,

    SUM(Performance__Impressions) AS impressions,
    SUM(Performance__Clicks) AS clicks,
    SUM(Cost__Amount_spend) AS spent,
    SUM(Conversions__Views_Content___Total) AS content_views,
    SUM(Conversions__Landing_Page_Views___Total) AS landing_views,

    MAX(Performance__Reach) AS reach,
    MAX(Performance__Frequency) AS frequency
  FROM clean
  WHERE Audience__Gender IS NULL AND Audience__Age IS NULL
  GROUP BY 1,2,3,4,5,6,7,8
),

breakdown_rollup AS (
  SELECT
    Report__Date AS calendar_date,
    creator_name,
    Account__Account_name AS account_name,
    Campaign__Campaign_name AS campaign_name,
    Ad_group__Ad_group_name AS adset_name,
    Ad__Ad_name AS ad_name,
    Ad__Ad_Id AS ad_id,
    label,

    SUM(Performance__Impressions) AS impressions,
    SUM(Performance__Clicks) AS clicks,
    SUM(Cost__Amount_spend) AS spent,
    SUM(Conversions__Views_Content___Total) AS content_views,
    SUM(Conversions__Landing_Page_Views___Total) AS landing_views,

    -- best effort se manca la riga totale
    SUM(Performance__Reach) AS reach_from_breakdown
  FROM clean
  GROUP BY 1,2,3,4,5,6,7,8
),

final AS (
  SELECT
    b.calendar_date,
    b.creator_name,
    b.account_name,
    b.campaign_name,
    b.adset_name,
    b.ad_name,
    b.ad_id,
    b.label,

    COALESCE(t.impressions, b.impressions) AS total_impressions,
    COALESCE(t.clicks, b.clicks)           AS total_clicks,
    COALESCE(t.spent, b.spent)             AS total_spent,
    COALESCE(t.content_views, b.content_views) AS total_content_views,
    COALESCE(t.landing_views, b.landing_views) AS total_landingpage_views,

    COALESCE(t.reach, b.reach_from_breakdown) AS total_reach,
    COALESCE(
      t.frequency,
      SAFE_DIVIDE(
        COALESCE(t.impressions, b.impressions),
        NULLIF(COALESCE(t.reach, b.reach_from_breakdown), 0)
      )
    ) AS total_frequency,

    SAFE_DIVIDE(COALESCE(t.clicks, b.clicks), NULLIF(COALESCE(t.impressions, b.impressions), 0)) AS ctr_calc,
    SAFE_MULTIPLY(1000, SAFE_DIVIDE(COALESCE(t.spent, b.spent), NULLIF(COALESCE(t.impressions, b.impressions), 0))) AS cpm_calc
  FROM breakdown_rollup b
  LEFT JOIN totals t
    USING (calendar_date, creator_name, account_name, campaign_name, adset_name, ad_name, ad_id, label)
)

SELECT *
FROM final
ORDER BY calendar_date DESC;
