// Operator Signal Profile — "dove sei carente", dal lavoro VERO dell'operatore.
//
// Porta i Signals (correlazioni org-level, /admin/academy-signals) alla grana del
// SINGOLO OPERATORE: dai suoi turni a operatore singolo (attribuzione pulita) legge
// i suoi comportamenti reali (tasso domande, prezzo/cadenza PPV, cadenza messaggi)
// e li benchmarka contro l'organizzazione. È la fondazione del coaching su misura:
// diagnosi dal campo, non dal simulatore.
//
// ONESTÀ / GOVERNANCE:
//   - solo turni a operatore SINGOLO (in duo non si sa chi ha scritto). La copertura
//     sui turni in duo si estende con il match dell'export Infloww (tool separato).
//   - direzioni dei segnali dall'evidenza validata (memory academy-tier2-signals-evidence):
//     domande ↓ meglio, prezzo/cadenza PPV ↑ meglio. Il prezzo PPV porta un caveat
//     (reverse-causation parziale: dipende anche dal mix creator/fan).
//   - è COACHING, non score/comp. Non alimenta ladder né HR (policy dati-fan +
//     separazione training/performance).
//   - metodologia versionata (OPERATOR_SIGNALS_VERSION).

import { kv } from "@vercel/kv";
import { bqQuery, bigQueryConfigured, HOC_ORGANIZATION_ID } from "@/lib/bigquery-api";

const DATA = () => process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";

export const OPERATOR_SIGNALS_VERSION = "op-sig-1-2026-07";
const CACHE_KEY = `operator:signals:${OPERATOR_SIGNALS_VERSION}`;
const CACHE_TTL = 25 * 3600; // riscaldata dal cron dispatch

const DEFAULTS = { days: 60, minShiftMsgs: 20, minOpShifts: 5 };

// Comportamenti scorati (direzione dall'evidenza). `better`: "low" o "high".
const METRICS = [
  { key: "question_rate", label: "Tasso di domande", better: "low", fmt: (v) => `${Math.round(v * 100)}%`, coaching: "Conduci di più, proponi invece di intervistare.", caveat: null },
  { key: "avg_ppv_price", label: "Prezzo medio PPV", better: "high", fmt: (v) => `$${Math.round(v)}`, coaching: "Non svenderti: alza il prezzo quando il fan è caldo.", caveat: "Dipende in parte dal mix di creator/fan che segui, non solo da te." },
  { key: "ppv_per_h", label: "Cadenza PPV", better: "high", fmt: (v) => `${v.toFixed(1)}/h`, coaching: "Proponi contenuti a pagamento con più continuità.", caveat: null },
  { key: "msgs_per_h", label: "Cadenza messaggi", better: "high", fmt: (v) => `${Math.round(v)}/h`, coaching: "Tieni viva la conversazione, presidia di più.", caveat: null },
];

function opSignalsSQL(days, minShiftMsgs, minOpShifts) {
  const org = HOC_ORGANIZATION_ID;
  const D = DATA();
  return `
WITH all_shifts AS (
  SELECT creator_id, member_name, started_at, ended_at
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days + 1} DAY)
    AND organization_id = '${org}'
    AND member_name IS NOT NULL AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
chatter AS (
  SELECT shift_id, member_name, creator_id, started_at, ended_at,
         effective_working_hours AS hours, amount AS revenue
  FROM \`${D}.onlyfans.cache_members\`
  WHERE started_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
    AND organization_id = '${org}'
    AND 'HOC - Chatter' IN UNNEST(role_names)
    AND effective_working_hours BETWEEN 1 AND 14
    AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at
),
single AS (
  SELECT s.* FROM chatter s
  WHERE NOT EXISTS (
    SELECT 1 FROM all_shifts o
    WHERE o.creator_id = s.creator_id AND o.member_name != s.member_name
      AND o.started_at < s.ended_at AND o.ended_at > s.started_at)
),
-- una riga per SHIFT (mai fondere turni distinti)
feat AS (
  SELECT s.member_name, s.shift_id,
    ANY_VALUE(s.hours) AS hours, ANY_VALUE(s.revenue) AS revenue,
    COUNTIF(c.sender_id = c.creator_id) AS op_msgs,
    SUM(IF(c.sender_id = c.creator_id, c.words, 0)) AS op_words,
    SUM(IF(c.sender_id = c.user_id, c.words, 0)) AS fan_words,
    COUNTIF(c.sender_id = c.creator_id AND c.text LIKE '%?%') AS op_q,
    COUNTIF(c.sender_id = c.creator_id AND c.price > 0) AS ppv,
    SUM(IF(c.sender_id = c.creator_id AND c.price > 0, CAST(c.price AS FLOAT64), 0)) AS ppv_amount
  FROM single s
  JOIN \`${D}.onlyfans.chat\` c
    ON c.creator_id = s.creator_id AND c.created_at >= s.started_at AND c.created_at < s.ended_at
  WHERE c.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days + 1} DAY)
    AND c.organization_id = '${org}'
  GROUP BY 1, 2
)
SELECT member_name,
  COUNT(*) AS shifts,
  SUM(op_msgs) AS msgs,
  SUM(op_q) / SUM(op_msgs) AS question_rate,
  SAFE_DIVIDE(SUM(ppv), SUM(hours)) AS ppv_per_h,
  SAFE_DIVIDE(SUM(ppv_amount), NULLIF(SUM(ppv), 0)) AS avg_ppv_price,
  SUM(op_msgs) / SUM(hours) AS msgs_per_h,
  SAFE_DIVIDE(SUM(op_words), NULLIF(SUM(op_msgs), 0)) AS words_per_msg,
  SAFE_DIVIDE(SUM(op_words), NULLIF(SUM(op_words) + SUM(fan_words), 0)) AS talk_ratio,
  SUM(revenue) / SUM(hours) AS rev_per_h
FROM feat
WHERE hours > 0 AND op_msgs >= ${minShiftMsgs}
GROUP BY member_name
HAVING shifts >= ${minOpShifts} AND SUM(op_msgs) > 0`;
}

// Percentile-rank di v nell'array ordinato asc (frazione di valori <= v).
function pctRank(sortedAsc, v) {
  if (!sortedAsc.length) return null;
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAsc.length;
}

function median(sortedAsc) {
  if (!sortedAsc.length) return null;
  const m = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 ? sortedAsc[m] : (sortedAsc[m - 1] + sortedAsc[m]) / 2;
}

function buildProfiles(rows) {
  const ops = rows
    .map((r) => ({
      operator: r.member_name,
      shifts: Number(r.shifts),
      msgs: Number(r.msgs),
      rev_per_h: r.rev_per_h == null ? null : Number(r.rev_per_h),
      words_per_msg: r.words_per_msg == null ? null : Number(r.words_per_msg),
      talk_ratio: r.talk_ratio == null ? null : Number(r.talk_ratio),
      vals: {
        question_rate: r.question_rate == null ? null : Number(r.question_rate),
        avg_ppv_price: r.avg_ppv_price == null ? null : Number(r.avg_ppv_price),
        ppv_per_h: r.ppv_per_h == null ? null : Number(r.ppv_per_h),
        msgs_per_h: r.msgs_per_h == null ? null : Number(r.msgs_per_h),
      },
    }))
    .filter((o) => o.shifts > 0);

  // distribuzioni org per metrica (per benchmark)
  const dist = {};
  for (const m of METRICS) {
    const arr = ops.map((o) => o.vals[m.key]).filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
    dist[m.key] = { sorted: arr, median: median(arr) };
  }

  const profiles = ops.map((o) => {
    const metrics = METRICS.map((m) => {
      const v = o.vals[m.key];
      const d = dist[m.key];
      if (v == null || !d.sorted.length) {
        return { key: m.key, label: m.label, value: v, display: v == null ? "—" : m.fmt(v), org_median: d.median, goodness: null, verdict: "n/d", better: m.better, caveat: m.caveat, coaching: m.coaching };
      }
      const rank = pctRank(d.sorted, v); // 0..1, quota di operatori con valore <= il suo
      const goodness = m.better === "low" ? 1 - rank : rank; // 1 = tra i migliori
      const verdict = goodness >= 0.66 ? "forte" : goodness >= 0.34 ? "ok" : "gap";
      return {
        key: m.key,
        label: m.label,
        value: v,
        display: m.fmt(v),
        org_median: d.median,
        goodness: +goodness.toFixed(2),
        verdict,
        better: m.better,
        caveat: m.caveat,
        coaching: m.coaching,
      };
    });

    const scored = metrics.filter((m) => m.goodness != null);
    // dove sei carente = metrica scorata con goodness più bassa
    const worst = scored.slice().sort((a, b) => a.goodness - b.goodness)[0] || null;
    const best = scored.slice().sort((a, b) => b.goodness - a.goodness)[0] || null;
    const topGap = worst && worst.verdict === "gap" ? { key: worst.key, label: worst.label, coaching: worst.coaching } : null;

    return {
      operator: o.operator,
      shifts: o.shifts,
      msgs: o.msgs,
      rev_per_h: o.rev_per_h == null ? null : Math.round(o.rev_per_h),
      metrics,
      top_gap: topGap,
      top_strength: best && best.verdict === "forte" ? { key: best.key, label: best.label } : null,
    };
  });

  // ordina: prima chi ha un gap (da coachare), poi per rev/h desc
  profiles.sort((a, b) => {
    if (!!a.top_gap !== !!b.top_gap) return a.top_gap ? -1 : 1;
    return (b.rev_per_h ?? 0) - (a.rev_per_h ?? 0);
  });

  return {
    profiles,
    operators: profiles.length,
    org_medians: Object.fromEntries(METRICS.map((m) => [m.key, dist[m.key].median])),
  };
}

function clampInt(v, def, lo, hi) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, lo), hi);
}

export async function getOperatorSignalProfiles({ force = false, days, minShiftMsgs, minOpShifts } = {}) {
  const params = {
    days: clampInt(days, DEFAULTS.days, 14, 120),
    minShiftMsgs: clampInt(minShiftMsgs, DEFAULTS.minShiftMsgs, 1, 200),
    minOpShifts: clampInt(minOpShifts, DEFAULTS.minOpShifts, 2, 100),
  };
  const usingDefaults =
    params.days === DEFAULTS.days && params.minShiftMsgs === DEFAULTS.minShiftMsgs && params.minOpShifts === DEFAULTS.minOpShifts;

  if (!force && usingDefaults) {
    const cached = await kv.get(CACHE_KEY);
    if (cached) return { ...cached, cached: true };
  }

  const { rows, totalBytesProcessed } = await bqQuery(
    opSignalsSQL(params.days, params.minShiftMsgs, params.minOpShifts),
    { maxBytesBilled: 8 * 1024 * 1024 * 1024 }
  );
  const built = buildProfiles(rows);
  const payload = {
    version: OPERATOR_SIGNALS_VERSION,
    params,
    ...built,
    bytes_processed: totalBytesProcessed,
    generated_at: new Date().toISOString(),
  };
  if (usingDefaults) await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL });
  return { ...payload, cached: false };
}

export { bigQueryConfigured };
