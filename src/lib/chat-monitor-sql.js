// Laura Chat Monitor — query BigQuery. Ricostruzione di chat.hoc.tools (spento
// con lo split, ott 2026). Il sito originale leggeva le stesse tabelle da un
// Cloudflare Worker di cui non abbiamo il codice: qui le metriche sono
// RICOSTRUITE dalle definizioni mostrate in pagina (testi, tooltip e forma delle
// API catturati il 20 e 22/07/2026). Dove la definizione non era scritta, la
// scelta è dichiarata qui e nella sezione "Come si calcola" della pagina.
//
// Fonti:
//   - hoc.ws_chat: chat in tempo reale (stream, lag ~1s). Righe duplicate per id
//     (aggiornamenti del messaggio) → sempre GROUP BY id. Corpo OF grezzo: price,
//     mediaCount, isOpened, isFromQueue, text (HTML). user_data = profilo fan.
//   - onlyfans.chat: stessa chat consolidata (batch giornaliero, taglio 05:00 UTC).
//     Verificato 8/10: su un giorno intero coincide messaggio per messaggio con
//     ws_chat deduplicato; i mass NON sono dentro (né qui né in ws_chat).
//   - onlyfans.organic_subscriptions: iscrizioni (sub_type new_subscriber /
//     returning_subscriber), quasi in tempo reale.
//   - onlyfans.attributed_transactions (+ mass_transactions per DM vs mass):
//     transazioni, lag ~1-2 min.
//   - hoc.ws_messages: eventi websocket; "paided_message" = PPV sbloccato in tempo reale.
//   - onlyfans.cache_members: turni e takes per operatore (classifica chatter, presidio).
//
// Giorni e ore in Europe/Rome (come l'originale, che mostrava ore italiane).

// Account della creator scelta (live-creators.js): id dal nostro registro, mai input
// dell'utente → interpolarli nella query è sicuro (e sono comunque forzati a numero).
function ids(accounts) {
  const acc = accounts.map((a) => ({ id: Number(a.creator_id), country: String(a.country).replace(/[^A-Z]/g, "") }));
  return {
    IDS: `(${acc.map((a) => a.id).join(", ")})`,
    IDS_CTE: `ids AS (${acc.map((a) => `SELECT ${a.id} AS creator_id, '${a.country}' AS country`).join(" UNION ALL ")})`,
    FIRST: acc[0].id,
  };
}
const TODAY = "CURRENT_DATE('Europe/Rome')";
const TODAY_START = `TIMESTAMP(${TODAY}, 'Europe/Rome')`;
const SLA_CAP_S = 6 * 3600; // risposta oltre 6h = non risposta (come la replica di luglio)
const strip = (col) => `TRIM(REGEXP_REPLACE(REGEXP_REPLACE(${col}, r'<[^>]+>', ' '), r'\\s+', ' '))`;

// Messaggi deduplicati di ws_chat in una finestra (stringa SQL di condizione su created_at).
const wsMsgs = (p, cond, IDS) => `
  SELECT
    w.id,
    ANY_VALUE(w.creator_id) AS creator_id,
    ANY_VALUE(w.user_id) AS user_id,
    ANY_VALUE(w.sender_id) = ANY_VALUE(w.user_id) AS is_fan,
    MIN(w.created_at) AS ts,
    MAX(SAFE_CAST(JSON_VALUE(w.body, '$.price') AS FLOAT64)) AS price,
    MAX(SAFE_CAST(JSON_VALUE(w.body, '$.mediaCount') AS INT64)) AS media_count,
    LOGICAL_OR(JSON_VALUE(w.body, '$.isOpened') = 'true') AS opened,
    LOGICAL_OR(JSON_VALUE(w.body, '$.isFromQueue') = 'true') AS from_queue,
    ANY_VALUE(JSON_VALUE(w.body, '$.text')) AS text,
    ANY_VALUE(JSON_VALUE(w.user_data, '$.username')) AS username
  FROM \`${p}.hoc.ws_chat\` w
  WHERE w.creator_id IN ${IDS} AND ${cond}
  GROUP BY w.id`;

// ─── LIVE ────────────────────────────────────────────────────────────────────
// Base comune: messaggi delle ultime 7 giornate (consolidato fino a 30h fa +
// tempo reale dopo), iscrizioni di oggi, transazioni.
const liveBase = (p, IDS, IDS_CTE) => `
${IDS_CTE},
ws AS (${wsMsgs(p, `w.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 HOUR)`, IDS)}),
msgs AS (
  SELECT i.country, m.user_id, m.is_fan, m.ts, m.price, m.media_count, m.opened, m.text
  FROM ws m JOIN ids i USING (creator_id)
  WHERE NOT m.from_queue
  UNION ALL
  SELECT i.country, c.user_id, c.sender_id = c.user_id, c.created_at, CAST(c.price AS FLOAT64), NULL, NULL, c.text
  FROM \`${p}.onlyfans.chat\` c JOIN ids i USING (creator_id)
  WHERE c.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND c.created_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 HOUR)
),
subs_today AS (
  SELECT i.country, s.user_id, ANY_VALUE(s.username) AS username,
    IF(LOGICAL_OR(s.sub_type = 'new_subscriber'), 'new', 'returning') AS sub_kind,
    MIN(s.created_at) AS sub_at
  FROM \`${p}.onlyfans.organic_subscriptions\` s JOIN ids i USING (creator_id)
  WHERE s.created_at >= ${TODAY_START} AND s.sub_type IN ('new_subscriber', 'returning_subscriber')
  GROUP BY 1, 2
),
first_out AS (
  SELECT st.country, st.user_id, st.username, st.sub_kind, st.sub_at,
    ARRAY_AGG(STRUCT(m.ts, m.price, m.media_count) ORDER BY m.ts LIMIT 1)[SAFE_OFFSET(0)] AS fo
  FROM subs_today st
  LEFT JOIN msgs m ON m.country = st.country AND m.user_id = st.user_id AND NOT m.is_fan AND m.ts >= st.sub_at
  GROUP BY 1, 2, 3, 4, 5
)`;

export function liveTodaySQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${liveBase(p, IDS, IDS_CTE)},
today_msgs AS (SELECT * FROM msgs WHERE ts >= ${TODAY_START}),
seq AS (
  SELECT country, user_id, is_fan, ts,
    LAG(is_fan) OVER (PARTITION BY country, user_id ORDER BY ts) AS prev_is_fan,
    MIN(IF(NOT is_fan, ts, NULL)) OVER (PARTITION BY country, user_id ORDER BY ts ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_out
  FROM msgs
),
openers AS (
  SELECT country, TIMESTAMP_DIFF(next_out, ts, SECOND) AS frt
  FROM seq
  WHERE is_fan AND ts >= ${TODAY_START} AND (prev_is_fan IS NULL OR prev_is_fan = FALSE)
    AND next_out IS NOT NULL AND TIMESTAMP_DIFF(next_out, ts, SECOND) <= ${SLA_CAP_S}
),
last_per_fan AS (
  SELECT country, user_id,
    MAX(IF(is_fan, ts, NULL)) AS last_fan, MAX(IF(NOT is_fan, ts, NULL)) AS last_out
  FROM msgs GROUP BY 1, 2
),
wrote AS (
  SELECT t.country, t.user_id FROM today_msgs t WHERE t.is_fan GROUP BY 1, 2
),
agg_chat AS (
  SELECT country,
    COUNTIF(is_fan) AS msg_fan,
    COUNTIF(NOT is_fan) AS msg_chatter,
    COUNTIF(NOT is_fan AND price > 0) AS ppv_sent,
    COUNTIF(NOT is_fan AND price > 0 AND opened) AS ppv_opened_today
  FROM today_msgs GROUP BY 1
),
agg_wrote AS (
  SELECT w.country, COUNT(*) AS fans_wrote,
    COUNTIF(l.last_out IS NULL OR l.last_out < l.last_fan) AS no_reply
  FROM wrote w JOIN last_per_fan l USING (country, user_id)
  GROUP BY 1
),
agg_lat AS (
  SELECT country,
    APPROX_QUANTILES(frt, 100)[OFFSET(50)] AS lat_med_s,
    APPROX_QUANTILES(frt, 100)[OFFSET(90)] AS lat_p90_s
  FROM openers GROUP BY 1
),
agg_subs AS (
  SELECT country,
    COUNTIF(sub_kind = 'new') AS new_subs,
    COUNTIF(sub_kind = 'returning') AS ret_subs,
    COUNTIF(sub_kind = 'new' AND sub_at <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR)) AS new_ge2h,
    COUNTIF(sub_kind = 'new' AND sub_at <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR) AND fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR)) AS new_contacted_2h,
    COUNTIF(sub_kind = 'returning' AND sub_at <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR)) AS ret_ge2h,
    COUNTIF(sub_kind = 'returning' AND sub_at <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR) AND fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR)) AS ret_contacted_2h,
    COUNTIF(fo.ts IS NULL) AS welcome_pending,
    COUNTIF(sub_kind = 'new' AND fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR) AND fo.price > 0) AS welcome_ppv,
    COUNTIF(sub_kind = 'new' AND fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR) AND COALESCE(fo.price, 0) = 0 AND fo.media_count > 0) AS welcome_media,
    COUNTIF(sub_kind = 'new' AND fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR) AND COALESCE(fo.price, 0) = 0 AND COALESCE(fo.media_count, 0) = 0) AS welcome_text
  FROM first_out GROUP BY 1
),
unlocks_ws AS (
  SELECT i.country, COUNT(*) AS ppv_unlocked_ws,
    SUM(SAFE_CAST(REGEXP_EXTRACT(JSON_VALUE(e.body, '$.new_message.text'), r'\\$([0-9]+(?:\\.[0-9]+)?)') AS FLOAT64)) AS ppv_unlocked_value_ws
  FROM \`${p}.hoc.ws_messages\` e JOIN ids i USING (creator_id)
  WHERE e.created_at >= ${TODAY_START} AND JSON_VALUE(e.body, '$.new_message.type') = 'paided_message'
  GROUP BY 1
),
tx AS (
  SELECT i.country, t.user_id, t.type, CAST(t.net AS FLOAT64) AS net
  FROM \`${p}.onlyfans.attributed_transactions\` t JOIN ids i USING (creator_id)
  WHERE t.created_at >= ${TODAY_START}
),
agg_tx AS (
  SELECT country, SUM(net) AS revenue, COUNT(DISTINCT user_id) AS payers,
    COUNTIF(type = 'message') AS msg_tx, SUM(IF(type = 'message', net, 0)) AS msg_net,
    COUNTIF(type = 'tip') AS tip_tx, SUM(IF(type = 'tip', net, 0)) AS tip_net,
    COUNTIF(type NOT IN ('message', 'tip')) AS other_tx, SUM(IF(type NOT IN ('message', 'tip'), net, 0)) AS other_net
  FROM tx GROUP BY 1
)
SELECT i.country,
  COALESCE(s.new_subs, 0) AS new_subs, COALESCE(s.ret_subs, 0) AS ret_subs,
  COALESCE(s.new_ge2h, 0) AS new_ge2h, COALESCE(s.new_contacted_2h, 0) AS new_contacted_2h,
  COALESCE(s.ret_ge2h, 0) AS ret_ge2h, COALESCE(s.ret_contacted_2h, 0) AS ret_contacted_2h,
  COALESCE(s.welcome_pending, 0) AS welcome_pending,
  COALESCE(s.welcome_ppv, 0) AS welcome_ppv, COALESCE(s.welcome_media, 0) AS welcome_media, COALESCE(s.welcome_text, 0) AS welcome_text,
  COALESCE(w.fans_wrote, 0) AS fans_wrote, COALESCE(w.no_reply, 0) AS no_reply,
  l.lat_med_s, l.lat_p90_s,
  COALESCE(c.ppv_sent, 0) AS ppv_sent, COALESCE(c.ppv_opened_today, 0) AS ppv_opened_today,
  COALESCE(c.msg_chatter, 0) AS msg_chatter, COALESCE(c.msg_fan, 0) AS msg_fan,
  COALESCE(u.ppv_unlocked_ws, 0) AS ppv_unlocked_ws, COALESCE(u.ppv_unlocked_value_ws, 0) AS ppv_unlocked_value_ws,
  COALESCE(x.revenue, 0) AS revenue, COALESCE(x.payers, 0) AS payers,
  COALESCE(x.msg_tx, 0) AS msg_tx, COALESCE(x.msg_net, 0) AS msg_net,
  COALESCE(x.tip_tx, 0) AS tip_tx, COALESCE(x.tip_net, 0) AS tip_net,
  COALESCE(x.other_tx, 0) AS other_tx, COALESCE(x.other_net, 0) AS other_net
FROM ids i
LEFT JOIN agg_subs s USING (country)
LEFT JOIN agg_wrote w USING (country)
LEFT JOIN agg_lat l USING (country)
LEFT JOIN agg_chat c USING (country)
LEFT JOIN unlocks_ws u USING (country)
LEFT JOIN agg_tx x USING (country)
ORDER BY i.country`;
}

// Fan di oggi (hanno scritto o pagato oggi) + coda (ultimo messaggio dal fan,
// ultimi 7 giorni) + iscritti senza benvenuto + sblocchi di oggi.
export function liveListsSQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${liveBase(p, IDS, IDS_CTE)},
last_per_fan AS (
  SELECT country, user_id,
    MAX(IF(is_fan, ts, NULL)) AS last_fan, MAX(IF(NOT is_fan, ts, NULL)) AS last_out,
    ARRAY_AGG(IF(is_fan, ${strip("text")}, NULL) IGNORE NULLS ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS preview,
    COUNTIF(is_fan AND ts >= ${TODAY_START}) AS msg_fan_today
  FROM msgs GROUP BY 1, 2
),
names AS (
  SELECT i.country, w.user_id, ANY_VALUE(w.username) AS username
  FROM ws w JOIN ids i USING (creator_id) WHERE w.username IS NOT NULL GROUP BY 1, 2
),
tx_hoc AS (
  SELECT t.user_id, t.creator_id, CAST(t.net AS FLOAT64) AS net, t.created_at, t.type
  FROM \`${p}.onlyfans.attributed_transactions\` t
  WHERE t.calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 183 DAY)
    AND t.organization_id = (SELECT ANY_VALUE(organization_id) FROM \`${p}.onlyfans.attributed_transactions\` WHERE creator_id = ${FIRST} AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY))
),
spend AS (
  SELECT i.country, t.user_id,
    SUM(IF(t.created_at >= ${TODAY_START}, t.net, 0)) AS revenue_today,
    COUNTIF(t.created_at >= ${TODAY_START}) AS tx_today,
    SUM(IF(t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), t.net, 0)) AS ltv_7d,
    SUM(IF(t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), t.net, 0)) AS ltv_30d,
    SUM(IF(t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY), t.net, 0)) AS spent_60d,
    SUM(IF(t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 182 DAY), t.net, 0)) AS ltv_project
  FROM tx_hoc t JOIN ids i USING (creator_id)
  GROUP BY 1, 2
),
agency AS (
  SELECT user_id, SUM(net) AS ltv_agency FROM tx_hoc
  WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 182 DAY) GROUP BY 1
),
first_sub AS (
  SELECT i.country, s.user_id, MIN(s.calendar_date) AS sub_date, ANY_VALUE(s.username) AS username
  FROM \`${p}.onlyfans.organic_subscriptions\` s JOIN ids i USING (creator_id)
  GROUP BY 1, 2
),
fans_today AS (
  SELECT l.country, l.user_id FROM last_per_fan l WHERE l.msg_fan_today > 0
  UNION DISTINCT
  SELECT country, user_id FROM spend WHERE tx_today > 0
),
fans AS (
  SELECT 'fan' AS kind, f.country, f.user_id, COALESCE(n.username, fs.username) AS username,
    l.msg_fan_today > 0 AS wrote_today,
    l.last_fan IS NOT NULL AND (l.last_out IS NULL OR l.last_out < l.last_fan) AS unanswered,
    l.last_fan AS last_fan_at, l.last_out AS last_out_at,
    COALESCE(l.msg_fan_today, 0) AS msg_fan,
    COALESCE(sp.revenue_today, 0) AS revenue_today, COALESCE(sp.tx_today, 0) AS tx_today,
    COALESCE(sp.spent_60d, 0) AS spent_60d, COALESCE(sp.ltv_7d, 0) AS ltv_7d, COALESCE(sp.ltv_30d, 0) AS ltv_30d,
    COALESCE(sp.ltv_project, 0) AS ltv_project, COALESCE(a.ltv_agency, 0) AS ltv_agency,
    fs.sub_date, SUBSTR(l.preview, 1, 140) AS preview, CAST(NULL AS STRING) AS sub_kind, CAST(NULL AS TIMESTAMP) AS sub_at
  FROM fans_today f
  LEFT JOIN last_per_fan l USING (country, user_id)
  LEFT JOIN names n USING (country, user_id)
  LEFT JOIN spend sp USING (country, user_id)
  LEFT JOIN first_sub fs USING (country, user_id)
  LEFT JOIN agency a ON a.user_id = f.user_id
),
queue AS (
  SELECT 'queue' AS kind, l.country, l.user_id, COALESCE(n.username, fs.username) AS username,
    CAST(NULL AS BOOL), TRUE, l.last_fan, l.last_out, CAST(NULL AS INT64), CAST(NULL AS FLOAT64), CAST(NULL AS INT64),
    COALESCE(sp.spent_60d, 0), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), COALESCE(sp.ltv_project, 0), CAST(NULL AS FLOAT64), fs.sub_date, SUBSTR(l.preview, 1, 140), CAST(NULL AS STRING), CAST(NULL AS TIMESTAMP)
  FROM last_per_fan l
  LEFT JOIN names n USING (country, user_id)
  LEFT JOIN spend sp USING (country, user_id)
  LEFT JOIN first_sub fs USING (country, user_id)
  WHERE l.last_fan IS NOT NULL AND (l.last_out IS NULL OR l.last_out < l.last_fan)
),
pending AS (
  SELECT 'pending' AS kind, country, user_id, username,
    CAST(NULL AS BOOL), CAST(NULL AS BOOL), CAST(NULL AS TIMESTAMP), CAST(NULL AS TIMESTAMP), CAST(NULL AS INT64), CAST(NULL AS FLOAT64), CAST(NULL AS INT64), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS FLOAT64), CAST(NULL AS DATE), CAST(NULL AS STRING), sub_kind, sub_at
  FROM first_out WHERE fo.ts IS NULL
)
SELECT * FROM fans
UNION ALL SELECT * FROM queue
UNION ALL SELECT * FROM pending`;
}

export function liveUnlocksSQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${IDS_CTE}
SELECT i.country, t.user_id, t.created_at AS ts, CAST(t.net AS FLOAT64) AS net, m.id IS NOT NULL AS is_mass,
  (SELECT ANY_VALUE(s.username) FROM \`${p}.onlyfans.organic_subscriptions\` s WHERE s.creator_id = t.creator_id AND s.user_id = t.user_id) AS username
FROM \`${p}.onlyfans.attributed_transactions\` t
JOIN ids i USING (creator_id)
LEFT JOIN \`${p}.onlyfans.mass_transactions\` m ON m.id = t.id
WHERE t.created_at >= ${TODAY_START} AND t.type = 'message'
ORDER BY t.created_at DESC`;
}

export function boundarySQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
SELECT
  (SELECT MAX(created_at) FROM \`${p}.onlyfans.chat\` WHERE creator_id IN ${IDS} AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 DAY)) AS of_max,
  (SELECT MAX(created_at) FROM \`${p}.hoc.ws_chat\` WHERE creator_id IN ${IDS} AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)) AS ws_max,
  (SELECT MAX(created_at) FROM \`${p}.onlyfans.attributed_transactions\` WHERE creator_id IN ${IDS} AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)) AS tx_max,
  (SELECT MAX(created_at) FROM \`${p}.onlyfans.organic_subscriptions\` WHERE creator_id IN ${IDS} AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)) AS subs_max`;
}

// ─── DETTAGLIO GIORNALIERO ───────────────────────────────────────────────────
// Una sola lettura della chat (ws_chat deduplicato, ultimi DAILY_DAYS giorni):
// serve il corpo del messaggio per distinguere il benvenuto PPV / media / testo.
// Esce come righe {kind, country, d, payload JSON} per non leggere la chat due volte.
export const DAILY_DAYS = 37;

export function dailyChatSQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${IDS_CTE},
ws AS (${wsMsgs(p, `w.created_at >= TIMESTAMP(DATE_SUB(${TODAY}, INTERVAL ${DAILY_DAYS + 2} DAY), 'Europe/Rome')`, IDS)}),
msgs AS (
  SELECT i.country, m.user_id, m.is_fan, m.ts, COALESCE(m.price, 0) AS price, COALESCE(m.media_count, 0) AS media_count,
    DATE(m.ts, 'Europe/Rome') AS d, EXTRACT(HOUR FROM m.ts AT TIME ZONE 'Europe/Rome') AS hr,
    EXTRACT(DAYOFWEEK FROM DATETIME(m.ts, 'Europe/Rome')) AS dow
  FROM ws m JOIN ids i USING (creator_id)
  WHERE NOT m.from_queue
),
subs AS (
  SELECT i.country, s.user_id,
    IF(LOGICAL_OR(s.sub_type = 'new_subscriber'), 'new', 'returning') AS sub_kind,
    MIN(s.created_at) AS sub_at
  FROM \`${p}.onlyfans.organic_subscriptions\` s JOIN ids i USING (creator_id)
  WHERE s.created_at >= TIMESTAMP(DATE_SUB(${TODAY}, INTERVAL ${DAILY_DAYS} DAY), 'Europe/Rome')
    AND s.sub_type IN ('new_subscriber', 'returning_subscriber')
  GROUP BY 1, 2, DATE(s.created_at, 'Europe/Rome')
),
sub_events AS (
  SELECT s.country, s.user_id, s.sub_kind, s.sub_at, DATE(s.sub_at, 'Europe/Rome') AS d,
    ARRAY_AGG(IF(m.is_fan, NULL, STRUCT(m.ts, m.price, m.media_count)) IGNORE NULLS ORDER BY m.ts LIMIT 1)[SAFE_OFFSET(0)] AS fo,
    MIN(IF(m.is_fan, m.ts, NULL)) AS first_fan
  FROM subs s
  LEFT JOIN msgs m ON m.country = s.country AND m.user_id = s.user_id AND m.ts >= s.sub_at
  GROUP BY 1, 2, 3, 4, 5
),
daily AS (
  SELECT country, d, sub_kind AS sub_type, COUNT(*) AS subs,
    COUNTIF(fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR)) AS contacted_2h,
    APPROX_QUANTILES(IF(fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 24 HOUR), TIMESTAMP_DIFF(fo.ts, sub_at, SECOND) / 60, NULL), 100 IGNORE NULLS)[SAFE_OFFSET(50)] AS med_min_contact,
    COUNTIF(fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR) AND fo.price > 0) AS welcome_ppv,
    COUNTIF(fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR) AND fo.price = 0 AND fo.media_count > 0) AS welcome_media,
    COUNTIF(fo.ts <= TIMESTAMP_ADD(sub_at, INTERVAL 2 HOUR) AND fo.price = 0 AND fo.media_count = 0) AS welcome_text,
    COUNTIF(first_fan <= TIMESTAMP_ADD(sub_at, INTERVAL 24 HOUR)) AS wrote_24h,
    COUNTIF(first_fan <= TIMESTAMP_ADD(sub_at, INTERVAL 48 HOUR)) AS wrote_48h
  FROM sub_events GROUP BY 1, 2, 3
),
seq AS (
  SELECT m.*,
    LAG(is_fan) OVER w AS prev_is_fan,
    MIN(IF(NOT is_fan, ts, NULL)) OVER (PARTITION BY country, user_id ORDER BY ts ROWS BETWEEN 1 FOLLOWING AND UNBOUNDED FOLLOWING) AS next_out,
    MAX(IF(is_fan, ts, NULL)) OVER (PARTITION BY country, user_id ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_fan
  FROM msgs m
  WINDOW w AS (PARTITION BY country, user_id ORDER BY ts)
),
openers AS (
  SELECT country, d, hr, dow, TIMESTAMP_DIFF(next_out, ts, SECOND) AS frt
  FROM seq
  WHERE is_fan AND (prev_is_fan IS NULL OR prev_is_fan = FALSE)
    AND next_out IS NOT NULL AND TIMESTAMP_DIFF(next_out, ts, SECOND) <= ${SLA_CAP_S}
),
fan_day AS (
  SELECT country, d, user_id, MAX(ts) AS last_fan,
    ANY_VALUE(next_out HAVING MAX ts) AS reply_after_last
  FROM seq WHERE is_fan GROUP BY 1, 2, 3
),
latency AS (
  SELECT f.country, f.d, COUNT(*) AS fans_wrote,
    COUNTIF(f.reply_after_last IS NULL OR TIMESTAMP_DIFF(f.reply_after_last, f.last_fan, SECOND) > ${SLA_CAP_S}) AS no_reply,
    ANY_VALUE(o.lat_med) AS lat_med, ANY_VALUE(o.lat_p90) AS lat_p90
  FROM fan_day f
  LEFT JOIN (
    SELECT country, d, APPROX_QUANTILES(frt, 100)[OFFSET(50)] / 60 AS lat_med, APPROX_QUANTILES(frt, 100)[OFFSET(90)] / 60 AS lat_p90
    FROM openers GROUP BY 1, 2
  ) o USING (country, d)
  GROUP BY 1, 2
),
welcome_ts AS (SELECT country, user_id, fo.ts AS ts FROM sub_events WHERE fo.ts IS NOT NULL AND fo.price > 0),
ppv_rows AS (
  SELECT s.country, s.d, s.user_id, s.ts,
    w.ts IS NOT NULL AS is_welcome,
    s.prev_fan IS NOT NULL AND TIMESTAMP_DIFF(s.ts, s.prev_fan, HOUR) < 24 AS is_warm
  FROM seq s
  LEFT JOIN welcome_ts w ON w.country = s.country AND w.user_id = s.user_id AND w.ts = s.ts
  WHERE NOT s.is_fan AND s.price > 0
),
ppv AS (
  SELECT p.country, p.d, COUNT(*) AS ppv_sent,
    COUNTIF(is_welcome) AS ppv_welcome,
    COUNTIF(NOT is_welcome AND NOT is_warm) AS ppv_cold,
    COUNTIF(NOT is_welcome AND is_warm) AS ppv_warm,
    COUNT(DISTINCT IF(NOT is_welcome AND is_warm, p.user_id, NULL)) AS warm_users
  FROM ppv_rows p GROUP BY 1, 2
),
heat AS (
  SELECT country, dow, hr, COUNTIF(is_fan) AS fan_msgs, COUNT(DISTINCT d) AS n_days
  FROM msgs WHERE d >= DATE_SUB(${TODAY}, INTERVAL 21 DAY) AND d < ${TODAY}
  GROUP BY 1, 2, 3
),
heat_lat AS (
  SELECT country, dow, hr, APPROX_QUANTILES(frt, 100)[OFFSET(50)] / 60 AS lat_med
  FROM openers WHERE d >= DATE_SUB(${TODAY}, INTERVAL 21 DAY) AND d < ${TODAY}
  GROUP BY 1, 2, 3
)
SELECT 'daily' AS kind, country, CAST(d AS STRING) AS d, TO_JSON_STRING(t) AS payload FROM daily t
UNION ALL SELECT 'latency', country, CAST(d AS STRING), TO_JSON_STRING(t) FROM latency t
UNION ALL SELECT 'ppv', country, CAST(d AS STRING), TO_JSON_STRING(t) FROM ppv t
UNION ALL SELECT 'heat', h.country, NULL, TO_JSON_STRING(STRUCT(h.dow, h.hr, h.fan_msgs, h.n_days, l.lat_med))
  FROM heat h LEFT JOIN heat_lat l USING (country, dow, hr)`;
}

// Soldi e coorti: revenue per giorno, conversione a 7 giorni per coorte di
// iscrizione, coorti settimanali a 30 giorni (solo mature).
export function dailyMoneySQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${IDS_CTE},
tx AS (
  SELECT i.country, t.user_id, t.created_at, CAST(t.net AS FLOAT64) AS net, t.type
  FROM \`${p}.onlyfans.attributed_transactions\` t JOIN ids i USING (creator_id)
  WHERE t.calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 200 DAY)
),
rev AS (
  SELECT country, DATE(created_at, 'Europe/Rome') AS d, SUM(net) AS revenue, COUNT(DISTINCT user_id) AS payers
  FROM tx WHERE created_at >= TIMESTAMP(DATE_SUB(${TODAY}, INTERVAL ${DAILY_DAYS} DAY), 'Europe/Rome')
  GROUP BY 1, 2
),
new_subs AS (
  SELECT i.country, s.user_id, MIN(s.created_at) AS sub_at
  FROM \`${p}.onlyfans.organic_subscriptions\` s JOIN ids i USING (creator_id)
  WHERE s.sub_type = 'new_subscriber' AND s.created_at >= TIMESTAMP(DATE_SUB(${TODAY}, INTERVAL 190 DAY), 'Europe/Rome')
  GROUP BY 1, 2, DATE(s.created_at, 'Europe/Rome')
),
sub_spend AS (
  SELECT n.country, n.user_id, n.sub_at,
    SUM(IF(t.created_at < TIMESTAMP_ADD(n.sub_at, INTERVAL 7 DAY), t.net, 0)) AS rev7,
    SUM(IF(t.created_at < TIMESTAMP_ADD(n.sub_at, INTERVAL 30 DAY), t.net, 0)) AS rev30
  FROM new_subs n
  LEFT JOIN tx t ON t.country = n.country AND t.user_id = n.user_id
    AND t.created_at >= n.sub_at AND t.type NOT IN ('subscription', 'recurring_subscription')
  GROUP BY 1, 2, 3
),
conv7_d AS (
  SELECT country, DATE(sub_at, 'Europe/Rome') AS d, COUNT(*) AS subs, COUNTIF(rev7 > 0) AS conv7, SUM(rev7) AS rev7
  FROM sub_spend WHERE sub_at >= TIMESTAMP(DATE_SUB(${TODAY}, INTERVAL ${DAILY_DAYS} DAY), 'Europe/Rome')
  GROUP BY 1, 2
),
cohorts30 AS (
  SELECT country, DATE_TRUNC(DATE(sub_at, 'Europe/Rome'), WEEK(MONDAY)) AS wk,
    COUNT(*) AS subs, COUNTIF(rev30 > 0) AS conv30, SUM(rev30) AS rev30
  FROM sub_spend GROUP BY 1, 2
  HAVING DATE_ADD(wk, INTERVAL 37 DAY) <= ${TODAY}
)
SELECT 'revenue' AS kind, country, CAST(d AS STRING) AS d, TO_JSON_STRING(STRUCT(revenue, payers, SAFE_DIVIDE(revenue, payers) AS arppu)) AS payload FROM rev
UNION ALL SELECT 'conv7', c.country, CAST(c.d AS STRING), TO_JSON_STRING(STRUCT(c.subs, c.conv7 AS conv7, c.rev7)) FROM conv7_d c
UNION ALL SELECT 'cohort30', k.country, CAST(k.wk AS STRING), TO_JSON_STRING(STRUCT(k.subs, k.conv30, k.rev30, SAFE_DIVIDE(k.rev30, k.conv30) AS arppu30)) FROM cohorts30 k`;
}

// Classifica chatter (takes CreatorsPro) e presidio: persone in turno per ora.
export function chattersSQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${IDS_CTE},
shifts AS (
  SELECT i.country, c.member_id, c.member_name, c.started_at, c.ended_at, c.amount, c.transactions, c.users_converted
  FROM \`${p}.onlyfans.cache_members\` c JOIN ids i USING (creator_id)
  WHERE c.started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 31 DAY)
),
board AS (
  SELECT country, member_id, ANY_VALUE(member_name) AS member_name,
    SUM(IF(started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), amount, 0)) AS rev_7d,
    SUM(IF(started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), transactions, 0)) AS tx_7d,
    SUM(IF(started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), users_converted, 0)) AS buyers_7d,
    SUM(IF(started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), amount, 0)) AS rev_30d,
    SUM(IF(started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), transactions, 0)) AS tx_30d,
    SUM(IF(started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), users_converted, 0)) AS buyers_30d
  FROM shifts GROUP BY 1, 2
),
hours AS (
  SELECT s.country, s.member_id, h
  FROM shifts s, UNNEST(GENERATE_TIMESTAMP_ARRAY(TIMESTAMP_TRUNC(s.started_at, HOUR), TIMESTAMP_SUB(s.ended_at, INTERVAL 1 SECOND), INTERVAL 1 HOUR)) h
  WHERE s.ended_at > s.started_at AND TIMESTAMP_DIFF(s.ended_at, s.started_at, HOUR) <= 24
    AND h >= TIMESTAMP(DATE_SUB(${TODAY}, INTERVAL 21 DAY), 'Europe/Rome') AND h < ${TODAY_START}
),
staff AS (
  SELECT country, EXTRACT(DAYOFWEEK FROM DATETIME(h, 'Europe/Rome')) AS dow, EXTRACT(HOUR FROM h AT TIME ZONE 'Europe/Rome') AS hr,
    COUNT(DISTINCT CONCAT(member_id, '|', CAST(h AS STRING))) / 3 AS avg_staff
  FROM hours GROUP BY 1, 2, 3
)
SELECT 'chatter' AS kind, country, NULL AS d, TO_JSON_STRING(STRUCT(member_id, member_name, rev_7d, tx_7d, buyers_7d, rev_30d, tx_30d, buyers_30d, SAFE_DIVIDE(rev_30d, tx_30d) AS avg_ppv_30d)) AS payload
FROM board WHERE rev_30d > 0
UNION ALL SELECT 'staff', country, NULL, TO_JSON_STRING(STRUCT(dow, hr, avg_staff)) FROM staff`;
}

// ─── RIEPILOGO & TREND ───────────────────────────────────────────────────────
// Copia della vista hoc.laura_chat_monitor (dell'altro split, può sparire), generalizzata agli
// account della creator scelta:
// metriche settimanali da chat + transazioni, ultime 26 settimane.
export function weeklySQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${IDS_CTE},
chat_w AS (
  SELECT
    i.country,
    DATE_TRUNC(DATE(c.created_at), WEEK(MONDAY)) AS settimana,
    COUNT(DISTINCT IF(c.sender_id = c.user_id, c.user_id, NULL)) AS fan_attivi,
    COUNTIF(c.sender_id = c.user_id) AS msg_fan,
    COUNTIF(c.sender_id != c.user_id) AS msg_chatter,
    COUNTIF(c.sender_id != c.user_id AND c.price > 0) AS msg_chatter_priced,
    ROUND(COUNTIF(c.sender_id = c.user_id) / NULLIF(COUNTIF(c.sender_id != c.user_id), 0), 3) AS ratio_fan_chatter,
    ROUND(AVG(IF(c.sender_id = c.user_id, c.words, NULL)), 1) AS avg_parole_fan
  FROM \`${p}.onlyfans.chat\` c
  JOIN ids i ON c.creator_id = i.creator_id
  WHERE c.created_at >= TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 182 DAY))
  GROUP BY 1, 2
),
tx AS (
  SELECT
    atr.creator_id,
    DATE_TRUNC(atr.calendar_date, WEEK(MONDAY)) AS settimana,
    atr.type,
    CAST(atr.net AS FLOAT64) AS net,
    atr.user_id,
    CASE WHEN mt.id IS NOT NULL THEN 'mass' ELSE 'dm' END AS msg_kind
  FROM \`${p}.onlyfans.attributed_transactions\` atr
  LEFT JOIN \`${p}.onlyfans.mass_transactions\` mt ON atr.id = mt.id
  WHERE atr.creator_id IN ${IDS}
    AND atr.calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 182 DAY)
),
tx_w AS (
  SELECT
    i.country,
    tx.settimana,
    ROUND(SUM(tx.net), 2) AS revenue_tot,
    ROUND(SUM(IF(tx.type = 'message' AND tx.msg_kind = 'dm', tx.net, 0)), 2) AS revenue_dm,
    ROUND(SUM(IF(tx.type = 'message' AND tx.msg_kind = 'mass', tx.net, 0)), 2) AS revenue_mass,
    ROUND(SUM(IF(tx.type = 'tip', tx.net, 0)), 2) AS revenue_tip,
    COUNT(DISTINCT tx.user_id) AS paying_users
  FROM tx JOIN ids i ON tx.creator_id = i.creator_id
  GROUP BY 1, 2
)
SELECT
  c.country, CAST(c.settimana AS STRING) AS settimana,
  c.fan_attivi, c.msg_fan, c.msg_chatter, c.msg_chatter_priced, c.ratio_fan_chatter, c.avg_parole_fan,
  t.revenue_tot, t.revenue_dm, t.revenue_mass, t.revenue_tip, t.paying_users,
  ROUND(SAFE_DIVIDE(t.revenue_dm, c.msg_chatter_priced), 2) AS revenue_per_msg_chatter,
  ROUND(SAFE_DIVIDE(t.revenue_tot, c.fan_attivi), 2) AS revenue_per_fan_attivo,
  ROUND(SAFE_DIVIDE(t.revenue_mass, t.revenue_tot), 3) AS quota_mass,
  c.settimana >= DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)) AS settimana_parziale
FROM chat_w c
LEFT JOIN tx_w t ON c.country = t.country AND c.settimana = t.settimana
ORDER BY c.country, c.settimana`;
}

// Fasce di valore del fan (LTV sulla finestra mobile di 182 giorni, per account):
// quanto rende ogni fascia, per fonte (DM / mass / tip), totale e per settimana.
export const LTV_BUCKETS = ["$0–50", "$50–200", "$200–500", "$500–1k", "$1k–5k", "$5k+"];
export function ltvSQL(p, accounts) {
  const { IDS, IDS_CTE, FIRST } = ids(accounts);
  return `
WITH ${IDS_CTE},
tx AS (
  SELECT i.country, t.user_id, CAST(t.net AS FLOAT64) AS net, t.type,
    DATE_TRUNC(t.calendar_date, WEEK(MONDAY)) AS wk,
    CASE WHEN t.type = 'tip' THEN 'tip' WHEN t.type = 'message' AND m.id IS NOT NULL THEN 'mass' WHEN t.type = 'message' THEN 'dm' ELSE 'other' END AS src
  FROM \`${p}.onlyfans.attributed_transactions\` t JOIN ids i USING (creator_id)
  LEFT JOIN \`${p}.onlyfans.mass_transactions\` m ON m.id = t.id
  WHERE t.calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 182 DAY)
),
users AS (
  SELECT country, user_id, SUM(net) AS ltv,
    CASE WHEN SUM(net) < 50 THEN 0 WHEN SUM(net) < 200 THEN 1 WHEN SUM(net) < 500 THEN 2
         WHEN SUM(net) < 1000 THEN 3 WHEN SUM(net) < 5000 THEN 4 ELSE 5 END AS bucket
  FROM tx GROUP BY 1, 2
),
j AS (SELECT t.*, u.bucket FROM tx t JOIN users u USING (country, user_id))
SELECT 'ltv' AS kind, country, CAST(NULL AS STRING) AS wk, bucket,
  (SELECT COUNT(*) FROM users u WHERE u.country = j.country AND u.bucket = j.bucket) AS n_users,
  SUM(IF(src = 'dm', net, 0)) AS dm, SUM(IF(src = 'mass', net, 0)) AS mass, SUM(IF(src = 'tip', net, 0)) AS tip
FROM j GROUP BY country, bucket
UNION ALL
SELECT 'weekly', country, CAST(wk AS STRING), bucket, NULL,
  SUM(IF(src = 'dm', net, 0)), SUM(IF(src = 'mass', net, 0)), SUM(IF(src = 'tip', net, 0))
FROM j GROUP BY country, wk, bucket`;
}
