/**
 * HOC Fan Agent — Creator-first aggregations from CP shifts.
 *
 * Inverte la prospettiva CP: invece di aggregare per operatore, aggrega per
 * CREATOR. Sblocca:
 *   - Leaderboard "team più redditizio per creator X"
 *   - Heat-map operator × creator (score per coppia)
 *   - Match suggestions ("Achraf rende +23% su Bianca vs media sue creator")
 *   - Score aggregato operatore = media pesata dei suoi (op×creator) score
 *
 * v3 SCORE (Maggio 2026) — refactor da feedback Nicholas:
 *   - Niente più benchmark per Group (Opzione A ci dà attribuzione esatta)
 *   - KPI: 85% sales/shift + 15% consistency (no hour, no volume)
 *   - score(op, creator) = 0.7 × percentile_vs_creator_cohort
 *                        + 0.3 × percentile_vs_agency
 *   - Min 3 shift sulla creator → score = null ("—")
 *   - Tier percentile-based (Elite=top 10%, Strong=top 25%, Good=top 50%,
 *     Average=top 75%, Weak=top 90%, Critical=bottom 10%)
 *
 * Le ore extra sono info contestuale UI (rimangono in cell.hours) ma NON
 * entrano nello score: il modello mentale Nicholas è "tutti fanno shift,
 * a volte estesi" → lo shift è l'unità atomica.
 */
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
 * Bucketize orario in fascia oraria.
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

/* =================================================
 * Score helpers (v3)
 * ================================================= */

/**
 * Consistency da array di shift values: 1 - coefficient_of_variation, in 0..1.
 * Bassa CV (uniforme tra shift) = alta consistency.
 */
function consistencyScore(values) {
  if (!values || values.length < 2) return 0.5; // troppo pochi shift → neutro
  const positives = values.filter((v) => typeof v === "number" && v > 0);
  if (positives.length < 2) return 0;
  const mean = positives.reduce((a, b) => a + b, 0) / positives.length;
  if (mean <= 0) return 0;
  const variance = positives.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positives.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;
  return Math.max(0, Math.min(1, 1 - cv));
}

/**
 * Percentile rank di `value` in `sortedAsc` (0..100).
 * Usa "average rank" per gestire i tie. Se sortedAsc.length < 2 ritorna 50.
 */
function percentileRank(value, sortedAsc) {
  if (!sortedAsc || sortedAsc.length === 0) return 50;
  if (sortedAsc.length === 1) return 50;
  // Conta quanti sono <= value, dando mezzo punto ai tie (standard PR formula)
  let countBelow = 0;
  let countEqual = 0;
  for (const v of sortedAsc) {
    if (v < value) countBelow++;
    else if (v === value) countEqual++;
  }
  const pr = ((countBelow + countEqual * 0.5) / sortedAsc.length) * 100;
  return Math.max(0, Math.min(100, Math.round(pr)));
}

/**
 * Tier percentile-based (v3).
 *
 *   ≥ 90  Elite     (top 10%)
 *   ≥ 75  Strong    (top 25%)
 *   ≥ 50  Good      (top 50%)
 *   ≥ 25  Average   (top 75%)
 *   ≥ 10  Weak      (top 90%)
 *   <  10 Critical  (bottom 10%)
 */
export function tierFromPercentile(p) {
  if (typeof p !== "number") return null;
  if (p >= 90) return "Elite";
  if (p >= 75) return "Strong";
  if (p >= 50) return "Good";
  if (p >= 25) return "Average";
  if (p >= 10) return "Weak";
  return "Critical";
}

export const MIN_SHIFTS_RELIABLE = 3;
export const SCORE_WEIGHTS = { sales_per_shift: 0.85, consistency: 0.15 };
export const SCORE_BLEND = { vs_creator: 0.7, vs_agency: 0.3 };

/* =================================================
 * Shift attribution (Opzione A)
 * ================================================= */

/**
 * Distribuisce le metriche di uno shift tra i suoi associatedCreators.
 *
 *   - Se lo shift ha `takes[]` con creator_alias + amount → attribuzione esatta.
 *   - Fallback (sync vecchi senza takes): split equo 50/50.
 */
function distributeShift(shift) {
  const creators = (shift.creator_aliases || []).filter(Boolean);
  if (creators.length === 0) return [];
  const interval = shift.interval_bucket || bucket(shift.started_at);
  const totalSales = shift.total_attributed || 0;
  const totalHours = shift.worked_hours || 0;
  const totalEarnings = shift.total_earnings || 0;

  const takes = Array.isArray(shift.takes) ? shift.takes : [];
  const validTakes = takes.filter((t) => t && t.creator_alias && (t.amount || 0) > 0);
  if (validTakes.length > 0) {
    const byCreator = {};
    let totalTakeAmount = 0;
    for (const t of validTakes) {
      byCreator[t.creator_alias] = (byCreator[t.creator_alias] || 0) + t.amount;
      totalTakeAmount += t.amount;
    }
    for (const alias of creators) {
      if (!(alias in byCreator)) byCreator[alias] = 0;
    }
    const aliases = Object.keys(byCreator);
    return aliases.map((alias) => {
      const shareSales = totalTakeAmount > 0 ? byCreator[alias] / totalTakeAmount : 0;
      return {
        creator: alias,
        sales: byCreator[alias],
        hours: totalHours * shareSales,
        earnings: totalEarnings * shareSales,
        interval,
        started_at: shift.started_at,
        shift_count_share: shareSales,
        shift_sales: byCreator[alias], // singolo valore shift per consistency
        estimated: false,
        exact_attribution: true,
        multi_creator: aliases.length > 1,
      };
    });
  }

  // Fallback: split equo
  const share = 1 / creators.length;
  return creators.map((alias) => ({
    creator: alias,
    sales: totalSales * share,
    hours: totalHours * share,
    earnings: totalEarnings * share,
    interval,
    started_at: shift.started_at,
    shift_count_share: share,
    shift_sales: totalSales * share,
    estimated: creators.length > 1,
    exact_attribution: false,
    multi_creator: creators.length > 1,
  }));
}

/* =================================================
 * Build matrix + scoring
 * ================================================= */

/**
 * Matrice operator × creator + aggregati per creator e per operatore.
 *
 * Output:
 *   {
 *     matrix: { [opName]: { [creator]: cell } },
 *     creators: { [creator]: creatorAgg },
 *     operators: { [opName]: opAgg }  ← include score aggregato pesato
 *   }
 */
export async function buildCreatorMatrix(periodId) {
  const ck = `_matrix_v3:${periodId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;

  const opIdx = await indexWagesByInflowwName(periodId);
  const matrix = {};
  const creators = {};

  // Step 1: distribuzione shift → matrix + creator aggregates
  for (const [opName, agg] of Object.entries(opIdx)) {
    for (const shift of agg.shifts || []) {
      const distribs = distributeShift(shift);
      for (const d of distribs) {
        if (!matrix[opName]) matrix[opName] = {};
        if (!matrix[opName][d.creator]) {
          matrix[opName][d.creator] = {
            sales: 0, hours: 0, shifts: 0,
            shift_sales_values: [], // per consistency calc
            interval_sales: { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 },
            shift_mono_count: 0,
            shift_split_count: 0,
            shift_exact_count: 0,
          };
        }
        const cell = matrix[opName][d.creator];
        cell.sales += d.sales;
        cell.hours += d.hours;
        cell.shifts += d.shift_count_share;
        cell.shift_sales_values.push(d.shift_sales);
        if (d.exact_attribution && d.multi_creator) cell.shift_exact_count += 1;
        else if (d.estimated) cell.shift_split_count += 1;
        else cell.shift_mono_count += 1;
        if (d.interval) cell.interval_sales[d.interval] += d.sales;

        if (!creators[d.creator]) creators[d.creator] = {
          alias: d.creator,
          total_sales: 0, total_hours: 0, total_shifts: 0,
          operators_count: 0, _operators_set: new Set(),
          interval_sales: { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 },
          top_operator: null,
        };
        creators[d.creator].total_sales += d.sales;
        creators[d.creator].total_hours += d.hours;
        creators[d.creator].total_shifts += d.shift_count_share;
        creators[d.creator]._operators_set.add(opName);
        if (d.interval) creators[d.creator].interval_sales[d.interval] += d.sales;
      }
    }
  }

  // Step 2: derivati per cella
  for (const op of Object.keys(matrix)) {
    for (const cr of Object.keys(matrix[op])) {
      const cell = matrix[op][cr];
      cell.sales = Math.round(cell.sales * 100) / 100;
      cell.hours = Math.round(cell.hours * 10) / 10;
      cell.shifts = Math.round(cell.shifts * 10) / 10;
      cell.sales_per_shift = cell.shifts > 0 ? Math.round((cell.sales / cell.shifts) * 100) / 100 : 0;
      cell.sales_per_hour = cell.hours > 0 ? Math.round((cell.sales / cell.hours) * 100) / 100 : 0;
      cell.consistency = consistencyScore(cell.shift_sales_values);
      const totalEvents = cell.shift_mono_count + cell.shift_split_count + cell.shift_exact_count;
      cell.shift_events_total = totalEvents;
      cell.exact_pct = totalEvents > 0 ? Math.round(((cell.shift_mono_count + cell.shift_exact_count) / totalEvents) * 100) : 0;
      cell.split_pct = totalEvents > 0 ? Math.round((cell.shift_split_count / totalEvents) * 100) : 0;
      cell.low_confidence = totalEvents < MIN_SHIFTS_RELIABLE;
    }
  }

  // Step 3: aggregati creator
  for (const [alias, c] of Object.entries(creators)) {
    c.total_sales = Math.round(c.total_sales);
    c.total_hours = Math.round(c.total_hours * 10) / 10;
    c.total_shifts = Math.round(c.total_shifts * 10) / 10;
    c.operators_count = c._operators_set.size;
    c.avg_sales_per_shift = c.total_shifts > 0 ? Math.round((c.total_sales / c.total_shifts) * 100) / 100 : 0;
    c.avg_sales_per_operator = c.operators_count > 0 ? Math.round(c.total_sales / c.operators_count) : 0;
    let topName = null, topSales = 0;
    for (const opName of Object.keys(matrix)) {
      const cell = matrix[opName][alias];
      if (cell && cell.sales > topSales) { topSales = cell.sales; topName = opName; }
    }
    c.top_operator = topName ? { name: topName, sales: Math.round(topSales) } : null;
    delete c._operators_set;
  }

  // Step 4: AGENCY-wide cohort di sales/shift (per percentile_vs_agency)
  // Considera SOLO celle "reliable" (≥3 shift events) per evitare rumore
  const agencyValues = [];
  for (const op of Object.keys(matrix)) {
    for (const cr of Object.keys(matrix[op])) {
      const cell = matrix[op][cr];
      if (!cell.low_confidence && cell.sales_per_shift > 0) {
        agencyValues.push(cell.sales_per_shift);
      }
    }
  }
  agencyValues.sort((a, b) => a - b);

  // Step 5: per ogni creator, cohort di sales/shift dei suoi operatori reliable
  const creatorCohorts = {};
  for (const op of Object.keys(matrix)) {
    for (const cr of Object.keys(matrix[op])) {
      const cell = matrix[op][cr];
      if (cell.low_confidence || cell.sales_per_shift <= 0) continue;
      if (!creatorCohorts[cr]) creatorCohorts[cr] = [];
      creatorCohorts[cr].push(cell.sales_per_shift);
    }
  }
  for (const cr of Object.keys(creatorCohorts)) creatorCohorts[cr].sort((a, b) => a - b);

  // Step 6: SCORE per cella (formula v3)
  for (const op of Object.keys(matrix)) {
    for (const cr of Object.keys(matrix[op])) {
      const cell = matrix[op][cr];
      delete cell.shift_sales_values; // dropped da output (era solo per consistency)

      if (cell.low_confidence) {
        cell.score = null;
        cell.tier = null;
        cell.percentile_vs_creator = null;
        cell.percentile_vs_agency = null;
        continue;
      }

      // Percentile su sales/shift
      const pCreator = percentileRank(cell.sales_per_shift, creatorCohorts[cr] || []);
      const pAgency = percentileRank(cell.sales_per_shift, agencyValues);

      // Base SPS = blend dei due percentili
      const spsBlend = SCORE_BLEND.vs_creator * pCreator + SCORE_BLEND.vs_agency * pAgency;

      // Consistency normalizzata 0..100 (è già 0..1)
      const consPoints = cell.consistency * 100;

      // Score finale = 0.85 × SPS_blended + 0.15 × consistency
      const scoreRaw = SCORE_WEIGHTS.sales_per_shift * spsBlend
                     + SCORE_WEIGHTS.consistency * consPoints;

      cell.percentile_vs_creator = pCreator;
      cell.percentile_vs_agency = pAgency;
      cell.score = Math.round(scoreRaw * 10) / 10;
      cell.tier = tierFromPercentile(cell.score);
    }
  }

  // Step 7: SCORE AGGREGATO per operatore (media pesata su sales)
  const operators = {};
  for (const opName of Object.keys(matrix)) {
    const cells = Object.entries(matrix[opName]);
    const totalSales = cells.reduce((s, [, c]) => s + c.sales, 0);
    cells.sort((a, b) => b[1].sales - a[1].sales);
    const top = cells[0];

    // Media pesata su sales — solo celle con score (low_confidence escluse)
    let weightedSum = 0;
    let weightSum = 0;
    for (const [, c] of cells) {
      if (c.score == null) continue;
      weightedSum += c.score * c.sales;
      weightSum += c.sales;
    }
    const scoreAgg = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : null;

    operators[opName] = {
      total_sales: Math.round(totalSales),
      total_creators: cells.length,
      top_creator: top ? top[0] : null,
      top_creator_sales: top ? Math.round(top[1].sales) : 0,
      specialization_pct: totalSales > 0 && top ? Math.round((top[1].sales / totalSales) * 100) : 0,
      score: scoreAgg,
      tier: scoreAgg != null ? tierFromPercentile(scoreAgg) : null,
      reliable_creators_count: cells.filter(([, c]) => c.score != null).length,
    };
  }

  const result = { matrix, creators, operators };
  return cacheSet(ck, result);
}

/**
 * Drill-down per una singola creator: leaderboard interna + breakdown fasce.
 */
export async function getCreatorDrilldown(creatorAlias, periodId) {
  const { matrix, creators } = await buildCreatorMatrix(periodId);
  const creatorMeta = creators[creatorAlias];
  if (!creatorMeta) return { error: "creator non trovata", creatorAlias };

  const rows = [];
  for (const [opName, perCreator] of Object.entries(matrix)) {
    const cell = perCreator[creatorAlias];
    if (cell) {
      rows.push({
        employee: opName,
        sales: cell.sales,
        hours: cell.hours,
        shifts: cell.shifts,
        shift_mono_count: cell.shift_mono_count || 0,
        shift_exact_count: cell.shift_exact_count || 0,
        shift_split_count: cell.shift_split_count || 0,
        split_pct: cell.split_pct || 0,
        exact_pct: cell.exact_pct || 0,
        low_confidence: !!cell.low_confidence,
        sales_per_shift: cell.sales_per_shift,
        sales_per_hour: cell.sales_per_hour,
        consistency: cell.consistency,
        score: cell.score,
        tier: cell.tier,
        percentile_vs_creator: cell.percentile_vs_creator,
        percentile_vs_agency: cell.percentile_vs_agency,
        interval_sales: cell.interval_sales,
        sales_share_pct: creatorMeta.total_sales > 0
          ? Math.round((cell.sales / creatorMeta.total_sales) * 1000) / 10
          : 0,
      });
    }
  }
  rows.sort((a, b) => b.sales - a.sales);
  rows.forEach((r, i) => { r.rank = i + 1; });

  return { creator: creatorMeta, operators: rows };
}

/**
 * Match suggestions: identifica operatori che rendono molto di più su una
 * specifica creator rispetto alla loro media — candidati per specializzazione.
 *
 * Gap calcolato sulla differenza percentile_vs_creator: se l'operatore è
 * percentile 95 su 1 creator ma media 50 sulle altre → gap = 45.
 */
export async function computeMatchSuggestions(periodId, { minSalesThreshold = 1000, minScoreGap = 20, limit = 20 } = {}) {
  const { matrix, operators } = await buildCreatorMatrix(periodId);
  const suggestions = [];
  for (const [opName, perCreator] of Object.entries(matrix)) {
    const cells = Object.entries(perCreator).filter(([, c]) => c.score != null);
    if (cells.length < 2) continue;
    const totalOpSales = operators[opName]?.total_sales || 0;
    if (totalOpSales < minSalesThreshold) continue;

    const scores = cells.map(([cr, c]) => ({ creator: cr, score: c.score, sales: c.sales }));
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
        avg_score: Math.round(avg * 10) / 10,
        gap: Math.round(gap * 10) / 10,
        top_sales: top.sales,
        message: `${opName} ha score ${top.score} su ${top.creator} (avg suo: ${Math.round(avg)}, +${Math.round(gap)}). Considera specializzazione.`,
      });
    }
  }
  suggestions.sort((a, b) => b.gap - a.gap);
  return suggestions.slice(0, limit);
}
