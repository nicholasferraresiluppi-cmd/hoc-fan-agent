/**
 * Prova fedeltà (16/10/2026) — SQL puro, senza dipendenze dell'app: testabile con node.
 * Razionale e regole in lib/prova-fedelta-core.js; studio nel doc condiviso
 * «Come nascono i fan che spendono».
 *
 * Una riga per fan NUOVO della pagina (primo abbonamento dalla data di avvio) che è
 * entrato nella prova: «caldo» (≥ 15 messaggi nelle prime 48 ore) oppure «segnalato»
 * (≥ 100 $ e acquisti in ≥ 2 giorni diversi nella prima settimana).
 * Chat da hoc.ws_chat (tempo reale, dedup per id), acquisti da attributed_transactions
 * (CDC ~2 minuti), filtrati sull'organizzazione HOC (il warehouse è multi-agenzia).
 */
export const HOC_ORG = "5598597c-7fab-4fe1-acb3-5358df7d9dc5";
export const HOT_MSGS_48H = 15;      // fan caldo
export const FLAG_SPEND_7D = 100;    // segnalato: almeno 100 $ nella prima settimana…
export const FLAG_BUY_DAYS_7D = 2;   // …comprando in almeno 2 giorni diversi
export const MASS_SAME_HOUR = 20;    // stesso testo ≥ 20 volte nella stessa ora = invio di massa

const lit = (iso) => `TIMESTAMP('${new Date(iso).toISOString()}')`;

/** `t` = { wsChat, attributed, subs } tabelle complete; `start` = ISO della data di avvio. */
export function provaFansSql(t, creatorId, start, org = HOC_ORG) {
  const cid = Number(creatorId);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error("creator_id non valido");
  if (Number.isNaN(Date.parse(start))) throw new Error("data di avvio non valida");
  const S = lit(start);
  return `
WITH subs AS (
  SELECT user_id, MIN(started_at) s0
  FROM \`${t.subs}\`
  WHERE creator_id = ${cid} AND organization_id = '${org}' AND user_id IS NOT NULL
  GROUP BY 1
),
w AS (
  SELECT user_id, created_at, sender_id = user_id AS from_fan,
    COALESCE(SAFE_CAST(JSON_VALUE(body, '$.price') AS FLOAT64), 0) AS price,
    COALESCE(JSON_VALUE(body, '$.isFromQueue'), 'false') = 'true' AS queued,
    LOWER(TRIM(REGEXP_REPLACE(COALESCE(JSON_VALUE(body, '$.text'), ''), r'<[^>]+>', ' '))) AS txt,
    user_data
  FROM \`${t.wsChat}\`
  WHERE creator_id = ${cid} AND created_at >= TIMESTAMP_SUB(${S}, INTERVAL 1 DAY)
    AND commit_timestamp >= TIMESTAMP_SUB(${S}, INTERVAL 1 DAY)
    AND user_id IS NOT NULL AND user_id <> ${cid}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY commit_timestamp DESC) = 1
),
wm AS (
  SELECT *, NOT from_fan AND (queued OR (LENGTH(txt) > 0 AND COUNT(*) OVER (PARTITION BY TIMESTAMP_TRUNC(created_at, HOUR), from_fan, txt) >= ${MASS_SAME_HOUR})) AS mass
  FROM w
),
first_seen AS (SELECT user_id, MIN(created_at) first_ws FROM wm GROUP BY 1),
new_fans AS (
  SELECT f.user_id, LEAST(COALESCE(s.s0, f.first_ws), f.first_ws) t0
  FROM first_seen f LEFT JOIN subs s USING (user_id)
  WHERE COALESCE(s.s0, f.first_ws) >= ${S}
),
tx AS (
  SELECT user_id, created_at, CAST(net AS FLOAT64) net, type
  FROM \`${t.attributed}\`
  WHERE creator_id = ${cid} AND organization_id = '${org}' AND id IS NOT NULL AND user_id IS NOT NULL
    AND created_at >= TIMESTAMP_SUB(${S}, INTERVAL 400 DAY)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
),
paid_before AS (SELECT DISTINCT tx.user_id FROM tx JOIN new_fans n USING (user_id) WHERE tx.created_at < TIMESTAMP_SUB(n.t0, INTERVAL 1 DAY)),
chat AS (
  SELECT n.user_id,
    COUNTIF(wm.from_fan AND wm.created_at < TIMESTAMP_ADD(n.t0, INTERVAL 48 HOUR)) fan48,
    COUNTIF(wm.from_fan) fan_all,
    MAX(IF(wm.from_fan, wm.created_at, NULL)) fan_last,
    MAX(IF(NOT wm.from_fan AND NOT wm.mass, wm.created_at, NULL)) our_last,
    MAX(IF(NOT wm.from_fan AND NOT wm.mass AND wm.price = 0, wm.created_at, NULL)) our_free_last,
    COUNTIF(NOT wm.from_fan AND NOT wm.mass AND wm.price > 0 AND wm.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) ppv24,
    ARRAY_AGG(wm.user_data IGNORE NULLS ORDER BY wm.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] ud
  FROM new_fans n JOIN wm USING (user_id)
  GROUP BY 1
),
buys AS (
  SELECT n.user_id,
    SUM(IF(tx.created_at < TIMESTAMP_ADD(n.t0, INTERVAL 7 DAY), tx.net, 0)) sp7,
    COUNT(DISTINCT IF(tx.created_at < TIMESTAMP_ADD(n.t0, INTERVAL 7 DAY) AND tx.net > 0, DATE(tx.created_at), NULL)) bd7,
    COUNT(DISTINCT IF(tx.created_at >= TIMESTAMP_ADD(n.t0, INTERVAL 24 HOUR) AND tx.net > 0, DATE(tx.created_at), NULL)) buy_days_after_d1,
    SUM(IF(tx.created_at >= TIMESTAMP_ADD(n.t0, INTERVAL 7 DAY) AND tx.created_at < TIMESTAMP_ADD(n.t0, INTERVAL 30 DAY), tx.net, 0)) sp8_30,
    SUM(IF(tx.created_at >= TIMESTAMP_ADD(n.t0, INTERVAL 7 DAY) AND tx.created_at < TIMESTAMP_ADD(n.t0, INTERVAL 60 DAY), tx.net, 0)) sp8_60,
    SUM(IF(tx.created_at < TIMESTAMP_ADD(n.t0, INTERVAL 60 DAY), tx.net, 0)) sp60,
    SUM(tx.net) sp_all,
    COUNTIF(tx.net > 0 AND tx.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)) buys24,
    MAX(IF(tx.net > 0, tx.created_at, NULL)) last_buy
  FROM new_fans n JOIN tx ON tx.user_id = n.user_id AND tx.created_at >= TIMESTAMP_SUB(n.t0, INTERVAL 1 DAY)
  GROUP BY 1
)
SELECT n.user_id, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', n.t0) t0,
  JSON_VALUE(c.ud, '$.name') name, JSON_VALUE(c.ud, '$.username') username,
  SAFE.BOOL(c.ud.subscribedOn) sub_on, SAFE.BOOL(c.ud.subscribedOnExpiredNow) expired,
  IFNULL(c.fan48, 0) fan48, IFNULL(c.fan_all, 0) fan_all,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', c.fan_last) fan_last,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', c.our_last) our_last,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', c.our_free_last) our_free_last,
  IFNULL(c.ppv24, 0) ppv24,
  ROUND(IFNULL(b.sp7, 0), 2) sp7, IFNULL(b.bd7, 0) bd7, IFNULL(b.buy_days_after_d1, 0) buy_days_after_d1,
  ROUND(IFNULL(b.sp8_30, 0), 2) sp8_30, ROUND(IFNULL(b.sp8_60, 0), 2) sp8_60, ROUND(IFNULL(b.sp60, 0), 2) sp60,
  ROUND(IFNULL(b.sp_all, 0), 2) sp_all, IFNULL(b.buys24, 0) buys24,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', b.last_buy) last_buy
FROM new_fans n
LEFT JOIN chat c USING (user_id) LEFT JOIN buys b USING (user_id)
WHERE n.user_id NOT IN (SELECT user_id FROM paid_before)
  AND (IFNULL(c.fan48, 0) >= ${HOT_MSGS_48H} OR (IFNULL(b.sp7, 0) >= ${FLAG_SPEND_7D} AND IFNULL(b.bd7, 0) >= ${FLAG_BUY_DAYS_7D}))
ORDER BY n.t0`;
}
