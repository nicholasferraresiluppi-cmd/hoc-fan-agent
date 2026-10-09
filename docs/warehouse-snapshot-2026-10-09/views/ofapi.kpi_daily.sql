WITH sl AS (
  SELECT s.*, r.project, r.owner, r.active, r.creator_id AS creator_id_forzato, r.valid_from, r.valid_to
  FROM `house-of-creators-358213.ofapi.smart_links` s
  LEFT JOIN `house-of-creators-358213.ofapi.registry` r
    ON r.workspace = s.workspace AND r.smart_link_id = s.smart_link_id
),
c AS (
  SELECT c.*, sl.project, sl.owner, sl.smart_link_name, sl.account_username,
         COALESCE(sl.creator_id_forzato, cr.id) AS creator_id, cr.name AS creator_name
  FROM `house-of-creators-358213.ofapi.conversions` c
  JOIN sl ON sl.workspace = c.workspace AND sl.smart_link_id = c.smart_link_id
  LEFT JOIN `house-of-creators-358213.postgres.public_creators` cr ON cr.platform_id = c.of_account_id
  WHERE IFNULL(sl.active, TRUE)
    AND NOT IFNULL(c.is_bot, FALSE) AND NOT IFNULL(c.is_duplicate, FALSE)
    AND c.conversion_date >= IFNULL(sl.valid_from, DATE '2000-01-01')
    AND c.conversion_date <  IFNULL(sl.valid_to,   DATE '2999-01-01')
)
SELECT
  conversion_date AS date_utc, workspace, project, owner,
  creator_id, COALESCE(creator_name, account_username) AS creator,
  smart_link_id, ANY_VALUE(smart_link_name) AS smart_link_name,
  campaign_id, adset_id, ad_id,
  COUNTIF(conversion_type = 'new_subscriber')                        AS subs,
  COUNT(DISTINCT IF(conversion_type='new_subscriber', fan_onlyfans_id, NULL)) AS fan_unici,
  COUNTIF(conversion_type = 'new_transaction')                       AS transazioni,
  ROUND(SUM(IF(conversion_type='new_transaction', amount_gross, 0)),2) AS revenue_lorda,
  ROUND(SUM(IF(conversion_type='new_transaction', amount_net,   0)),2) AS revenue_netta,
  COUNTIF(conversion_type = 'message_received')                      AS messaggi,
  COUNTIF(conversion_type = 'fan_sent_3_messages')                   AS fan_engaged
FROM c
GROUP BY date_utc, workspace, project, owner, creator_id, creator, smart_link_id, campaign_id, adset_id, ad_id