/**
 * SQL della retention dello split (16/10/2026) — puro, senza dipendenze dell'app:
 * testabile con node e lanciabile a mano. Razionale in retention-split.js.
 */
export const HOC_ORG = "5598597c-7fab-4fe1-acb3-5358df7d9dc5"; // = HOC_ORGANIZATION_ID di bigquery-api (default)
export const VALUE_FAN_USD = 500;     // fan di valore: ≥ 500 $ spesi negli ultimi 12 mesi
export const PAUSE_DAYS = [30, 120];  // in pausa: ultimo acquisto tra 30 e 120 giorni fa; oltre = perso
export const REPEAT_DAYS = 60;        // un fan nuovo «torna» se compra di nuovo entro 60 giorni

const ids = (list) => list.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);

/** Riepilogo per pagina (una riga per creator_id). Puro: testabile. */
export function summarySql(table, creatorIds, org = HOC_ORG) {
  const list = ids(creatorIds).join(",");
  return `
WITH tx AS (
  SELECT creator_id, user_id, calendar_date d, SUM(net) net
  FROM \`${table}\`
  WHERE creator_id IN (${list}) AND organization_id = '${org}' AND user_id IS NOT NULL
  GROUP BY 1, 2, 3
),
fan AS (
  SELECT creator_id, user_id, MIN(d) first_d, MAX(d) last_d,
    SUM(IF(d > DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY), net, 0)) r90,
    SUM(IF(d > DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY), net, 0)) r365
  FROM tx GROUP BY 1, 2
),
pause AS (
  SELECT f.creator_id, f.user_id, SUM(t.net) / 6 monthly
  FROM fan f JOIN tx t ON t.creator_id = f.creator_id AND t.user_id = f.user_id AND t.d > DATE_SUB(f.last_d, INTERVAL 180 DAY)
  WHERE f.r365 >= ${VALUE_FAN_USD} AND f.last_d <= DATE_SUB(CURRENT_DATE(), INTERVAL ${PAUSE_DAYS[0]} DAY) AND f.last_d > DATE_SUB(CURRENT_DATE(), INTERVAL ${PAUSE_DAYS[1]} DAY)
  GROUP BY 1, 2
),
second AS (
  SELECT f.creator_id, f.user_id, MIN(t.d) second_d
  FROM fan f JOIN tx t ON t.creator_id = f.creator_id AND t.user_id = f.user_id AND t.d > f.first_d
  GROUP BY 1, 2
),
ranked AS (
  SELECT f.*, s.second_d, p.monthly,
    ROW_NUMBER() OVER (PARTITION BY f.creator_id ORDER BY f.r90 DESC) rk,
    COUNTIF(f.r90 > 0) OVER (PARTITION BY f.creator_id) payers90
  FROM fan f LEFT JOIN second s USING (creator_id, user_id) LEFT JOIN pause p USING (creator_id, user_id)
)
SELECT creator_id,
  ROUND(SUM(r90), 2) rev90, COUNTIF(r90 > 0) payers90,
  ROUND(SUM(IF(rk <= 10 AND r90 > 0, r90, 0)), 2) top10,
  ROUND(SUM(IF(rk <= GREATEST(1, CAST(FLOOR(payers90 * 0.01) AS INT64)) AND r90 > 0, r90, 0)), 2) top1pct,
  COUNTIF(r365 >= ${VALUE_FAN_USD}) value_fans,
  COUNTIF(r365 >= ${VALUE_FAN_USD} AND last_d > DATE_SUB(CURRENT_DATE(), INTERVAL ${PAUSE_DAYS[0]} DAY)) value_active,
  COUNTIF(monthly IS NOT NULL) value_paused,
  ROUND(SUM(IFNULL(monthly, 0)), 2) paused_monthly,
  COUNTIF(r365 >= ${VALUE_FAN_USD} AND last_d <= DATE_SUB(CURRENT_DATE(), INTERVAL ${PAUSE_DAYS[1]} DAY)) value_lost,
  COUNTIF(first_d > DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)) new90,
  COUNTIF(first_d BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL ${REPEAT_DAYS} DAY)) new_ripe,
  COUNTIF(first_d BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL ${REPEAT_DAYS} DAY) AND second_d <= DATE_ADD(first_d, INTERVAL ${REPEAT_DAYS} DAY)) new_repeat
FROM ranked GROUP BY creator_id`;
}

/** Fan nuovi mese per mese (ultimi 12 mesi): quanti, quanto hanno speso al primo mese, quanti tornano entro 60 giorni. */
export function cohortSql(table, creatorIds, org = HOC_ORG) {
  const list = ids(creatorIds).join(",");
  return `
WITH tx AS (
  SELECT creator_id, user_id, calendar_date d, SUM(net) net
  FROM \`${table}\`
  WHERE creator_id IN (${list}) AND organization_id = '${org}' AND user_id IS NOT NULL
  GROUP BY 1, 2, 3
),
first AS (SELECT creator_id, user_id, MIN(d) first_d FROM tx GROUP BY 1, 2),
f AS (
  SELECT fi.creator_id, fi.user_id, fi.first_d,
    SUM(IF(t.d < DATE_ADD(fi.first_d, INTERVAL 30 DAY), t.net, 0)) spend30,
    COUNTIF(t.d > fi.first_d AND t.d <= DATE_ADD(fi.first_d, INTERVAL ${REPEAT_DAYS} DAY)) > 0 back
  FROM first fi JOIN tx t USING (creator_id, user_id)
  WHERE fi.first_d >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH), MONTH)
  GROUP BY 1, 2, 3
)
SELECT creator_id, FORMAT_DATE('%Y-%m', first_d) month, COUNT(*) fans, ROUND(SUM(spend30), 2) spend30,
  COUNTIF(back) back, MAX(first_d) <= DATE_SUB(CURRENT_DATE(), INTERVAL ${REPEAT_DAYS} DAY) ripe
FROM f GROUP BY 1, 2 ORDER BY 1, 2`;
}


/**
 * Fan di valore IN PAUSA di una pagina, nominati (16/10/2026, decisione di Nicholas:
 * la lista serve ai chatter per farli riprendere). Per ognuno: quanto spendeva al mese
 * prima di fermarsi, ultimo acquisto, ultimo messaggio del fan e nostro (onlyfans.chat,
 * D-1), stato dell'abbonamento all'ultimo messaggio visto (hoc.ws_chat.user_data).
 * `t` = { attributed, chat, users, wsChat } tabelle complete. ~7 GB a pagina (ws_chat).
 */
export function pausedFansSql(t, creatorId, org = HOC_ORG) {
  const cid = Number(creatorId);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error("creator_id non valido");
  return `
WITH tx AS (
  SELECT user_id, calendar_date d, SUM(net) net
  FROM \`${t.attributed}\`
  WHERE creator_id = ${cid} AND organization_id = '${org}' AND user_id IS NOT NULL
  GROUP BY 1, 2
),
fan AS (
  SELECT user_id, MAX(d) last_d, SUM(IF(d > DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY), net, 0)) r365, SUM(net) life
  FROM tx GROUP BY 1
),
paused AS (
  SELECT f.user_id, f.last_d, f.r365, f.life, SUM(t.net) / 6 monthly
  FROM fan f JOIN tx t ON t.user_id = f.user_id AND t.d > DATE_SUB(f.last_d, INTERVAL 180 DAY)
  WHERE f.r365 >= ${VALUE_FAN_USD} AND f.last_d <= DATE_SUB(CURRENT_DATE(), INTERVAL ${PAUSE_DAYS[0]} DAY) AND f.last_d > DATE_SUB(CURRENT_DATE(), INTERVAL ${PAUSE_DAYS[1]} DAY)
  GROUP BY 1, 2, 3, 4
),
msg AS (
  SELECT c.user_id, MAX(IF(c.sender_id = c.user_id, c.created_at, NULL)) fan_last, MAX(IF(c.sender_id != c.user_id, c.created_at, NULL)) our_last
  FROM \`${t.chat}\` c JOIN paused p USING (user_id)
  WHERE c.creator_id = ${cid} AND c.created_at > TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY))
  GROUP BY 1
),
sub AS (
  SELECT w.user_id, w.created_at seen_at, SAFE.BOOL(w.user_data.subscribedOn) sub_on, SAFE.BOOL(w.user_data.subscribedOnExpiredNow) expired
  FROM \`${t.wsChat}\` w JOIN paused p USING (user_id)
  WHERE w.creator_id = ${cid} AND w.created_at > TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)) AND w.user_data IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY w.user_id ORDER BY w.created_at DESC) = 1
)
SELECT p.user_id, u.name, u.username, FORMAT_DATE('%Y-%m-%d', p.last_d) last_buy, DATE_DIFF(CURRENT_DATE(), p.last_d, DAY) days,
  ROUND(p.r365, 2) r365, ROUND(p.monthly, 2) monthly, ROUND(p.life, 2) life,
  FORMAT_TIMESTAMP('%Y-%m-%d', m.fan_last) fan_last, FORMAT_TIMESTAMP('%Y-%m-%d', m.our_last) our_last,
  s.sub_on, s.expired, FORMAT_TIMESTAMP('%Y-%m-%d', s.seen_at) seen
FROM paused p
LEFT JOIN \`${t.users}\` u ON u.id = p.user_id
LEFT JOIN msg m USING (user_id) LEFT JOIN sub s USING (user_id)
ORDER BY p.monthly DESC`;
}

/** Fan di valore RIPRESI: ultimo acquisto negli ultimi 30 giorni dopo una pausa di almeno 30. Misura se la lista funziona. */
export function returnedFansSql(t, creatorId, org = HOC_ORG) {
  const cid = Number(creatorId);
  if (!Number.isInteger(cid) || cid <= 0) throw new Error("creator_id non valido");
  return `
WITH tx AS (
  SELECT user_id, calendar_date d, SUM(net) net FROM \`${t.attributed}\`
  WHERE creator_id = ${cid} AND organization_id = '${org}' AND user_id IS NOT NULL GROUP BY 1, 2
),
seq AS (SELECT user_id, d, net, LAG(d) OVER (PARTITION BY user_id ORDER BY d) prev_d FROM tx),
back AS (
  SELECT user_id, MIN(d) back_d FROM seq
  WHERE d > DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND prev_d <= DATE_SUB(d, INTERVAL ${PAUSE_DAYS[0]} DAY)
  GROUP BY 1
),
val AS (SELECT user_id, SUM(IF(d > DATE_SUB(CURRENT_DATE(), INTERVAL 395 DAY) AND d <= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), net, 0)) r365_before FROM tx GROUP BY 1)
SELECT COUNT(*) fans, ROUND(SUM((SELECT SUM(t.net) FROM tx t WHERE t.user_id = b.user_id AND t.d >= b.back_d)), 2) spent_since
FROM back b JOIN val v USING (user_id) WHERE v.r365_before >= ${VALUE_FAN_USD}`;
}
