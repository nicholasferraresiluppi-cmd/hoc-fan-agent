WITH sl AS (
  SELECT
    s.workspace, s.smart_link_id, s.smart_link_name, s.account_username,
    COALESCE(r.creator_id, cr.id)          AS creator_id,
    COALESCE(cr.name, s.account_username)  AS creator,
    r.project, r.owner,
    IFNULL(r.active, TRUE)                 AS active,
    IFNULL(r.valid_from, DATE '2000-01-01') AS valid_from,
    IFNULL(r.valid_to,   DATE '2999-01-01') AS valid_to
  FROM `house-of-creators-358213.ofapi.smart_links` s
  LEFT JOIN `house-of-creators-358213.ofapi.registry` r
    ON r.workspace = s.workspace AND r.smart_link_id = s.smart_link_id
  LEFT JOIN `house-of-creators-358213.postgres.public_creators` cr
    ON cr.platform_id = s.of_account_id
),
-- Stessa policy di `kpi_daily`: fuori gli smart link non attivi e fuori dalla finestra di validità.
-- Bot e duplicati NON si filtrano qui: sulle conversioni arrivano sempre a zero, quindi il filtro
-- sarebbe un no-op che dà una falsa sensazione di pulizia. (Sui CLICK invece è popolato: vedi sotto.)
c AS (
  SELECT c.*
  FROM `house-of-creators-358213.ofapi.conversions` c
  JOIN sl ON sl.workspace = c.workspace AND sl.smart_link_id = c.smart_link_id
  WHERE sl.active
    AND c.conversion_date >= sl.valid_from
    AND c.conversion_date <  sl.valid_to
),
primo AS (
  SELECT workspace, smart_link_id, fan_onlyfans_id, MIN(conversion_at) AS sub_at
  FROM c
  WHERE conversion_type = 'new_subscriber' AND fan_onlyfans_id IS NOT NULL
  GROUP BY 1, 2, 3
),
-- La campagna dell'acquisizione è quella del PRIMO sub: se un fan si riscrive più avanti da un'altra
-- campagna, l'acquisto lo ha pagato la prima. ANY_VALUE perché nello stesso istante può esserci una
-- sola riga, ma non voglio che un doppione la faccia esplodere.
attr AS (
  SELECT
    p.workspace, p.smart_link_id, p.fan_onlyfans_id, p.sub_at,
    ANY_VALUE(x.campaign_id)  AS campaign_id,
    ANY_VALUE(x.adset_id)     AS adset_id,
    ANY_VALUE(x.ad_id)        AS ad_id,
    ANY_VALUE(x.country_code) AS country_code
  FROM primo p
  JOIN c x
    ON  x.workspace       = p.workspace
    AND x.smart_link_id   = p.smart_link_id
    AND x.fan_onlyfans_id = p.fan_onlyfans_id
    AND x.conversion_at   = p.sub_at
    AND x.conversion_type = 'new_subscriber'
  GROUP BY 1, 2, 3, 4
),
tx AS (
  SELECT
    workspace, smart_link_id, fan_onlyfans_id,
    COUNT(*)              AS transazioni,
    SUM(amount_net)       AS revenue_netta,
    SUM(amount_gross)     AS revenue_lorda,
    MIN(conversion_at)    AS primo_acquisto_at,
    MAX(conversion_at)    AS ultimo_acquisto_at
  FROM c
  WHERE conversion_type = 'new_transaction'
  GROUP BY 1, 2, 3
),
msg AS (
  SELECT DISTINCT workspace, smart_link_id, fan_onlyfans_id
  FROM c WHERE conversion_type = 'fan_sent_3_messages'
)
SELECT
  a.workspace, a.smart_link_id, sl.smart_link_name,
  sl.creator, sl.creator_id, sl.project, sl.owner,
  a.fan_onlyfans_id,
  DATE(a.sub_at) AS coorte,
  a.sub_at,
  a.campaign_id, a.adset_id, a.ad_id, a.country_code,
  IFNULL(t.transazioni, 0)                       AS transazioni,
  -- ⚠️ SEMPRE il netto: "Revenue (Net)" del pannello OnlyFansAPI è in realtà il LORDO, e la fee
  -- OnlyFans è il 20%. Confrontare il lordo con la spesa regala un quarto del ritorno.
  ROUND(IFNULL(t.revenue_netta, 0), 2)           AS revenue_netta,
  ROUND(IFNULL(t.revenue_lorda, 0), 2)           AS revenue_lorda,
  IFNULL(t.revenue_netta, 0) > 0                 AS spender,
  m.fan_onlyfans_id IS NOT NULL                  AS scrive,
  t.primo_acquisto_at,
  t.ultimo_acquisto_at,
  TIMESTAMP_DIFF(t.primo_acquisto_at, a.sub_at, HOUR) AS ore_al_primo_acquisto
FROM attr a
JOIN sl        ON sl.workspace = a.workspace AND sl.smart_link_id = a.smart_link_id
LEFT JOIN tx t ON  t.workspace = a.workspace AND t.smart_link_id = a.smart_link_id
               AND t.fan_onlyfans_id = a.fan_onlyfans_id
LEFT JOIN msg m ON m.workspace = a.workspace AND m.smart_link_id = a.smart_link_id
               AND m.fan_onlyfans_id = a.fan_onlyfans_id