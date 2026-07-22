-- ============================================================================
-- HOC Pro · Conversation Intelligence · TIER 1 (METADATA-ONLY)
-- Fonte: `house-of-creators-358213.hoc.ws_chat`  (europe-west3 / EU)
-- Grana: creator_id × giorno operativo (Europe/Rome).
--        Output = ultimi 7 giorni. Scan = 8 giorni (1 giorno di WARM-UP per dare
--        contesto alle window function → niente left-censoring sul giorno più vecchio).
-- NON legge body / user_data. Referenzia SOLO 6 colonne scalari:
--        id, creator_id, user_id, sender_id, created_at, commit_timestamp.
-- ⚠️  SCOPE TENANT: `ws_chat` è MULTI-TENANT (contiene creator di altre agenzie
--        clienti di CreatorsPro) e NON ha organization_id. Lo scope all'org di HOC
--        è iniettato A RUNTIME da src/lib/conversation-intelligence.js
--        (scopedCITier1SQL → filtro via onlyfans.reach, prima della QUALIFY).
--        Questa .sql, eseguita GREZZA in console, include TUTTE le agenzie: per
--        HOC-only aggiungere `AND creator_id IN (SELECT creator_id FROM
--        onlyfans.reach WHERE organization_id = '<HOC>')` alla WHERE della CTE base.
-- Attribuzione al SINGOLO OPERATORE = FUORI SCOPE: sender_id lato-creator è
--        l'ACCOUNT, non l'umano. Il join sul turno si fa a valle in HOC Pro.
--
-- PRIMA DI ESEGUIRE (query gratuita, 0 byte — NON parte di questo job):
--   SELECT column_name, is_partitioning_column, clustering_ordinal_position
--   FROM `house-of-creators-358213.hoc`.INFORMATION_SCHEMA.COLUMNS
--   WHERE table_name = 'ws_chat';
--   Poi leggi in console "This query will process X" e conferma X << 2 GiB.
--   Il guard su commit_timestamp qui sotto è SEMPRE ATTIVO: pota la partizione
--   sia che la colonna-partizione sia created_at, sia che sia commit_timestamp
--   (commit_timestamp >= created_at sempre → non esclude MAI una riga valida).
-- ============================================================================

DECLARE sla_cap_seconds     INT64     DEFAULT 6 * 3600;    -- KNOB · orizzonte SLA UNICO (right-censor + cap risposta). Editando QUI si aggiornano tutte le metriche coverage/latency insieme.
DECLARE sla_fast_seconds    INT64     DEFAULT 5 * 60;      -- KNOB · banda SLA "veloce"
DECLARE sla_slow_seconds    INT64     DEFAULT 15 * 60;     -- KNOB · banda SLA "lenta"
DECLARE broadcast_min_recip INT64     DEFAULT 5;           -- KNOB · fan-out (destinatari DISTINTI / mittente / secondo) oltre il quale è mass-DM. Da CALIBRARE sulla distribuzione reale.
DECLARE report_start_ts     TIMESTAMP DEFAULT TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY);  -- floor di OUTPUT (il giorno di warm-up viene scartato)

WITH base AS (
  SELECT
    id, creator_id, user_id, sender_id, created_at,
    TIMESTAMP_TRUNC(created_at, SECOND)                AS sec_bucket,
    DATE(created_at, 'Europe/Rome')                    AS day,             -- KNOB TZ: DEVE combaciare col roster-turni a valle
    (sender_id =  user_id)                             AS is_fan,          -- messaggio del FAN
    (sender_id <> user_id)                             AS is_creatorside,  -- "lato-creator" (definizione del brief) = definizione UNICA usata da reply + talk-ratio
    (sender_id =  creator_id)                          AS is_account,      -- DQ: quota che è l'account principale
    (sender_id <> user_id AND sender_id <> creator_id) AS is_other_side    -- DQ: co-seller / system / terzi (sottoinsieme di is_creatorside)
  FROM `house-of-creators-358213.hoc.ws_chat`
  WHERE created_at       >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 8 DAY)  -- 7d output + 1d warm-up; colonna GREZZA vs costante → pruning
    AND created_at       <  CURRENT_TIMESTAMP()
    AND commit_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 9 DAY)  -- GUARD PARTIZIONE sempre attivo (safe: commit>=created ⇒ non esclude nulla)
    AND creator_id IS NOT NULL                                                  -- reso esplicito (evita drop silenzioso via creator_id<>user_id)
    AND user_id    IS NOT NULL
    AND sender_id  IS NOT NULL
    AND creator_id <> user_id                                                   -- scarta conversazioni degeneri account-con-sé
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY commit_timestamp DESC) = 1  -- dedup re-ingest at-least-once
),

-- Broadcast/mass-DM (solo-metadati), passo 1/2: numera le occorrenze di ogni FAN
-- dentro il bucket-secondo del mittente. rn=1 marca la PRIMA occorrenza di quel fan.
bucketed AS (
  SELECT
    creator_id, sender_id, user_id, created_at, id, day, sec_bucket,
    is_fan, is_creatorside, is_account, is_other_side,
    ROW_NUMBER() OVER (
      PARTITION BY creator_id, sender_id, sec_bucket, user_id
      ORDER BY created_at, id
    ) AS rn_user_in_bucket
  FROM base
),

-- Broadcast passo 2/2: destinatari DISTINTI nel bucket-secondo.
-- COUNT(DISTINCT ..) OVER è ILLEGALE in BigQuery → SUM del "primo-di-ciascun-fan"
-- sulla partizione = numero di fan distinti. Rileva il broadcast su una FINESTRA
-- (secondo), non sull'uguaglianza esatta di timestamp, e conta DESTINATARI non messaggi:
-- il double-texting allo stesso fan resta distinct=1 (personale), non broadcast.
flagged AS (
  SELECT
    creator_id, user_id, created_at, id, day,
    is_fan, is_creatorside, is_account, is_other_side,
    SUM(IF(rn_user_in_bucket = 1, 1, 0)) OVER (
      PARTITION BY creator_id, sender_id, sec_bucket
    ) AS distinct_recipients
  FROM bucketed
),

tagged AS (
  SELECT
    creator_id, user_id, created_at, id, day,
    is_fan, is_creatorside, is_account, is_other_side,
    (is_creatorside AND distinct_recipients >= broadcast_min_recip) AS is_broadcast,
    -- UNITÀ REPLY/TURNO UNIFICATA: lato-creator del brief (broad) MENO broadcast.
    -- Reply-detector e talk-ratio ora condividono ESATTAMENTE questa definizione
    -- (co-seller/relay non-broadcast INCLUSI in entrambi; niente più asimmetria strict/broad).
    (is_creatorside AND distinct_recipients <  broadcast_min_recip) AS is_personal_reply
  FROM flagged
),

windowed AS (
  SELECT
    creator_id, user_id, created_at, id, day,
    is_fan, is_creatorside, is_account, is_other_side, is_broadcast, is_personal_reply,
    -- Ultimo lato CONVERSAZIONALE visto prima di questa riga (broadcast/other-side saltati by design):
    MAX(IF(is_fan, created_at, NULL)) OVER (
      PARTITION BY creator_id, user_id ORDER BY created_at, id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)                 AS prev_fan_ts,
    MAX(IF(is_personal_reply, created_at, NULL)) OVER (
      PARTITION BY creator_id, user_id ORDER BY created_at, id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)                 AS prev_chat_ts,
    -- Prima risposta PERSONALE del lato-creator dopo questa riga (broadcast esclusi):
    MIN(IF(is_personal_reply, created_at, NULL)) OVER (
      PARTITION BY creator_id, user_id ORDER BY created_at, id
      ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING)                 AS next_reply_ts
  FROM tagged
),

scored AS (
  SELECT
    creator_id, user_id, created_at, day,
    is_fan, is_creatorside, is_account, is_other_side, is_broadcast, is_personal_reply,
    next_reply_ts,
    TIMESTAMP_DIFF(next_reply_ts, created_at, SECOND) AS frt_seconds,
    CASE WHEN is_fan THEN 'fan' WHEN is_personal_reply THEN 'chatter' ELSE NULL END AS cur_side,
    CASE
      WHEN prev_fan_ts IS NULL AND prev_chat_ts IS NULL THEN 'none'
      WHEN prev_chat_ts IS NULL THEN 'fan'
      WHEN prev_fan_ts  IS NULL THEN 'chatter'
      WHEN prev_chat_ts > prev_fan_ts THEN 'chatter'
      ELSE 'fan'
    END AS prev_side
  FROM windowed
),

labeled AS (
  SELECT
    creator_id, user_id, day,
    is_fan, is_creatorside, is_account, is_other_side, is_broadcast, is_personal_reply,
    next_reply_ts, frt_seconds,
    -- inversione di lato conversazionale (turni alternati)
    (cur_side IS NOT NULL AND prev_side IN ('fan','chatter') AND prev_side <> cur_side) AS is_turn_switch,
    -- opener valutabile: 1° msg del fan-turno (lato precedente = chatter o inizio) E finestra SLA GIÀ scaduta (right-censor).
    -- Il warm-up di 1 giorno (scan a 8gg, output a 7gg) evita che il giorno più vecchio conti openers falsi per left-censoring.
    (is_fan
      AND prev_side IN ('chatter','none')
      AND created_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL sla_cap_seconds SECOND)) AS is_eval_opener
  FROM scored
)

SELECT
  creator_id,
  day,
  (day = DATE(CURRENT_TIMESTAMP(), 'Europe/Rome')) AS is_partial_day,   -- ultimo giorno: opener/SLA/latency PROVVISORIE (right-censored)

  -- ---- VOLUME (invariante: messages = fan_msgs + creatorside_msgs) ----
  COUNT(*)                                    AS messages,
  COUNTIF(is_fan)                             AS fan_msgs,
  COUNTIF(is_creatorside)                     AS creatorside_msgs,
  COUNTIF(is_personal_reply)                  AS creatorside_personal_msgs,   -- broadcast esclusi
  COUNTIF(is_creatorside AND is_broadcast)    AS broadcast_msgs,              -- mass-DM stimati (invariante: personal+broadcast = creatorside_msgs)
  COUNTIF(is_account)                         AS account_side_msgs,          -- DQ
  COUNTIF(is_other_side)                      AS other_side_msgs,            -- DQ GATE: se >> 0 ispeziona quei sender_id prima di fidarti di reply/talk-ratio
  COUNT(DISTINCT user_id)                     AS active_conversations,       -- fan distinti = grana conversazione

  -- ---- TALK RATIO (personale, broadcast escluso; leggere IN BANDA, non "più basso = meglio") ----
  ROUND(SAFE_DIVIDE(COUNTIF(is_personal_reply),
        NULLIF(COUNTIF(is_fan) + COUNTIF(is_personal_reply), 0)), 4) AS chatter_msg_share,
  ROUND(SAFE_DIVIDE(COUNTIF(is_personal_reply),
        NULLIF(COUNTIF(is_fan), 0)), 4)                              AS chatter_to_fan_ratio,

  -- ---- INTERACTIVITY (ping-pong vs monologo) ----
  COUNTIF(is_turn_switch)                                          AS turn_switches,
  ROUND(SAFE_DIVIDE(COUNTIF(is_turn_switch),
        NULLIF(COUNTIF(is_fan) + COUNTIF(is_personal_reply), 0)), 4) AS alternation_ratio,

  -- ---- RESPONSE COVERAGE (denominatore = opener valutabili; invariante: answered+unanswered = fan_openers) ----
  COUNTIF(is_eval_opener)                                                                    AS fan_openers,
  COUNTIF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds <= sla_cap_seconds)   AS answered_openers,
  COUNTIF(is_eval_opener AND (next_reply_ts IS NULL OR frt_seconds > sla_cap_seconds))       AS unanswered_openers,
  ROUND(SAFE_DIVIDE(
    COUNTIF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds <= sla_cap_seconds),
    NULLIF(COUNTIF(is_eval_opener), 0)), 4)                                                  AS response_rate,
  COUNTIF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds = 0)                  AS frt_zero_replies,  -- DQ: tie di timestamp / precisione al secondo (risposte "istantanee" sospette)

  -- ---- FIRST-RESPONSE LATENCY (solo opener valutabili E risposti entro cap; NULL esclusi) ----
  APPROX_QUANTILES(
    IF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds <= sla_cap_seconds, frt_seconds, NULL),
    100 IGNORE NULLS)[OFFSET(50)]                                                            AS frt_p50_sec,
  APPROX_QUANTILES(
    IF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds <= sla_cap_seconds, frt_seconds, NULL),
    100 IGNORE NULLS)[OFFSET(90)]                                                            AS frt_p90_sec,

  -- ---- SLA ATTAINMENT (denominatore = TUTTI gli opener valutabili; non-risposti = breach) ----
  ROUND(SAFE_DIVIDE(COUNTIF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds <= sla_fast_seconds),
        NULLIF(COUNTIF(is_eval_opener), 0)), 4) AS pct_within_5min,
  ROUND(SAFE_DIVIDE(COUNTIF(is_eval_opener AND next_reply_ts IS NOT NULL AND frt_seconds <= sla_slow_seconds),
        NULLIF(COUNTIF(is_eval_opener), 0)), 4) AS pct_within_15min
FROM labeled
WHERE day >= DATE(report_start_ts, 'Europe/Rome')   -- il warm-up (giorno più vecchio) ha già dato contesto alle window → escluso dall'output
GROUP BY creator_id, day
ORDER BY creator_id, day;

-- ============================================================================
-- DRILL PER CONVERSAZIONE (worklist coaching, GATED, resta metadata-only).
-- Sostituisci la SELECT finale con GROUP BY creator_id, user_id e:
--   HAVING COUNTIF(is_eval_opener) >= 3      -- min-N (filosofia MIN_SHIFTS_RELIABLE): ratio su 1-2 openers = rumore
--   ORDER BY unanswered_openers DESC, frt_p90_sec DESC
-- Non joinare MAI user_id a campi identificanti di user_data in questo tier.
-- ============================================================================