/**
 * HOC Fan Agent — Creator-first aggregations from CP shifts.
 *
 * Funzioni server-only che invertono la prospettiva CP: invece di
 * aggregare per operatore, aggregano per CREATOR. Sblocca:
 *   - Leaderboard "team più redditizio per creator X"
 *   - Heat-map operator × creator (score per coppia)
 *   - Match suggestions ("Achraf rende +23% su Bianca vs media sue creator")
 *
 * Dipende da indexWagesByInflowwName() che ha già processato cp:wages:{period}
 * (vedi creatorspro-data.js). Riusa lo stesso pattern di cache 2-livelli.
 */
import { kv } from "@vercel/kv";
import { indexWagesByInflowwName } from "./creatorspro-data";

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > TTL_MS) { _cache.delete(key); return null; }
  return hit.v;
}
function cacheSet(key, v) { _cache.set(key, { v, t: Date.now() }); return v; }

/**
 * Bucketize orario in fascia (riprodotto qui per non importare da lib CP).
 */
function bucket(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const h = d.getUTCHours();
  if (h >= 2 && h < 6) return "After";
  if (h >= 6 && h < 12) return "Morning";
  if (h >= 12 && h < 18) return "Afternoon";
  if (h >= 18 && h < 22) return "Evening";
  return "Night";
}

/**
 * Distribuisce le metriche di uno shift tra i suoi associatedCreators.
 * Se mono-creator: tutto su quella. Se multi: split equo (proxy).
 */
function distributeShift(shift) {
  const creators = (shift.creator_aliases || []).filter(Boolean);
  if (creators.length === 0) return [];
  const share = 1 / creators.length;
  return creators.map((alias) => ({
    creator: alias,
    sales: (shift.total_attributed || 0) * share,
    hours: (shift.worked_hours || 0) * share,
    earnings: (shift.total_earnings || 0) * share,
    interval: shift.interval_bucket || bucket(shift.started_at),
    started_at: shift.started_at,
    shift_count_share: share, // per evitare di contare 2 volte lo stesso shift
    estimated: creators.length > 1,
  }));
}

/**
 * Matrice operator × creator. Per ogni coppia ritorna metriche aggregate
 * più score relativo (calcolato sui soli shift di quella coppia, normalizzato
 * vs la media di quella creator).
 *
 * Output:
 *   { matrix: { [operatorName]: { [creator]: { sales, hours, shifts, sales_per_shift, sales_per_hour, score, tier } } },
 *     creators: { [creator]: { total_sales, total_hours, total_shifts, operators_count, top_operator, avg_sales_per_shift, interval_sales } },
 *     operators: { [operatorName]: { total_sales, total_creators, top_creator, specialization_pct } } }
 */
export async function buildCreatorMatrix(periodId) {
  const ck = `_matrix:${periodId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const opIdx = await indexWagesByInflowwName(periodId);
  // matrix[operatorName][creator] = { sales, hours, shifts (proxy), shift_values: [singoli sales per consistency] }
  const matrix = {};
  // creators[alias] = { total_sales, ... }
  const creators = {};

  for (const [opName, agg] of Object.entries(opIdx)) {
    for (const shift of agg.shifts || []) {
      const distribs = distributeShift(shift);
      for (const d of distribs) {
        if (!matrix[opName]) matrix[opName] = {};
        if (!matrix[opName][d.creator]) {
          matrix[opName][d.creator] = {
            sales: 0, hours: 0, shifts: 0, shift_values: [], interval_sales: { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 },
          };
        }
        matrix[opName][d.creator].sales += d.sales;
        matrix[opName][d.creator].hours += d.hours;
        matrix[opName][d.creator].shifts += d.shift_count_share;
        matrix[opName][d.creator].shift_values.push(d.sales);
        // v2: traccia mono vs split per trasparenza UI
        if (!matrix[opName][d.creator].shift_split_count) matrix[opName][d.creator].shift_split_count = 0;
        if (!matrix[opName][d.creator].shift_mono_count) matrix[opName][d.creator].shift_mono_count = 0;
        if (d.estimated) matrix[opName][d.creator].shift_split_count += 1;
        else matrix[opName][d.creator].shift_mono_count += 1;
        if (d.interval) matrix[opName][d.creator].interval_sales[d.interval] = (matrix[opName][d.creator].interval_sales[d.interval] || 0) + d.sales;

        if (!creators[d.creator]) creators[d.creator] = {
          alias: d.creator,
          total_sales: 0, total_hours: 0, total_shifts: 0,
          operators_count: 0, _operators_set: new Set(),
          shift_values: [],
          interval_sales: { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 },
          top_operator: null, _top_sales: 0,
        };
        creators[d.creator].total_sales += d.sales;
        creators[d.creator].total_hours += d.hours;
        creators[d.creator].total_shifts += d.shift_count_share;
        creators[d.creator]._operators_set.add(opName);
        creators[d.creator].shift_values.push(d.sales);
        if (d.interval) creators[d.creator].interval_sales[d.interval] += d.sales;
      }
    }
  }

  // Calcolo derivati per ogni (op, creator)
  for (const op of Object.keys(matrix)) {
    for (const cr of Object.keys(matrix[op])) {
      const cell = matrix[op][cr];
      cell.sales = Math.round(cell.sales * 100) / 100;
      cell.hours = Math.round(cell.hours * 10) / 10;
      cell.shifts = Math.round(cell.shifts * 10) / 10;
      cell.sales_per_shift = cell.shifts > 0 ? Math.round((cell.sales / cell.shifts) * 100) / 100 : 0;
      cell.sales_per_hour = cell.hours > 0 ? Math.round((cell.sales / cell.hours) * 100) / 100 : 0;
    }
  }

  // Aggregati creator + top_operator
  for (const [alias, c] of Object.entries(creators)) {
    c.total_sales = Math.round(c.total_sales);
    c.total_hours = Math.round(c.total_hours * 10) / 10;
    c.total_shifts = Math.round(c.total_shifts * 10) / 10;
    c.operators_count = c._operators_set.size;
    c.avg_sales_per_shift = c.total_shifts > 0 ? Math.round((c.total_sales / c.total_shifts) * 100) / 100 : 0;
    c.avg_sales_per_operator = c.operators_count > 0 ? Math.round(c.total_sales / c.operators_count) : 0;
    // top operator: chi ha sales massime su questa creator
    let topName = null, topSales = 0;
    for (const opName of Object.keys(matrix)) {
      const cell = matrix[opName][alias];
      if (cell && cell.sales > topSales) { topSales = cell.sales; topName = opName; }
    }
    c.top_operator = topName ? { name: topName, sales: Math.round(topSales) } : null;
    delete c._operators_set;
    delete c._top_sales;
    delete c.shift_values; // dropped per ridurre payload
  }

  // Score relativo per ogni cella: normalize sales_per_shift vs media della creator
  // v2: aggiunto low_confidence flag se total_shifts < 3 (poco affidabile statisticamente)
  // v2: split_pct = % dei suoi shift che sono multi-creator (split equo)
  const MIN_SHIFTS_RELIABLE = 3;
  for (const op of Object.keys(matrix)) {
    for (const cr of Object.keys(matrix[op])) {
      const cell = matrix[op][cr];
      const creatorMean = creators[cr]?.avg_sales_per_shift || 0;
      const totalShiftEvents = (cell.shift_split_count || 0) + (cell.shift_mono_count || 0);
      cell.score_relative = creatorMean > 0
        ? Math.round((cell.sales_per_shift / creatorMean) * 100)
        : 0;
      cell.tier_relative = scoreTierFromRel(cell.score_relative);
      cell.low_confidence = totalShiftEvents < MIN_SHIFTS_RELIABLE;
      cell.split_pct = totalShiftEvents > 0
        ? Math.round((cell.shift_split_count / totalShiftEvents) * 100)
        : 0;
      delete cell.shift_values; // dropped da output
    }
  }

  // Per ogni operator: top_creator + specialization_pct
  const operators = {};
  for (const opName of Object.keys(matrix)) {
    const cells = Object.entries(matrix[opName]);
    const totalSales = cells.reduce((s, [, c]) => s + c.sales, 0);
    cells.sort((a, b) => b[1].sales - a[1].sales);
    const top = cells[0];
    operators[opName] = {
      total_sales: Math.round(totalSales),
      total_creators: cells.length,
      top_creator: top ? top[0] : null,
      top_creator_sales: top ? Math.round(top[1].sales) : 0,
      specialization_pct: totalSales > 0 && top ? Math.round((top[1].sales / totalSales) * 100) : 0,
    };
  }

  const result = { matrix, creators, operators };
  return cacheSet(ck, result);
}

function scoreTierFromRel(rel) {
  // rel = sales_per_shift / creator_mean × 100
  // 100 = media. >130 elite, 110-130 strong, 90-110 average, 70-90 weak, <70 critical
  if (rel >= 130) return "Elite";
  if (rel >= 110) return "Strong";
  if (rel >= 90) return "Average";
  if (rel >= 70) return "Weak";
  return "Critical";
}

/**
 * Drill-down per una singola creator: ritorna la sua leaderboard interna
 * (operatori ordinati per sales sulla creator) + breakdown fasce orarie.
 */
export async function getCreatorDrilldown(creatorAlias, periodId) {
  const { matrix, creators } = await buildCreatorMatrix(periodId);
  const creatorMeta = creators[creatorAlias];
  if (!creatorMeta) return { error: "creator non trovata", creatorAlias };

  // Operatori che hanno lavorato su questa creator, ordinati per sales
  const rows = [];
  for (const [opName, perCreator] of Object.entries(matrix)) {
    const cell = perCreator[creatorAlias];
    if (cell) {
      rows.push({
        employee: opName,
        sales: cell.sales,
        hours: cell.hours,
        shifts: cell.shifts,
        shift_split_count: cell.shift_split_count || 0,
        shift_mono_count: cell.shift_mono_count || 0,
        split_pct: cell.split_pct || 0,
        low_confidence: !!cell.low_confidence,
        sales_per_shift: cell.sales_per_shift,
        sales_per_hour: cell.sales_per_hour,
        score: cell.score_relative,
        tier: cell.tier_relative,
        interval_sales: cell.interval_sales,
        sales_share_pct: creatorMeta.total_sales > 0
          ? Math.round((cell.sales / creatorMeta.total_sales) * 1000) / 10
          : 0,
      });
    }
  }
  rows.sort((a, b) => b.sales - a.sales);
  rows.forEach((r, i) => { r.rank = i + 1; });

  return {
    creator: creatorMeta,
    operators: rows,
  };
}

/**
 * Match suggestions: identifica operatori che rendono molto di più su una
 * specifica creator rispetto alla loro media — candidati per "specializzazione".
 *
 * Soglia: differenza > 25 punti tra score_relative su top_creator vs media
 * score_relative dell'operatore su tutte le sue creator.
 */
export async function computeMatchSuggestions(periodId, { minSalesThreshold = 1000, minScoreGap = 25, limit = 20 } = {}) {
  const { matrix, creators, operators } = await buildCreatorMatrix(periodId);
  const suggestions = [];
  for (const [opName, perCreator] of Object.entries(matrix)) {
    const cells = Object.entries(perCreator);
    if (cells.length < 2) continue; // serve almeno 2 creator per confronto
    const totalOpSales = operators[opName]?.total_sales || 0;
    if (totalOpSales < minSalesThreshold) continue;

    const scores = cells.map(([cr, c]) => ({ creator: cr, score: c.score_relative, sales: c.sales }));
    scores.sort((a, b) => b.score - a.score);
    const top = scores[0];
    const avg = scores.reduce((s, x) => s + x.score, 0) / scores.length;
    const gap = top.score - avg;
    if (gap >= minScoreGap && top.sales >= 500) {
      suggestions.push({
        type: "specialization",
        employee: opName,
        top_creator: top.creator,
        top_score: top.score,
        avg_score: Math.round(avg),
        gap: Math.round(gap),
        top_sales: top.sales,
        message: `${opName} ha score ${top.score} su ${top.creator} (avg suo: ${Math.round(avg)}, +${Math.round(gap)} punti). Considera specializzazione`,
      });
    }
  }
  suggestions.sort((a, b) => b.gap - a.gap);
  return suggestions.slice(0, limit);
}
