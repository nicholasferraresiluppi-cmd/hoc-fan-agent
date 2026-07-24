// Loop snapshot — logger della coda "quale fan seguire" per creator × giorno.
//
// È la METÀ-MOAT del ciclo azione→esito: ogni giorno registra CHI era da
// seguire (stato waiting/cooling, LTV, posizione) con un timestamp, così
// l'esito misurato dopo (risposta lato-operatore + acquisto nelle 48h) si
// aggancia CAUSALMENTE alla raccomandazione. Ne nasce il dataset proprietario
// azione→esito — il pezzo che nessun competitor può comprare, perché si
// accumula solo facendo girare il loop.
//
// Validazione a monte (misura 23 lug, ~460k opener): rispondere <=30min a un
// fan in attesa = 2-2,8x revenue 48h. Questo logger trasforma quella
// correlazione retrospettiva in una serie prospettica agganciata all'azione.
//
// Solo metadata + LTV: niente contenuto chat, niente LLM. Tenant HOC.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, hocCreatorScopeSQL } from "@/lib/bigquery-api";
import { getCreators } from "@/lib/priority-queue";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const SNAP_TTL = 400 * 86400;   // il dataset azione→esito deve durare a lungo
const PER_CREATOR_CAP = 60;     // top fan seguibili per creator (bound dimensione)
const LTV_FLOOR = 100;          // stesso floor della Priority Queue
const OBS_WINDOW_H = 48;        // finestra di osservazione esito

const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const snapKey = (cid, day) => `loop:snap:${cid}:${day}`;
const cidsKey = (day) => `loop:snap:cids:${day}`;
const DATES_KEY = "loop:snap:dates";

export { bigQueryConfigured };

/** Cattura lo snapshot della coda per TUTTI i creator HOC in una query sola. */
export async function captureAllSnapshots({ day } = {}) {
  const d = day || new Date().toISOString().slice(0, 10);
  if (!dayRe.test(d)) throw new Error("day non valido (YYYY-MM-DD)");
  const capturedAt = new Date().toISOString();

  const creators = await getCreators();
  const nameById = new Map(creators.map((c) => [String(c.creator_id), c.creator_name]));

  const { rows } = await bqQuery(`
WITH msgs AS (
  SELECT creator_id, user_id,
    MAX(IF(sender_id=user_id, created_at, NULL)) AS last_fan_ts,
    MAX(IF(sender_id<>user_id, created_at, NULL)) AS last_reply_ts,
    MAX(created_at) AS last_any_ts,
    COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) AS msgs_30d
  FROM \`${DATA()}.hoc.ws_chat\`
  WHERE ${hocCreatorScopeSQL(DATA())}
    AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
    AND user_id IS NOT NULL AND sender_id IS NOT NULL
  GROUP BY creator_id, user_id
),
val AS (
  SELECT creator_id, user_id, ANY_VALUE(username) AS username,
    SUM(total_net_expenses) AS ltv, SUM(transaction_count) AS tx
  FROM \`${DATA()}.onlyfans.users_research\`
  WHERE ${hocCreatorScopeSQL(DATA())}
  GROUP BY creator_id, user_id
),
scored AS (
  SELECT m.creator_id, m.user_id, v.username,
    CAST(ROUND(v.ltv,0) AS INT64) AS ltv_usd, v.tx AS txns,
    CASE
      WHEN m.last_fan_ts > COALESCE(m.last_reply_ts, TIMESTAMP('1970-01-01'))
           AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_fan_ts, MINUTE) BETWEEN 20 AND 2880 THEN 'waiting'
      WHEN TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_any_ts, HOUR) BETWEEN 72 AND 504 THEN 'cooling'
      ELSE 'ok'
    END AS state,
    CAST(ROUND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_fan_ts, HOUR)) AS INT64) AS hrs_since_fan,
    CAST(ROUND(TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), m.last_any_ts, HOUR)) AS INT64) AS hrs_since_active,
    m.msgs_30d
  FROM msgs m JOIN val v USING (creator_id, user_id)
  WHERE v.ltv >= ${LTV_FLOOR}
)
SELECT * FROM scored
WHERE state != 'ok'
QUALIFY ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY (state='waiting') DESC, ltv_usd DESC) <= ${PER_CREATOR_CAP}
ORDER BY creator_id, (state='waiting') DESC, ltv_usd DESC`, { maxBytesBilled: 4 * 1024 * 1024 * 1024 });

  const byCreator = new Map();
  for (const r of rows) {
    const cid = String(r.creator_id);
    if (!byCreator.has(cid)) byCreator.set(cid, []);
    byCreator.get(cid).push({
      user_id: String(r.user_id),
      username: r.username || null,
      ltv_usd: Number(r.ltv_usd) || 0,
      txns: Number(r.txns) || 0,
      state: r.state,
      hrs_since_fan: r.hrs_since_fan == null ? null : Number(r.hrs_since_fan),
      hrs_since_active: r.hrs_since_active == null ? null : Number(r.hrs_since_active),
      msgs_30d: Number(r.msgs_30d) || 0,
    });
  }

  const cids = [];
  for (const [cid, fans] of byCreator.entries()) {
    await kv.set(snapKey(cid, d), {
      creator_id: cid,
      creator_name: nameById.get(cid) || `#${cid}`,
      day: d,
      captured_at: capturedAt,
      waiting: fans.filter((f) => f.state === "waiting").length,
      cooling: fans.filter((f) => f.state === "cooling").length,
      fans,
    }, { ex: SNAP_TTL });
    cids.push(cid);
  }
  if (cids.length) {
    await kv.sadd(cidsKey(d), ...cids);
    await kv.expire(cidsKey(d), SNAP_TTL);
    await kv.sadd(DATES_KEY, d);
    await kv.expire(DATES_KEY, SNAP_TTL);
  }
  return { day: d, captured_at: capturedAt, creators: cids.length, fans_total: rows.length };
}

/** Date con snapshot, più recenti prima, con conteggio creator. */
export async function listSnapshotDates() {
  const dates = (await kv.smembers(DATES_KEY)) || [];
  dates.sort().reverse();
  const withCounts = await Promise.all(dates.map(async (day) => ({ day, creators: (await kv.scard(cidsKey(day))) || 0 })));
  return withCounts.filter((x) => x.creators > 0); // niente giorni fantasma dopo la scadenza dei dati
}

export async function readSnapshot(cid, day) {
  return (await kv.get(snapKey(cid, day))) || null;
}
export async function snapshotCreators(day) {
  return (await kv.smembers(cidsKey(day))) || [];
}

/**
 * Esito di uno snapshot passato: per ogni fan flaggato, ha ricevuto risposta
 * (e quanto in fretta) dopo la cattura? ha comprato nelle 48h? Aggrega il lift
 * "risposta <=30min vs no" — la stessa lente della misura a monte, ma ora su
 * una raccomandazione REGISTRATA (prospettica, non ricostruita).
 * Solo per snapshot MATURI (>=48h dalla cattura).
 */
export async function computeOutcomes(cid, day) {
  if (!/^\d+$/.test(String(cid))) return null;
  const snap = await readSnapshot(cid, day);
  if (!snap) return null;
  const t0 = Date.parse(snap.captured_at);
  const matured = Number.isFinite(t0) && Date.now() - t0 >= OBS_WINDOW_H * 3600_000;
  const fans = (snap.fans || []).filter((f) => /^\d+$/.test(String(f.user_id)));
  if (!matured || !fans.length) {
    const maturesInH = Number.isFinite(t0)
      ? Math.max(0, Math.ceil((t0 + OBS_WINDOW_H * 3600_000 - Date.now()) / 3600_000))
      : null;
    return { ...snap, matured, matures_in_h: maturesInH, outcomes: null };
  }

  const cidNum = parseInt(cid, 10);
  const uids = fans.map((f) => f.user_id).join(",");
  const t0s = Math.floor(t0 / 1000);
  const t1s = t0s + OBS_WINDOW_H * 3600;

  const [reps, revs] = await Promise.all([
    bqQuery(`
SELECT user_id, UNIX_SECONDS(MIN(created_at)) AS first_reply_t
FROM \`${DATA()}.hoc.ws_chat\`
WHERE creator_id = ${cidNum} AND user_id IN (${uids}) AND sender_id <> user_id
  AND created_at > TIMESTAMP_SECONDS(${t0s}) AND created_at <= TIMESTAMP_SECONDS(${t1s})
GROUP BY user_id`, { maxBytesBilled: 1024 * 1024 * 1024 }),
    bqQuery(`
SELECT user_id, ROUND(SUM(net),2) AS rev48
FROM (
  SELECT user_id, net FROM \`${DATA()}.onlyfans.attributed_transactions\`
  WHERE creator_id = ${cidNum} AND user_id IN (${uids}) AND id IS NOT NULL AND net IS NOT NULL
    AND created_at > TIMESTAMP_SECONDS(${t0s}) AND created_at <= TIMESTAMP_SECONDS(${t1s})
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
)
GROUP BY user_id`, { maxBytesBilled: 512 * 1024 * 1024 }),
  ]);

  const replyByUid = new Map(reps.rows.map((r) => [String(r.user_id), Number(r.first_reply_t)]));
  const revByUid = new Map(revs.rows.map((r) => [String(r.user_id), Number(r.rev48) || 0]));

  const outFans = fans.map((f) => {
    const rt = replyByUid.get(f.user_id);
    const rev48 = revByUid.get(f.user_id) || 0;
    return {
      user_id: f.user_id, username: f.username, ltv_usd: f.ltv_usd, state: f.state,
      answered: rt != null,
      frt_min: rt != null ? Math.round((rt - t0s) / 60) : null,
      answered_fast: rt != null && rt - t0s <= 1800,
      rev48, bought: rev48 > 0,
    };
  });
  const agg = (pred) => {
    const sub = outFans.filter(pred);
    const n = sub.length;
    const rev = sub.reduce((a, x) => a + x.rev48, 0);
    return {
      n, bought: sub.filter((x) => x.bought).length,
      bought_pct: n ? Math.round((1000 * sub.filter((x) => x.bought).length) / n) / 10 : 0,
      rev_per: n ? Math.round((100 * rev) / n) / 100 : 0,
    };
  };
  return {
    ...snap, matured, matures_in_h: 0,
    outcomes: { fast: agg((x) => x.answered_fast), slow: agg((x) => !x.answered_fast), fans: outFans },
  };
}
