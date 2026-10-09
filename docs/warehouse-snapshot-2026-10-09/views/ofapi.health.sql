WITH s AS (
  SELECT sl.workspace, sl.smart_link_id, sl.smart_link_name, sl.account_username, sl.of_account_id,
         r.project, r.owner, r.active,
         cr.id AS creator_id, cr.name AS creator_name
  FROM `house-of-creators-358213.ofapi.smart_links` sl
  LEFT JOIN `house-of-creators-358213.ofapi.registry` r
    ON r.workspace = sl.workspace AND r.smart_link_id = sl.smart_link_id
  LEFT JOIN `house-of-creators-358213.postgres.public_creators` cr ON cr.platform_id = sl.of_account_id
),
k AS (
  SELECT workspace, smart_link_id,
         COUNTIF(conversion_type='new_subscriber') AS subs_30gg,
         COUNTIF(conversion_type='new_subscriber' AND campaign_id IS NULL) AS senza_utm,
         MAX(conversion_date) AS ultima
  FROM `house-of-creators-358213.ofapi.conversions`
  WHERE conversion_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY 1,2
)
SELECT s.workspace, s.smart_link_name, s.project, s.owner,
       COALESCE(s.creator_name, s.account_username) AS creator,
       IFNULL(k.subs_30gg,0) AS subs_30gg, k.ultima AS ultima_conversione,
       ROUND(100*(k.subs_30gg - k.senza_utm)/NULLIF(k.subs_30gg,0),1) AS pct_con_utm,
       CASE
         WHEN s.project IS NULL THEN 'KO non dichiarato: aggiungere una riga in ofapi.registry'
         WHEN s.active IS FALSE THEN 'ESCLUSO marcato active=FALSE nel registry'
         WHEN IFNULL(k.subs_30gg,0) = 0 THEN 'IN ATTESA nessuna sub negli ultimi 30 giorni'
         WHEN k.senza_utm = k.subs_30gg THEN 'OK sub tracciate, ma la landing non passa le UTM: nessun dettaglio per campagna'
         WHEN k.senza_utm > 0 THEN 'OK con traffico diretto residuo senza UTM'
         ELSE 'OK'
       END AS diagnosi
FROM s LEFT JOIN k ON k.workspace = s.workspace AND k.smart_link_id = s.smart_link_id
ORDER BY subs_30gg DESC