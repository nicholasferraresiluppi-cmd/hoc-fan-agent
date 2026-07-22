// Priority Queue · Fase 0 — worklist "quale fan seguire ora" per creator.
//
// Combina i segnali chat (ws_chat, metadata-only) col VALORE del fan (users_research:
// total_net_expenses riconcilia al centesimo con attributed_transactions.net) per
// ordinare gli spender per stato: IN ATTESA (ha scritto, non risposto oltre SLA) o
// SI RAFFREDDA (whale silenzioso 3-21gg). Il deep-link a Infloww non esiste (app
// desktop Electron, nessun URL per conversazione) → la UI copia lo @username, che
// l'operatore incolla nella ricerca Infloww. Vedi docs/CONVERSATION_INTELLIGENCE.md.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const QUEUE_TTL = 1800; // 30 min — è una coda "ora", non deve essere troppo stantia
const CREATORS_TTL = 6 * 3600;
const LTV_FLOOR = 100; // fan di valore reale

// Lista creator selezionabili (con volume chat recente + nome), cachata.
export async function getCreators() {
  const key = "bq:pq:creators";
  const cached = await kv.get(key);
  if (cached) return cached;
  const sql = `
    SELECT c.creator_id, ANY_VALUE(r.creator_name) AS creator_name, COUNT(*) AS msgs_7d
    FROM \`${DATA()}.hoc.ws_chat\` c
    LEFT JOIN (SELECT DISTINCT creator_id, creator_name FROM \`${DATA()}.onlyfans.reach\` WHERE creator_name IS NOT NULL) r
      ON r.creator_id = c.creator_id
    WHERE c.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    GROUP BY c.creator_id
    HAVING msgs_7d >= 500
    ORDER BY creator_name`;
  const { rows } = await bqQuery(sql);
  const out = rows.map((r) => ({
    creator_id: String(r.creator_id),
    creator_name: r.creator_name || `#${r.creator_id}`,
    msgs_7d: Number(r.msgs_7d),
  }));
  await kv.set(key, out, { ex: CREATORS_TTL });
  return out;
}

function queueSQL(creatorId) {
  const cid = parseInt(creatorId, 10);
  if (!Number.isInteger(cid)) throw new Error("creator_id non valido");
  return `
  WITH msgs AS (
    SELECT user_id,
      MAX(IF(sender_id=user_id, created_at, NULL)) AS last_fan_ts,
      MAX(IF(sender_id<>user_id, created_at, NULL)) AS last_reply_ts,
      MAX(created_at) AS last_any_ts,
      COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS msgs_30d
    FROM \`${DATA()}.hoc.ws_chat\`
    WHERE creator_id=${cid} AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
    GROUP BY user_id
  ),
  val AS (
    SELECT user_id, ANY_VALUE(username) username, SUM(total_net_expenses) ltv, SUM(transaction_count) tx
    FROM \`${DATA()}.onlyfans.users_research\` WHERE creator_id=${cid} GROUP BY user_id
  )
  SELECT * FROM (
    SELECT
      val.username,
      CAST(ROUND(val.ltv,0) AS INT64) AS ltv_usd,
      val.tx AS txns,
      CASE
        WHEN m.last_fan_ts > COALESCE(m.last_reply_ts, TIMESTAMP('1970-01-01'))
             AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_fan_ts, MINUTE) BETWEEN 20 AND 2880 THEN 'waiting'
        WHEN TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_any_ts, HOUR) BETWEEN 72 AND 504 THEN 'cooling'
        ELSE 'ok'
      END AS state,
      CAST(ROUND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_fan_ts, HOUR)) AS INT64) AS hrs_since_fan,
      CAST(ROUND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_any_ts, HOUR)) AS INT64) AS hrs_since_active,
      m.msgs_30d
    FROM msgs m JOIN val ON val.user_id = m.user_id
    WHERE val.ltv >= ${LTV_FLOOR}
  )
  WHERE state != 'ok'
  ORDER BY (state='waiting') DESC, ltv_usd DESC
  LIMIT 40`;
}

export async function getPriorityQueue(creatorId) {
  const key = `bq:pq:q:${creatorId}`;
  const cached = await kv.get(key);
  if (cached) return { ...cached, cached: true };
  const { rows } = await bqQuery(queueSQL(creatorId));
  const payload = { creator_id: String(creatorId), rows, generated_at: new Date().toISOString() };
  await kv.set(key, payload, { ex: QUEUE_TTL });
  return { ...payload, cached: false };
}

export { bigQueryConfigured };
