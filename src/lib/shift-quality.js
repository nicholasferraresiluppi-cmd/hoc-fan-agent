// Qualità turni — vista turno×operatore per creator×giorno.
//
// Fonde tre fonti che nessuna vista aveva insieme:
//   1. turni CP (KV cp:wages:{mese} → finestre operatore, coseller k)
//   2. chat ws_chat (BigQuery, metadata + campi PPV del body: price/isOpened/isTip
//      — DETERMINISTICI, qui non si legge il testo dei messaggi)
//   3. venduto vero (attributed_transactions, net) per finestra turno
//
// ATTRIBUZIONE ONESTA (misura lug 2026: 52,9% attribuibile, 36% ambiguo):
//   turno con 1 operatore = "singolo" (attribuibile), 2+ = "duo" (NON si può dire
//   chi ha scritto: ws_chat non porta l'operatore). Mai fingere il contrario.
//
// Il layer di CONTENUTO (tono/obiezioni via LLM) vive in shift-quality-llm.js
// ed è separato by design: questo file resta eseguibile senza toccare il testo.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { getCreators } from "@/lib/priority-queue";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
const DAY_TTL = 1800; // 30 min: il giorno corrente cambia, i passati riusano la cache
const BROADCAST_MIN = 5; // stesso knob della CI Tier-1: 5+ destinatari/secondo = mass-DM

export { getCreators, bigQueryConfigured };

const dayRe = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turni CP che toccano il creator nel giorno (UTC), raggruppati per finestra
 * SCHEDULATA identica (duo). Le finestre effettive però sono i CHECK-IN REALI
 * (postgres.public_checkins, join sull'id turno CP) quando esistono: l'operatore
 * che entra alle 20:04 su un turno delle 17:00 va misurato dalle 20:04.
 * Fallback per turno senza check-in: orario schedulato (marcato real=false).
 */
const CHECKIN_TOL_MS = 6 * 3600_000; // check-in oltre ±6h dallo schedulato = dato sporco, ignora

export async function loadShiftsForDay(creatorIds, day) {
  if (!dayRe.test(day)) throw new Error("day non valido (YYYY-MM-DD)");
  const ids = creatorIds.map(Number).filter(Number.isInteger);
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const dayEnd = dayStart + 86400_000;
  // I turni a cavallo di mezzanotte appartengono al mese del loro started_at:
  // per un giorno 1 del mese servono anche i wage del mese precedente.
  const months = new Set([day.slice(0, 7)]);
  const prev = new Date(dayStart - 86400_000);
  months.add(prev.toISOString().slice(0, 7));
  const wageSets = await Promise.all([...months].map((m) => kv.get(`cp:wages:${m}`)));

  // 1) un entry per operatore×turno, con l'id turno CP per il join check-in
  const entries = [];
  const seen = new Set();
  for (const wages of wageSets) {
    for (const rec of wages || []) {
      for (const sh of rec.shifts || []) {
        const cids = (sh.creator_ids || []).map(Number).filter((c) => ids.includes(c));
        if (!cids.length) continue;
        const st = Date.parse(sh.started_at);
        const en = Date.parse(sh.ended_at);
        if (!Number.isFinite(st)) continue;
        const enSafe = Number.isFinite(en) ? en : Date.now();
        // pre-filtro largo: il check-in reale può slittare rispetto allo schedulato
        if (enSafe <= dayStart - CHECKIN_TOL_MS || st >= dayEnd + CHECKIN_TOL_MS) continue;
        const dedup = `${sh.id}|${rec.member_name}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);
        cids.sort((a, b) => a - b);
        entries.push({
          sid: sh.id, op: rec.member_name, cids, schedSt: st, schedEn: enSafe,
          st, en: enSafe, real: false,
          k: Number(sh.payment_profile?.cosellers_count) || 1,
        });
      }
    }
  }
  if (!entries.length) return [];

  // 2) check-in reali in batch (1 query). Best-effort: se fallisce si resta
  //    sugli orari schedulati — la vista non si blocca mai per questo.
  try {
    if (bigQueryConfigured()) {
      const sids = [...new Set(entries.map((e) => `'${String(e.sid).replace(/[^0-9a-zA-Z-]/g, "")}'`))];
      const { rows } = await bqQuery(
        `SELECT shift_id, UNIX_SECONDS(MIN(started_at)) AS cs, UNIX_SECONDS(MAX(ended_at)) AS ce,
                COUNTIF(ended_at IS NULL) > 0 AS open
         FROM \`${DATA()}.postgres.public_checkins\`
         WHERE shift_id IN (${sids.join(",")}) AND started_at IS NOT NULL
         GROUP BY shift_id`,
        { maxBytesBilled: 256 * 1024 * 1024 }
      );
      const bySid = new Map(rows.map((r) => [String(r.shift_id), r]));
      for (const e of entries) {
        const ck = bySid.get(String(e.sid));
        if (!ck || ck.cs == null) continue;
        const cs = Number(ck.cs) * 1000;
        if (Math.abs(cs - e.schedSt) > CHECKIN_TOL_MS) continue; // dato sporco
        // checkout mancante o turno ancora aperto → si chiude allo schedulato;
        // checkout chiuso in ritardo estremo (dato sporco) → clamp a schedEn+tol,
        // così la finestra reale resta dentro il pre-filtro (sched ±tol) e un
        // turno non assorbe mai mezza giornata successiva.
        const rawCe = (ck.open || ck.ce == null) ? e.schedEn : Number(ck.ce) * 1000;
        const ce = Math.min(rawCe, e.schedEn + CHECKIN_TOL_MS);
        if (ce <= cs) continue;
        e.st = cs; e.en = ce; e.real = true;
      }
    }
  } catch { /* fallback silenzioso agli orari schedulati */ }

  // 3) filtro giorno sulle finestre effettive
  const active = entries.filter((e) => e.en > dayStart && e.st < dayEnd);
  if (!active.length) return [];

  // 4) raggruppa per finestra SCHEDULATA identica (il duo CP condivide lo slot);
  //    la finestra effettiva della riga = unione dei check-in dei membri.
  const byWindow = new Map();
  for (const e of active) {
    const key = `${e.schedSt}|${e.schedEn}|${e.cids.join(",")}`;
    const w = byWindow.get(key) || {
      start: e.st, end: e.en, cids: e.cids, k: e.k, operators: [], members: [],
    };
    w.start = Math.min(w.start, e.st);
    w.end = Math.max(w.end, e.en);
    w.k = Math.max(w.k, e.k);
    if (!w.operators.includes(e.op)) w.operators.push(e.op);
    w.members.push({ op: e.op, start: e.st, end: e.en, real: e.real });
    byWindow.set(key, w);
  }
  const shifts = [...byWindow.values()].sort((a, b) => a.start - b.start);
  for (const s of shifts) {
    s.members.sort((a, b) => a.start - b.start);
    s.real = s.members.every((m) => m.real) ? "reale" : s.members.some((m) => m.real) ? "parziale" : "schedulato";
    // duo = più operatori nella stessa finestra O payment profile coseller
    s.duo = s.operators.length > 1 || s.k > 1;
  }
  // sovrapposizione reale tra righe sullo stesso account (cambio turno): info, non fusione
  for (const s of shifts) {
    let ov = 0;
    for (const o of shifts) {
      if (o === s || !o.cids.some((c) => s.cids.includes(c))) continue;
      ov = Math.max(ov, Math.min(s.end, o.end) - Math.max(s.start, o.start));
    }
    s.overlap_min = ov > 0 ? Math.round(ov / 60000) : 0;
  }
  return shifts;
}

function shiftStructsSQL(shifts) {
  return shifts
    .map((s, i) => `STRUCT(${i} AS idx, ${Math.floor(s.start / 1000)} AS s, ${Math.floor(s.end / 1000)} AS e)`)
    .join(",");
}

/**
 * Vista completa creator×giorno: turni + per turno conversazioni, msg, funnel PPV
 * (dai campi body, non dal testo) e venduto attribuito alla finestra.
 */
export async function getShiftQualityDay(creatorId, day, { force = false } = {}) {
  const cid = parseInt(creatorId, 10);
  if (!Number.isInteger(cid)) throw new Error("creator_id non valido");
  if (!dayRe.test(day)) throw new Error("day non valido (YYYY-MM-DD)");

  const cacheKey = `sq:day:${cid}:${day}`;
  if (!force) {
    const cached = await kv.get(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const shifts = await loadShiftsForDay([cid], day);
  const payload = { creator_id: String(cid), day, shifts: [], totals: null, generated_at: new Date().toISOString() };
  if (!shifts.length) {
    await kv.set(cacheKey, payload, { ex: DAY_TTL });
    return { ...payload, cached: false };
  }

  const structs = shiftStructsSQL(shifts);
  // Perimetro giorno esteso ai bordi dei turni (il turno notturno sconfina).
  const minS = Math.min(...shifts.map((s) => s.start)) / 1000;
  const maxE = Math.max(...shifts.map((s) => s.end)) / 1000;

  // Chat: dedup re-ingest, broadcast-detection come CI Tier-1, poi bucket per turno.
  // conv = fan distinti che hanno SCRITTO nel turno (fan attivi, non destinatari di mass-DM).
  // PPV: messaggi lato-creator PERSONALI con price>0 e non-tip; sbloccato = isOpened.
  const chatSQL = `
WITH base AS (
  SELECT id, user_id, sender_id, created_at,
    TIMESTAMP_TRUNC(created_at, SECOND) AS sec_bucket,
    (sender_id = user_id) AS is_fan,
    SAFE_CAST(JSON_VALUE(body, '$.price') AS FLOAT64) AS price,
    JSON_VALUE(body, '$.isOpened') = 'true' AS opened,
    JSON_VALUE(body, '$.isTip') = 'true' AS tip
  FROM \`${DATA()}.hoc.ws_chat\`
  WHERE creator_id = ${cid}
    AND created_at >= TIMESTAMP_SECONDS(${Math.floor(minS)})
    AND created_at <  TIMESTAMP_SECONDS(${Math.ceil(maxE)})
    AND user_id IS NOT NULL AND sender_id IS NOT NULL AND creator_id <> user_id
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY commit_timestamp DESC) = 1
),
bucketed AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY sender_id, sec_bucket, user_id ORDER BY created_at, id) AS rn
  FROM base
),
flagged AS (
  SELECT id, user_id, created_at, is_fan, price, opened, tip,
    SUM(IF(rn = 1, 1, 0)) OVER (PARTITION BY sender_id, sec_bucket) AS recipients
  FROM bucketed
),
msgs AS (
  SELECT id, user_id, UNIX_SECONDS(created_at) AS t, is_fan,
    (NOT is_fan AND recipients < ${BROADCAST_MIN}) AS is_personal_reply,
    (NOT is_fan AND recipients >= ${BROADCAST_MIN}) AS is_broadcast,
    price, opened, tip
  FROM flagged
)
SELECT idx,
  COUNT(DISTINCT IF(is_fan, user_id, NULL))                        AS active_fans,
  COUNTIF(is_fan)                                                  AS fan_msgs,
  COUNTIF(is_personal_reply)                                       AS op_msgs,
  COUNTIF(is_broadcast)                                            AS broadcast_msgs,
  COUNTIF(is_personal_reply AND price > 0 AND NOT tip)             AS ppv_proposed,
  COUNTIF(is_personal_reply AND price > 0 AND NOT tip AND opened)  AS ppv_unlocked
FROM (
  -- le finestre reali possono sovrapporsi al cambio turno: ogni messaggio conta
  -- in UN solo turno, quello iniziato più di recente (il subentrante "possiede" l'orario)
  SELECT m.*, sh.idx
  FROM msgs m
  JOIN UNNEST([${structs}]) sh ON m.t >= sh.s AND m.t < sh.e
  QUALIFY ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY sh.s DESC, sh.e DESC, sh.idx) = 1
)
GROUP BY idx`;

  const txnSQL = `
SELECT idx,
  CAST(ROUND(SUM(net), 2) AS FLOAT64) AS net_usd,
  COUNT(*) AS txns
FROM (
  SELECT x.id, x.t, x.net, sh.idx
  FROM (
    -- dedup re-ingest CDC: stesso id può comparire più volte (survivor = più recente)
    SELECT id, UNIX_SECONDS(created_at) AS t, net
    FROM \`${DATA()}.onlyfans.attributed_transactions\`
    WHERE creator_id = ${cid}
      AND created_at >= TIMESTAMP_SECONDS(${Math.floor(minS)})
      AND created_at <  TIMESTAMP_SECONDS(${Math.ceil(maxE)})
      AND id IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
  ) x
  JOIN UNNEST([${structs}]) sh ON x.t >= sh.s AND x.t < sh.e
  QUALIFY ROW_NUMBER() OVER (PARTITION BY x.id ORDER BY sh.s DESC, sh.e DESC, sh.idx) = 1
)
GROUP BY idx`;

  // Venduto di CALENDARIO del giorno (00:00→24:00 UTC): è il KPI "giorno" onesto —
  // le righe turno hanno finestre reali che possono sconfinare nel giorno prima/dopo.
  const dayNetSQL = `
SELECT CAST(ROUND(SUM(net), 2) AS FLOAT64) AS net_usd, COUNT(*) AS txns
FROM (
  SELECT net
  FROM \`${DATA()}.onlyfans.attributed_transactions\`
  WHERE creator_id = ${cid}
    AND created_at >= TIMESTAMP('${day}T00:00:00Z')
    AND created_at <  TIMESTAMP_ADD(TIMESTAMP('${day}T00:00:00Z'), INTERVAL 1 DAY)
    AND id IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) = 1
)`;

  const [chat, txn, dayNet] = await Promise.all([
    bqQuery(chatSQL),
    bqQuery(txnSQL, { maxBytesBilled: 512 * 1024 * 1024 }),
    bqQuery(dayNetSQL, { maxBytesBilled: 256 * 1024 * 1024 }),
  ]);
  const chatByIdx = new Map(chat.rows.map((r) => [Number(r.idx), r]));
  const txnByIdx = new Map(txn.rows.map((r) => [Number(r.idx), r]));

  payload.shifts = shifts.map((s, i) => {
    const c = chatByIdx.get(i) || {};
    const t = txnByIdx.get(i) || {};
    return {
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      operators: s.operators,
      members: (s.members || []).map((m) => ({
        op: m.op, start: new Date(m.start).toISOString(), end: new Date(m.end).toISOString(), real: m.real,
      })),
      windows: s.real || "schedulato",
      overlap_min: s.overlap_min || 0,
      attribution: s.duo ? "duo" : "singolo",
      k: s.k,
      active_fans: Number(c.active_fans) || 0,
      fan_msgs: Number(c.fan_msgs) || 0,
      op_msgs: Number(c.op_msgs) || 0,
      broadcast_msgs: Number(c.broadcast_msgs) || 0,
      ppv_proposed: Number(c.ppv_proposed) || 0,
      ppv_unlocked: Number(c.ppv_unlocked) || 0,
      net_usd: Number(t.net_usd) || 0,
      txns: Number(t.txns) || 0,
    };
  });
  payload.totals = payload.shifts.reduce(
    (a, s) => ({
      shifts_net: Math.round((a.shifts_net + s.net_usd) * 100) / 100,
      ppv_proposed: a.ppv_proposed + s.ppv_proposed,
      ppv_unlocked: a.ppv_unlocked + s.ppv_unlocked,
      active_fans_max: Math.max(a.active_fans_max, s.active_fans),
      singolo_net: Math.round((a.singolo_net + (s.attribution === "singolo" ? s.net_usd : 0)) * 100) / 100,
      duo_net: Math.round((a.duo_net + (s.attribution === "duo" ? s.net_usd : 0)) * 100) / 100,
    }),
    { shifts_net: 0, ppv_proposed: 0, ppv_unlocked: 0, active_fans_max: 0, singolo_net: 0, duo_net: 0 }
  );
  payload.totals.net_usd = Number(dayNet.rows?.[0]?.net_usd) || 0;
  payload.totals.txns = Number(dayNet.rows?.[0]?.txns) || 0;
  payload.bytes_processed =
    (chat.totalBytesProcessed || 0) + (txn.totalBytesProcessed || 0) + (dayNet.totalBytesProcessed || 0);

  await kv.set(cacheKey, payload, { ex: DAY_TTL });
  return { ...payload, cached: false };
}

/** Sanity: il creator è del tenant HOC (difesa in profondità oltre alla lista già scoped). */
export async function isHocCreator(creatorId) {
  const cid = parseInt(creatorId, 10);
  if (!Number.isInteger(cid)) return false;
  const key = `sq:hoccheck:${cid}`;
  const cached = await kv.get(key);
  if (cached != null) return cached === 1;
  const { rows } = await bqQuery(
    `SELECT COUNT(*) n FROM \`${DATA()}.onlyfans.reach\` WHERE creator_id = ${cid} AND organization_id = '${HOC_ORGANIZATION_ID}'`,
    { maxBytesBilled: 128 * 1024 * 1024 }
  );
  const ok = Number(rows?.[0]?.n) > 0;
  await kv.set(key, ok ? 1 : 0, { ex: 6 * 3600 });
  return ok;
}
