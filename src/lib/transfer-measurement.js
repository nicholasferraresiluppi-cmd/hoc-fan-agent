// Transfer measurement (Kirkpatrick livello 3-4) — misura se il COMPORTAMENTO
// di un operatore si muove sul warehouse reale nel tempo, non nel simulatore.
//
// È il pezzo che l'evidenza sul training chiede e che quasi nessuno può fare:
// non "hai fatto la lezione?" ma "il tuo tasso domande / prezzo PPV / cadenza si
// è spostato sui tuoi turni veri?". Sui SOLI turni a operatore singolo (gli unici
// attribuibili dal warehouse), mese per mese, con gli eventi di coaching
// sovrapposti alla traiettoria.
//
// DISCIPLINA DI ONESTÀ (baked, non opzionale):
//   - OSSERVAZIONALE, non causale: nessun gruppo di controllo. Maturazione,
//     stagionalità e fortuna-del-creator NON sono separate. La traiettoria mostra
//     il MOVIMENTO, mai "grazie al coaching" — è Kirkpatrick come AMBIZIONE di
//     misura, non prova di attribuzione (serve il controfattuale).
//   - Il mese CORRENTE è parziale (marcato), non confrontabile con i chiusi.
//   - Solo turni singoli: chi lavora quasi sempre in duo è invisibile.
//   - All'operatore NON esce il percentile grezzo (policy /me/signals): questa è
//     superficie coach (SEED); la mediana org è contesto, non classifica.
//
// Cache KV riscaldata dal cron dispatch (come operator-signals). Coaching, fuori
// da score/comp.

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";
import { listAllSessions } from "@/lib/coaching-sessions";

export const TRANSFER_VERSION = "transfer-1-2026-07";
const CACHE_KEY = `transfer:trajectories:${TRANSFER_VERSION}`;
const CACHE_TTL = 25 * 3600;
const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

// I comportamenti misurabili sulla traiettoria (il tasso domande è l'unico
// co-misurato col simulatore; prezzo/cadenza sono i driver validati, misurabili
// solo sul vivo — ed è esattamente qui che vivono). `better`: direzione buona.
export const TRANSFER_METRICS = [
  { key: "question_rate", label: "Tasso di domande", better: "low", fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "avg_ppv_price", label: "Prezzo medio PPV", better: "high", fmt: (v) => `$${Math.round(v)}` },
  { key: "ppv_per_h", label: "Cadenza PPV", better: "high", fmt: (v) => `${(+v).toFixed(1)}/h` },
  { key: "msgs_per_h", label: "Cadenza messaggi", better: "high", fmt: (v) => `${Math.round(v)}/h` },
];

const DEFAULT_DAYS = 181; // ~6 mesi
const MIN_SHIFT_MSGS = 20;
const MIN_MONTH_SHIFTS = 3;

function trajectorySQL(days = DEFAULT_DAYS) {
  const D = DATA();
  const org = HOC_ORGANIZATION_ID;
  return `
WITH all_shifts AS (
  SELECT creator_id, member_name, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days + 1} DAY)
    AND organization_id = '${org}'
    AND member_name IS NOT NULL AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
chatter AS (
  SELECT shift_id, member_name, creator_id, started_at, ended_at, started_date,
         effective_working_hours AS hours
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
    AND organization_id = '${org}'
    AND 'HOC - Chatter' IN UNNEST(role_names)
    AND effective_working_hours BETWEEN 1 AND 14
    AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
-- SOLO turni a operatore singolo: nessuna sovrapposizione di un altro membro
-- sullo stesso creator (la stessa disciplina di operator-signals).
single AS (
  SELECT s.* FROM chatter s
  WHERE NOT EXISTS (
    SELECT 1 FROM all_shifts o
    WHERE o.creator_id = s.creator_id AND o.member_name != s.member_name
      AND o.started_at < s.ended_at AND o.ended_at > s.started_at)
),
feat AS (
  SELECT s.member_name, s.shift_id, FORMAT_DATE('%Y-%m', s.started_date) AS mon,
    ANY_VALUE(s.hours) AS hours,
    COUNTIF(c.sender_id = c.creator_id) AS op_msgs,
    COUNTIF(c.sender_id = c.creator_id AND c.text LIKE '%?%') AS op_q,
    COUNTIF(c.sender_id = c.creator_id AND c.price > 0) AS ppv,
    SUM(IF(c.sender_id = c.creator_id AND c.price > 0, CAST(c.price AS FLOAT64), 0)) AS ppv_amount
  FROM single s
  JOIN \`${D}.onlyfans.chat\` c
    ON c.creator_id = s.creator_id AND c.created_at >= s.started_at AND c.created_at < s.ended_at
  WHERE c.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days + 1} DAY)
    AND c.organization_id = '${org}'
  GROUP BY 1, 2, 3
),
prod AS (SELECT * FROM feat WHERE hours > 0 AND op_msgs >= ${MIN_SHIFT_MSGS})
SELECT member_name, mon, COUNT(*) AS shifts,
  SUM(op_q) / SUM(op_msgs) AS question_rate,
  SAFE_DIVIDE(SUM(ppv_amount), NULLIF(SUM(ppv), 0)) AS avg_ppv_price,
  SAFE_DIVIDE(SUM(ppv), SUM(hours)) AS ppv_per_h,
  SUM(op_msgs) / SUM(hours) AS msgs_per_h
FROM prod
GROUP BY 1, 2
HAVING shifts >= ${MIN_MONTH_SHIFTS}
ORDER BY member_name, mon`;
}

// mese "YYYY-MM" corrente (UTC) → marcato parziale nella UI
function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function median(arr) {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Mappa euristica (dichiarata tale) del topic libero di una sessione di coaching
// a un comportamento misurato, per marcare l'evento sulla traiettoria giusta.
function topicToMetric(topic) {
  const t = (topic || "").toLowerCase();
  if (/(domand|intervist|conduc)/.test(t)) return "question_rate";
  if (/(prezz|ppv|svend|sconto|valore)/.test(t)) return "avg_ppv_price";
  if (/(cadenz|presid|propor|continuit)/.test(t)) return "ppv_per_h";
  if (/(messagg|presenz|riagganci|silenz)/.test(t)) return "msgs_per_h";
  return null;
}

function normName(n) {
  return String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Traiettorie comportamentali per operatore (mese per mese, turni singoli),
 * con gli eventi di coaching sovrapposti. Cache KV; ricalcolo solo dal cron.
 * @returns {Promise<object>} payload con operators[], months[], org_median_by_month, meta
 */
export async function getTransferTrajectories({ force = false } = {}) {
  if (!bigQueryConfigured()) {
    return { available: false, reason: "BigQuery non configurato.", version: TRANSFER_VERSION };
  }
  if (!force) {
    const cached = await kv.get(CACHE_KEY);
    if (cached) return cached;
  }

  const CAP = 8 * 1024 * 1024 * 1024;
  const rows = await bqQuery(trajectorySQL(), { maxBytesBilled: CAP });

  // eventi di coaching (non fatale se KV vuoto o assente)
  let sessions = [];
  try {
    sessions = (await listAllSessions({ limit: 500 })) || [];
  } catch {
    sessions = [];
  }
  const eventsByOp = {};
  for (const s of sessions) {
    if (!s?.employee || !s?.created_at) continue;
    const mon = new Date(s.created_at).toISOString().slice(0, 7);
    const key = normName(s.employee);
    (eventsByOp[key] = eventsByOp[key] || []).push({
      mon,
      topic: s.topic || "",
      metric: topicToMetric(s.topic),
      coach: s.coach_id || null,
      status: s.status || null,
    });
  }

  const monthsSet = new Set();
  const byOp = {};
  for (const r of rows) {
    monthsSet.add(r.mon);
    const op = (byOp[r.member_name] = byOp[r.member_name] || { name: r.member_name, rows: [] });
    op.rows.push({
      mon: r.mon,
      shifts: Number(r.shifts),
      question_rate: r.question_rate == null ? null : Number(r.question_rate),
      avg_ppv_price: r.avg_ppv_price == null ? null : Number(r.avg_ppv_price),
      ppv_per_h: r.ppv_per_h == null ? null : Number(r.ppv_per_h),
      msgs_per_h: r.msgs_per_h == null ? null : Number(r.msgs_per_h),
    });
  }
  const months = [...monthsSet].sort();
  const curMon = currentMonth();

  // mediana org per mese per metrica (contesto coach, mai mostrata all'operatore)
  const orgMedian = {};
  for (const m of TRANSFER_METRICS) {
    orgMedian[m.key] = {};
    for (const mon of months) {
      const vals = [];
      for (const op of Object.values(byOp)) {
        const row = op.rows.find((x) => x.mon === mon);
        if (row && row[m.key] != null) vals.push(row[m.key]);
      }
      orgMedian[m.key][mon] = median(vals);
    }
  }

  // costruisci gli operatori: serie per metrica + movimento (primo mese chiuso →
  // ultimo mese chiuso) + eventi. Escludo il mese corrente dal calcolo del
  // movimento (parziale), ma lo mostro nella serie marcato.
  const operators = Object.values(byOp).map((op) => {
    const closed = op.rows.filter((r) => r.mon !== curMon);
    const series = {};
    const movement = {};
    for (const m of TRANSFER_METRICS) {
      series[m.key] = op.rows.map((r) => ({ mon: r.mon, value: r[m.key], shifts: r.shifts, partial: r.mon === curMon }));
      const withVal = closed.filter((r) => r[m.key] != null);
      if (withVal.length >= 2) {
        const first = withVal[0][m.key];
        const last = withVal[withVal.length - 1][m.key];
        const delta = last - first;
        const good = m.better === "low" ? delta < 0 : delta > 0;
        movement[m.key] = {
          first, last, delta,
          good,
          from_mon: withVal[0].mon,
          to_mon: withVal[withVal.length - 1].mon,
          n_months: withVal.length,
        };
      } else {
        movement[m.key] = null;
      }
    }
    return {
      name: op.name,
      months_active: op.rows.length,
      total_shifts: op.rows.reduce((a, r) => a + r.shifts, 0),
      series,
      movement,
      events: eventsByOp[normName(op.name)] || [],
    };
  });

  // ordina: prima chi ha eventi di coaching (il caso Kirkpatrick vero), poi per
  // n. mesi attivi (traiettorie più leggibili in alto)
  operators.sort((a, b) => {
    if (!!a.events.length !== !!b.events.length) return a.events.length ? -1 : 1;
    return b.months_active - a.months_active;
  });

  const payload = {
    available: true,
    version: TRANSFER_VERSION,
    metrics: TRANSFER_METRICS.map((m) => ({ key: m.key, label: m.label, better: m.better })),
    months,
    current_month: curMon,
    org_median_by_month: orgMedian,
    operators,
    coaching_events_total: Object.values(eventsByOp).reduce((a, v) => a + v.length, 0),
    meta: {
      grain: "mese, turni a operatore singolo",
      caveat:
        "Osservazionale, non causale: nessun gruppo di controllo. Maturazione, stagionalità e fortuna-del-creator non sono separate — la traiettoria mostra il MOVIMENTO, non l'effetto attribuibile del coaching. Mese corrente parziale. Solo turni singoli.",
    },
  };

  await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL });
  return payload;
}
