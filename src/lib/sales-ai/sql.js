// Sales manager AI — SQL dell'Ufficio Dati (puro: nessun import).
//
// Finestre come LETTERALI (non sub-select): solo così BigQuery pota le
// partizioni di ws_chat già nella stima (stessa lezione di sales-coaching-sql).
// ws_chat ha ~9% di righe duplicate per id → dedup con QUALIFY.

const lit = (ms) => `TIMESTAMP('${new Date(ms).toISOString()}')`;
const ids = (creatorIds) => creatorIds.map((c) => String(Number(c))).filter((c) => c !== "NaN").join(",");

/** Messaggi della giornata (con 2h di contesto prima e 1h dopo) + primo contatto del fan (60 giorni). */
export function dayMessagesSQL({ dataProject: D, creatorIds, dayStart, dayEnd }) {
  const C = ids(creatorIds);
  return `
WITH d AS (
  SELECT c.creator_id, c.user_id, c.created_at, c.sender_id = c.creator_id AS out_,
    COALESCE(SAFE_CAST(JSON_VALUE(c.body,'$.price') AS FLOAT64),0) AS price,
    SUBSTR(TRIM(REGEXP_REPLACE(COALESCE(JSON_VALUE(c.body,'$.text'),''), r'<[^>]+>', ' ')),1,400) AS text
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id IN (${C})
    AND c.created_at >= ${lit(dayStart - 2 * 3600e3)} AND c.created_at < ${lit(dayEnd + 3600e3)}
    AND COALESCE(JSON_VALUE(c.body,'$.isFromQueue'),'false') != 'true'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.commit_timestamp)=1
),
fs AS (
  SELECT c.creator_id, c.user_id, MIN(c.created_at) first_seen
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id IN (${C})
    AND c.created_at >= ${lit(dayStart - 60 * 86400e3)} AND c.created_at < ${lit(dayEnd)}
    AND c.user_id IN (SELECT DISTINCT user_id FROM d)
  GROUP BY 1,2
)
SELECT CAST(d.creator_id AS STRING) creator_id, CAST(d.user_id AS STRING) user_id,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', d.created_at) msg_at, d.out_ AS out, d.price, d.text,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', fs.first_seen) first_seen
FROM d LEFT JOIN fs USING (creator_id, user_id)`;
}

export function shiftsSQL({ dataProject: D, creatorIds, dayStart, dayEnd }) {
  return `
SELECT DISTINCT CAST(creator_id AS STRING) creator_id, member_name,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', started_at) s, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', ended_at) e
FROM \`${D}.onlyfans.cache_members\`, UNNEST(role_names) r
WHERE creator_id IN (${ids(creatorIds)})
  AND started_at < ${lit(dayEnd)} AND ended_at > ${lit(dayStart)} AND ended_at > started_at
  AND REPLACE(r,' ','') IN ('HOC-Chatter','Chatter')`;
}

export function buysSQL({ dataProject: D, creatorIds, dayStart }) {
  return `
SELECT CAST(creator_id AS STRING) creator_id, CAST(user_id AS STRING) user_id,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) buy_at, CAST(amount AS FLOAT64) amount
FROM \`${D}.onlyfans.attributed_transactions\`
WHERE creator_id IN (${ids(creatorIds)}) AND type = 'message' AND created_at >= ${lit(dayStart - 3600e3)}`;
}

/**
 * Resa delle caption sulla creator negli ultimi 30 giorni chiusi (fino a 3
 * giorni prima: ogni PPV ha avuto le sue 72h). PPV a mano, niente masse,
 * niente benvenuto (approssimato sulla finestra). Una caption = i primi 120
 * caratteri normalizzati.
 */
export function captionStatsSQL({ dataProject: D, creatorIds, dayStart }) {
  const t1 = dayStart - 3 * 86400e3, t0 = t1 - 30 * 86400e3;
  return `
WITH d AS (
  SELECT c.creator_id, c.user_id, c.created_at, c.sender_id = c.creator_id AS out_,
    COALESCE(SAFE_CAST(JSON_VALUE(c.body,'$.price') AS FLOAT64),0) AS price,
    SUBSTR(REGEXP_REPLACE(LOWER(TRIM(REGEXP_REPLACE(COALESCE(JSON_VALUE(c.body,'$.text'),''), r'<[^>]+>', ' '))), r'\\s+', ' '),1,120) AS cap
  FROM \`${D}.hoc.ws_chat\` c
  WHERE c.creator_id IN (${ids(creatorIds)})
    AND c.created_at >= ${lit(t0)} AND c.created_at < ${lit(t1)}
    AND COALESCE(JSON_VALUE(c.body,'$.isFromQueue'),'false') != 'true'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY c.commit_timestamp)=1
),
w AS (
  SELECT *,
    out_ AND cap != '' AND COUNT(*) OVER (PARTITION BY creator_id, cap, TIMESTAMP_TRUNC(created_at, HOUR)) >= 20 AS bulk,
    COUNTIF(NOT out_) OVER (PARTITION BY creator_id,user_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS fan_before,
    MIN(created_at) OVER (PARTITION BY creator_id,user_id) AS first_seen
  FROM d
),
p AS (
  SELECT creator_id, user_id, created_at, price, cap FROM w
  WHERE out_ AND price > 0 AND NOT bulk AND NOT (fan_before = 0 AND TIMESTAMP_DIFF(created_at, first_seen, MINUTE) <= 30)
),
t AS (
  SELECT creator_id, user_id, created_at, CAST(amount AS FLOAT64) amount
  FROM \`${D}.onlyfans.attributed_transactions\`
  WHERE creator_id IN (${ids(creatorIds)}) AND type = 'message' AND created_at >= ${lit(t0)} AND created_at < ${lit(t1 + 3 * 86400e3)}
),
pb AS (
  SELECT p.creator_id, p.cap, p.created_at, p.user_id,
    LOGICAL_OR(t.user_id IS NOT NULL) AS bought
  FROM p LEFT JOIN t ON t.creator_id = p.creator_id AND t.user_id = p.user_id
    AND ABS(t.amount - p.price) < 0.01 AND t.created_at BETWEEN p.created_at AND TIMESTAMP_ADD(p.created_at, INTERVAL 72 HOUR)
  GROUP BY 1,2,3,4
)
SELECT CAST(creator_id AS STRING) creator_id, cap, COUNT(*) n, COUNTIF(bought) buys
FROM pb GROUP BY 1,2`;
}

/** Righe della query caption → { cid: { avg_rate, captions: { cap: {n, rate} } } } */
export function captionStatsFromRows(rows) {
  const out = {};
  for (const r of rows) {
    const cid = String(r.creator_id);
    out[cid] ||= { n: 0, buys: 0, captions: {} };
    const n = Number(r.n), b = Number(r.buys);
    out[cid].n += n; out[cid].buys += b;
    if (n >= 10) out[cid].captions[r.cap] = { n, rate: b / n };
  }
  for (const v of Object.values(out)) { v.avg_rate = v.n ? v.buys / v.n : null; delete v.n; delete v.buys; }
  return out;
}
