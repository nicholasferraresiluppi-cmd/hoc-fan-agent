WITH
-- Quali campagne Meta appartengono a quale smart link. Si deduce dai CLICK, non dalle conversioni:
-- una campagna che porta traffico ma non ha ancora prodotto una sola sub esiste solo lì (è successo
-- il 20 ago con la campagna VIEW CONTENT: 34 arrivi, 0 conversioni → invisibile alle conversioni).
-- Nessuna convenzione sui nomi campagna, nessuna tabella di mappatura da mantenere a mano.
mappa AS (
  SELECT DISTINCT workspace, smart_link_id, campaign_id
  FROM `house-of-creators-358213.ofapi.clicks`
  WHERE campaign_id IS NOT NULL
),
spesa AS (
  SELECT
    m.workspace, m.smart_link_id, s.campaign_id, s.date_utc AS data,
    ANY_VALUE(s.campaign_name)   AS campaign_name,
    SUM(s.spend)                 AS spesa,
    SUM(s.impressions)           AS impression,
    SUM(s.link_clicks)           AS click_meta,
    SUM(s.landing_page_views)    AS landing_page_view,
    SUM(s.registrations)         AS registrazioni
  FROM `house-of-creators-358213.hoc.meta_ads_campaign_daily_utc` s
  JOIN mappa m ON m.campaign_id = s.campaign_id
  GROUP BY 1, 2, 3, 4
),
click AS (
  SELECT
    workspace, smart_link_id, IFNULL(campaign_id, '(senza UTM)') AS campaign_id, click_date AS data,
    COUNT(*)                        AS click_of,
    COUNTIF(NOT IFNULL(is_bot, FALSE)) AS click_of_umani
  FROM `house-of-creators-358213.ofapi.clicks`
  GROUP BY 1, 2, 3, 4
),
coorte AS (
  SELECT
    workspace, smart_link_id, IFNULL(campaign_id, '(senza UTM)') AS campaign_id, coorte AS data,
    ANY_VALUE(smart_link_name) AS smart_link_name,
    ANY_VALUE(creator)         AS creator,
    ANY_VALUE(project)         AS project,
    COUNT(*)                   AS sub,
    COUNTIF(scrive)            AS scrivono_coorte,
    COUNTIF(spender)           AS spender,
    SUM(transazioni)           AS transazioni,
    SUM(revenue_netta)         AS revenue_netta,
    SUM(revenue_lorda)         AS revenue_lorda
  FROM `house-of-creators-358213.ofapi.fan_coorte`
  GROUP BY 1, 2, 3, 4
),
-- L'altra lettura di "scrivono": eventi nel giorno, non fan della coorte. È quella che si mette in
-- una tabella giorno-per-giorno, perché non cambia retroattivamente.
engaged AS (
  SELECT
    workspace, smart_link_id, IFNULL(campaign_id, '(senza UTM)') AS campaign_id,
    conversion_date AS data, COUNT(*) AS scrivono_eventi
  FROM `house-of-creators-358213.ofapi.conversions`
  WHERE conversion_type = 'fan_sent_3_messages'
  GROUP BY 1, 2, 3, 4
),
-- Anagrafica risolta una volta sola. Senza, una riga fatta di soli click (campagna che porta
-- traffico e nessuna sub) resterebbe senza creator e sparirebbe da qualunque filtro per creator —
-- proprio la riga che serve vedere.
dim AS (
  SELECT
    s.workspace, s.smart_link_id, s.smart_link_name,
    COALESCE(cr.name, s.account_username) AS creator,
    r.project
  FROM `house-of-creators-358213.ofapi.smart_links` s
  LEFT JOIN `house-of-creators-358213.ofapi.registry` r
    ON r.workspace = s.workspace AND r.smart_link_id = s.smart_link_id
  LEFT JOIN `house-of-creators-358213.postgres.public_creators` cr
    ON cr.platform_id = s.of_account_id
),
chiavi AS (
  SELECT workspace, smart_link_id, campaign_id, data FROM spesa
  UNION DISTINCT SELECT workspace, smart_link_id, campaign_id, data FROM click
  UNION DISTINCT SELECT workspace, smart_link_id, campaign_id, data FROM coorte
  UNION DISTINCT SELECT workspace, smart_link_id, campaign_id, data FROM engaged
)
SELECT
  k.data, k.workspace, k.smart_link_id,
  d.smart_link_name,
  d.creator,
  d.project,
  k.campaign_id,
  sp.campaign_name,
  IFNULL(sp.spesa, 0)                  AS spesa,
  IFNULL(sp.impression, 0)             AS impression,
  IFNULL(sp.click_meta, 0)             AS click_meta,
  IFNULL(sp.landing_page_view, 0)      AS landing_page_view,
  IFNULL(sp.registrazioni, 0)          AS registrazioni,
  IFNULL(cl.click_of, 0)               AS click_of,
  IFNULL(cl.click_of_umani, 0)         AS click_of_umani,
  IFNULL(co.sub, 0)                    AS sub,
  IFNULL(en.scrivono_eventi, 0)        AS scrivono_eventi,
  IFNULL(co.scrivono_coorte, 0)        AS scrivono_coorte,
  IFNULL(co.spender, 0)                AS spender,
  IFNULL(co.transazioni, 0)            AS transazioni,
  IFNULL(co.revenue_netta, 0)          AS revenue_netta,
  IFNULL(co.revenue_lorda, 0)          AS revenue_lorda,
  -- Derivate: stanno qui perché sbagliare il denominatore è il modo più facile di raccontare
  -- una storia falsa (es. sub / click Meta invece di sub / click OF).
  ROUND(SAFE_DIVIDE(sp.spesa, co.sub), 2)                    AS costo_per_sub,
  ROUND(SAFE_DIVIDE(co.revenue_netta, co.sub), 2)            AS valore_per_sub,
  ROUND(SAFE_DIVIDE(co.revenue_netta, sp.spesa), 3)          AS ritorno,
  ROUND(SAFE_DIVIDE(sp.spesa, co.spender), 2)                AS costo_per_spender,
  ROUND(SAFE_DIVIDE(sp.spesa, cl.click_of), 4)               AS costo_per_click_of,
  ROUND(SAFE_DIVIDE(co.sub, cl.click_of) * 100, 2)           AS sub_per_click_of_pct,
  ROUND(SAFE_DIVIDE(cl.click_of, sp.click_meta) * 100, 1)    AS click_of_su_click_meta_pct,
  -- Quanti giorni ha la coorte rispetto all'ultimo dato disponibile. Sotto i 7 la revenue è
  -- incompleta: a 7 giorni se ne è visto circa il 78% (misurato 21 ago 2026), non tutto.
  DATE_DIFF(CURRENT_DATE(), k.data, DAY)                     AS eta_coorte_giorni
FROM chiavi k
LEFT JOIN spesa sp  USING (workspace, smart_link_id, campaign_id, data)
LEFT JOIN click cl  USING (workspace, smart_link_id, campaign_id, data)
LEFT JOIN coorte co USING (workspace, smart_link_id, campaign_id, data)
LEFT JOIN engaged en USING (workspace, smart_link_id, campaign_id, data)
LEFT JOIN dim d USING (workspace, smart_link_id)