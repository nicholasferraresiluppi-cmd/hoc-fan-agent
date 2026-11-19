// Andamento per ora (19/11/2026) — le query del warehouse. Funzioni pure: costruiscono l'SQL, non lo lanciano.
//
// Domanda d'origine (board, 19/11): «dove si può vedere l'andamento per orari complessivi su OF?». Prima c'era
// solo un grafico orario dentro il Report Looker (in ora UTC) e la mappa di una creator alla volta nel Chat
// monitor. Qui: tutte le pagine dello split insieme (o una persona), in ORA ITALIANA.
//
// FONTI (verificate sul warehouse il 19/11/2026, org HOC, 30 giorni):
//  - incasso = onlyfans.attributed_transactions (CDC, ritardo 1-2 minuti → anche «oggi»). Copre tutto
//    l'incasso OF: $1,79M contro $1,76M del totale giornaliero transactions_analytics (la differenza è oggi).
//    Tipi: message (chat e massivi), tip, post, subscription, recurring_subscription.
//  - massivi = onlyfans.mass_transactions: è un SOTTOINSIEME dei `message` (stesso id, 22.797 su 22.797):
//    serve solo a dividere i messaggi in chat 1:1 e massivi, mai da sommare.
//  - nuovi abbonati = onlyfans.organic_subscriptions (sub_type new_subscriber).
//  - messaggi = onlyfans.chat (copia giornaliera, taglio alle 05:00 UTC → arriva fino a ieri): fan = sender_id
//    uguale a user_id, pagina = il resto, PPV mandati = messaggi della pagina con prezzo.
//  - operatori in turno = onlyfans.cache_members (turni CreatorsPro, ruoli chatter): ore-persona distinte, così
//    chi copre due pagine nella stessa ora conta una volta.
// Ogni tabella filtrata per organization_id (il warehouse serve più agenzie e la stessa pagina può stare in due).
// Le transazioni CDC hanno qualche riga doppia (11 su 67k): si tiene l'ultima versione di ogni id.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TZ = "Europe/Rome";

export function idList(ids) {
  const clean = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) throw new Error("nessuna creator");
  return clean.join(",");
}
const day = (s) => {
  if (!DAY_RE.test(String(s))) throw new Error("data non valida");
  return `DATE '${s}'`;
};
const org = (s) => {
  if (!/^[0-9a-f-]{36}$/.test(String(s))) throw new Error("organizzazione non valida");
  return `'${s}'`;
};
// inizio del giorno italiano come TIMESTAMP (gestisce l'ora legale)
const romeStart = (s) => `TIMESTAMP(${day(s)}, '${TZ}')`;
const romeEnd = (s) => `TIMESTAMP(DATE_ADD(${day(s)}, INTERVAL 1 DAY), '${TZ}')`;

/**
 * Incasso ora per ora, periodo scelto (`cur`) e periodo prima (`prev`) in una lettura sola.
 * Righe etichettate da `k`:
 *   h   → per, h, kind: incasso e acquisti per ora e per voce (chat, massivi, mance, post, abbonamenti)
 *   hp  → per, h: fan paganti distinti in quell'ora, giorno per giorno (pagina×fan×giorno: si divide per i giorni)
 *   dh  → giorno della settimana × ora (solo cur): incasso
 *   ch  → pagina × ora (solo cur): incasso
 *   tot → per: paganti distinti dell'intero periodo (non sommabili dalle ore)
 */
export function txHourlySql(refs, { ids, org: o, cur, prev }) {
  const list = idList(ids);
  return `
WITH t AS (
  SELECT id, creator_id, user_id, type, CAST(net AS FLOAT64) AS net, DATETIME(created_at, '${TZ}') AS dt
  FROM \`${refs.attributed}\`
  WHERE organization_id = ${org(o)} AND creator_id IN (${list})
    AND calendar_date BETWEEN DATE_SUB(${day(prev.from)}, INTERVAL 1 DAY) AND DATE_ADD(${day(cur.to)}, INTERVAL 1 DAY)
    AND created_at >= ${romeStart(prev.from)} AND created_at < ${romeEnd(cur.to)}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
),
m AS (
  SELECT DISTINCT id FROM \`${refs.mass}\`
  WHERE organization_id = ${org(o)} AND creator_id IN (${list})
    AND created_at >= ${romeStart(prev.from)} AND created_at < ${romeEnd(cur.to)}
),
x AS (
  SELECT t.creator_id, t.user_id, t.net,
    DATE(t.dt) AS d, EXTRACT(HOUR FROM t.dt) AS h, EXTRACT(DAYOFWEEK FROM t.dt) AS dow,
    IF(DATE(t.dt) >= ${day(cur.from)}, 'cur', 'prev') AS per,
    CASE
      WHEN t.type = 'message' AND m.id IS NOT NULL THEN 'mass'
      WHEN t.type = 'message' THEN 'chat'
      WHEN t.type = 'tip' THEN 'tip'
      WHEN t.type = 'post' THEN 'post'
      WHEN t.type LIKE '%subscription%' THEN 'subs'
      ELSE 'other'
    END AS kind
  FROM t LEFT JOIN m USING (id)
)
SELECT 'h' AS k, per, h, kind, NULL AS dow, NULL AS creator_id, SUM(net) AS net, COUNT(*) AS tx, NULL AS payers FROM x GROUP BY per, h, kind
UNION ALL
SELECT 'hp', per, h, NULL, NULL, NULL, NULL, NULL, COUNT(DISTINCT IF(net > 0, CONCAT(creator_id, '|', user_id, '|', CAST(d AS STRING)), NULL)) FROM x GROUP BY per, h
UNION ALL
SELECT 'dh', per, h, NULL, dow, NULL, SUM(net), COUNT(*), NULL FROM x WHERE per = 'cur' GROUP BY per, h, dow
UNION ALL
SELECT 'ch', per, h, NULL, NULL, creator_id, SUM(net), COUNT(*), NULL FROM x WHERE per = 'cur' GROUP BY per, h, creator_id
UNION ALL
SELECT 'tot', per, NULL, NULL, NULL, NULL, SUM(net), COUNT(*), COUNT(DISTINCT IF(net > 0, CONCAT(creator_id, '|', user_id), NULL)) FROM x GROUP BY per`;
}

/**
 * Chi c'è a quell'ora: messaggi (fan e pagina, PPV mandati), nuovi abbonati, operatori in turno.
 * Righe `k`:
 *   msg   → h (solo cur): messaggi dei fan, fan distinti che scrivono, messaggi della pagina, PPV mandati
 *   subs  → per, h: nuovi abbonati
 *   staff → per, h, dow: ore-persona in turno (distinte)
 * I messaggi arrivano nel warehouse una volta al giorno: il periodo dei messaggi si ferma a ieri.
 */
export function activityHourlySql(refs, { ids, org: o, cur, prev, chatTo }) {
  const list = idList(ids);
  const chatEnd = chatTo && chatTo < cur.to ? chatTo : cur.to;
  return `
WITH c AS (
  SELECT EXTRACT(HOUR FROM DATETIME(created_at, '${TZ}')) AS h,
    COUNTIF(sender_id = user_id) AS fan_msgs,
    COUNT(DISTINCT IF(sender_id = user_id, CONCAT(creator_id, '|', user_id, '|', CAST(DATE(created_at, '${TZ}') AS STRING)), NULL)) AS fan_writers,
    COUNTIF(sender_id != user_id) AS page_msgs,
    COUNTIF(sender_id != user_id AND price > 0) AS ppv_sent
  FROM \`${refs.chat}\`
  WHERE organization_id = ${org(o)} AND creator_id IN (${list})
    AND created_at >= ${romeStart(cur.from)} AND created_at < ${romeEnd(chatEnd)}
  GROUP BY 1
),
s AS (
  SELECT IF(created_at >= ${romeStart(cur.from)}, 'cur', 'prev') AS per, EXTRACT(HOUR FROM DATETIME(created_at, '${TZ}')) AS h,
    COUNT(DISTINCT CONCAT(creator_id, '|', user_id, '|', CAST(DATE(created_at, '${TZ}') AS STRING))) AS new_subs
  FROM \`${refs.organicSubs}\`
  WHERE organization_id = ${org(o)} AND creator_id IN (${list}) AND sub_type = 'new_subscriber'
    AND created_at >= ${romeStart(prev.from)} AND created_at < ${romeEnd(cur.to)}
  GROUP BY 1, 2
),
sh AS (
  SELECT DISTINCT member_id, hh
  FROM \`${refs.shifts}\`,
    UNNEST(GENERATE_TIMESTAMP_ARRAY(TIMESTAMP_TRUNC(started_at, HOUR), TIMESTAMP_SUB(ended_at, INTERVAL 1 SECOND), INTERVAL 1 HOUR)) AS hh
  WHERE organization_id = ${org(o)} AND creator_id IN (${list})
    AND started_date BETWEEN DATE_SUB(${day(prev.from)}, INTERVAL 1 DAY) AND ${day(cur.to)}
    AND ended_at > started_at AND TIMESTAMP_DIFF(ended_at, started_at, HOUR) <= 24
    AND EXISTS (SELECT 1 FROM UNNEST(role_names) r WHERE r LIKE '%Chatter%')
    AND hh >= ${romeStart(prev.from)} AND hh < ${romeEnd(cur.to)}
),
st AS (
  SELECT IF(hh >= ${romeStart(cur.from)}, 'cur', 'prev') AS per, EXTRACT(HOUR FROM DATETIME(hh, '${TZ}')) AS h,
    EXTRACT(DAYOFWEEK FROM DATETIME(hh, '${TZ}')) AS dow, COUNT(*) AS staff_hours
  FROM sh GROUP BY 1, 2, 3
)
SELECT 'msg' AS k, 'cur' AS per, h, NULL AS dow, fan_msgs, fan_writers, page_msgs, ppv_sent, NULL AS new_subs, NULL AS staff_hours FROM c
UNION ALL SELECT 'subs', per, h, NULL, NULL, NULL, NULL, NULL, new_subs, NULL FROM s
UNION ALL SELECT 'staff', per, h, dow, NULL, NULL, NULL, NULL, NULL, staff_hours FROM st`;
}

/**
 * Oggi contro un giorno tipico: incasso di oggi ora per ora (dal vivo) e degli stessi giorni della
 * settimana delle 4 settimane prima (ago = giorni fa: 0 oggi, 7, 14, 21, 28). Riga ago = -1: last_at, l'ultima
 * transazione registrata dell'organizzazione (freschezza del flusso).
 */
export function todaySql(refs, { ids, org: o, today }) {
  const list = idList(ids);
  const days = [0, 7, 14, 21, 28].map((n) => `DATE_SUB(${day(today)}, INTERVAL ${n} DAY)`).join(", ");
  return `
WITH t AS (
  SELECT id, CAST(net AS FLOAT64) AS net, DATETIME(created_at, '${TZ}') AS dt
  FROM \`${refs.attributed}\`
  WHERE organization_id = ${org(o)} AND creator_id IN (${list})
    AND calendar_date BETWEEN DATE_SUB(${day(today)}, INTERVAL 29 DAY) AND DATE_ADD(${day(today)}, INTERVAL 1 DAY)
    AND created_at >= TIMESTAMP(DATE_SUB(${day(today)}, INTERVAL 28 DAY), '${TZ}')
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
)
SELECT DATE_DIFF(${day(today)}, DATE(dt), DAY) AS ago, EXTRACT(HOUR FROM dt) AS h, SUM(net) AS net, NULL AS last_at
FROM t WHERE DATE(dt) IN (${days})
GROUP BY 1, 2
UNION ALL
-- freschezza del flusso dal vivo: ultima transazione registrata per TUTTA l'organizzazione (una pagina piccola
-- può non vendere per ore; se il flusso si ferma, l'ora che sembra «vuota» è in realtà non ancora arrivata)
SELECT -1, NULL, NULL, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', MAX(created_at))
FROM \`${refs.attributed}\`
WHERE organization_id = ${org(o)} AND calendar_date >= DATE_SUB(${day(today)}, INTERVAL 1 DAY)`;
}
