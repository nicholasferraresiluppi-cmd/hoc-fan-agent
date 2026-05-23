/**
 * HOC Fan Agent — CreatorsPro score calculation.
 *
 * Score 0-100 per ogni operatore basato sui KPI CP (sales/shift, sales/hour,
 * volume, consistency, margin). Stessa logica di normalize+sum della
 * leaderboard operativa Infloww ma con KPI diversi.
 *
 * Funziona solo per operatori con almeno 1 shift CP nel periodo. Per gli
 * altri ritorna { score: null, _excluded_reason: "no_cp_data" }.
 */

/**
 * Pesi default. Somma = 1.00.
 * Configurabili in futuro via KV se vorrai una pagina admin dedicata.
 */
export const KPI_WEIGHTS_CP = {
  sales_per_shift: 0.35,    // efficienza per turno
  sales_per_hour: 0.25,     // efficienza oraria
  shift_volume: 0.15,       // quanti shift fa
  consistency: 0.15,        // bassa volatilità tra shift
  margin: 0.10,             // sales / wage agency
};

/**
 * Tier riusati dalla operativa (Critical → Elite).
 */
export const SCORE_TIERS_CP = [
  { label: "Critical", min: 0,  max: 50.99, color: "#D44545" },
  { label: "Weak",     min: 51, max: 60.99, color: "#E76F51" },
  { label: "Average",  min: 61, max: 70.99, color: "#B89158" },
  { label: "Good",     min: 71, max: 80.99, color: "#D4AF7A" },
  { label: "Strong",   min: 81, max: 90.99, color: "#3FB97E" },
  { label: "Elite",    min: 91, max: 100,   color: "#4F8CCB" },
];

/**
 * Soglie di normalizzazione (stesso pattern operativa).
 *  - score 0   se valore <= mean * 0.75
 *  - score 20  se valore <  mean * 0.90
 *  - score 40  se valore <  mean
 *  - score 60  se valore <  mean * 1.10
 *  - score 80  se valore <  mean * 1.25
 *  - score 100 altrimenti
 */
const THRESHOLDS = [
  { multiplier: 0.75, score: 0 },
  { multiplier: 0.90, score: 20 },
  { multiplier: 1.00, score: 40 },
  { multiplier: 1.10, score: 60 },
  { multiplier: 1.25, score: 80 },
];

function normalizeKpi(value, mean) {
  if (typeof value !== "number" || value <= 0) return 0;
  if (typeof mean !== "number" || mean <= 0) return 0;
  for (const t of THRESHOLDS) {
    if (value < mean * t.multiplier) return t.score;
  }
  return 100;
}

function assignTier(score, tiers = SCORE_TIERS_CP) {
  if (typeof score !== "number") return null;
  for (const t of tiers) {
    if (score >= t.min && score <= t.max) return t.label;
  }
  return null;
}

/**
 * Calcola consistency score da un array di shift values.
 * Usa coefficient of variation (stddev/mean): bassa CV = alta consistency.
 * Ritorna un valore 0..1 dove 1 = perfettamente costante.
 */
function calcConsistency(shiftValues) {
  if (!shiftValues || shiftValues.length < 2) return 0.5; // troppo pochi shift per misurare
  const positives = shiftValues.filter((v) => typeof v === "number" && v > 0);
  if (positives.length < 2) return 0;
  const mean = positives.reduce((a, b) => a + b, 0) / positives.length;
  if (mean <= 0) return 0;
  const variance = positives.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positives.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;
  // Map cv → consistency: cv=0 → 1.0, cv=1 → 0.0, oltre 1 → ~0
  return Math.max(0, Math.min(1, 1 - cv));
}

/**
 * Calcola medie KPI per Group (per la normalizzazione).
 */
function groupMeansForCp(operators) {
  const byGroup = new Map();
  for (const op of operators) {
    if (!op.group || !op.has_cp_data) continue;
    if (!byGroup.has(op.group)) byGroup.set(op.group, []);
    byGroup.get(op.group).push(op);
  }
  const out = {};
  for (const [group, members] of byGroup.entries()) {
    out[group] = { _count: members.length };
    for (const kpi of Object.keys(KPI_WEIGHTS_CP)) {
      const vals = members.map((m) => m._kpis?.[kpi]).filter((v) => typeof v === "number" && v > 0);
      out[group][kpi] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }
  return out;
}

/**
 * Pipeline completa.
 *
 * @param {Array} operators  - array di { employee, group, has_cp_data, cp_aggregates? } dove
 *                             cp_aggregates = { total_sales, total_shifts, total_hours, total_wage, shifts_attributed[] }
 * @param {object} [settings] - { weights?, tiers? } sovrascrive default
 * @returns {object} { ranking, groupMeansCp }
 */
export function buildCpLeaderboard(operators, settings = {}) {
  const weights = settings.weights || KPI_WEIGHTS_CP;
  const tiers = settings.tiers || SCORE_TIERS_CP;

  // Step 1: calcola KPI per ogni operatore
  const withKpis = operators.map((op) => {
    if (!op.has_cp_data || !op.cp_aggregates) {
      return { ...op, _kpis: null };
    }
    const a = op.cp_aggregates;
    const shifts = a.total_shifts || 0;
    const hours = a.total_hours || 0;
    const sales = a.total_sales || 0;
    const wage = a.total_wage || 0;
    const shiftSales = Array.isArray(a.shifts_attributed) ? a.shifts_attributed : [];
    const kpis = {
      sales_per_shift: shifts > 0 ? sales / shifts : 0,
      sales_per_hour: hours > 0 ? sales / hours : 0,
      shift_volume: shifts,
      consistency: calcConsistency(shiftSales) * 100, // 0-100 scale per uniformare
      margin: wage > 0 ? sales / wage : 0,
    };
    return { ...op, _kpis: kpis };
  });

  // Step 2: medie Group
  const groupMeans = groupMeansForCp(withKpis);

  // Step 3: score per operatore
  const scored = withKpis.map((op) => {
    if (!op._kpis) {
      return { ...op, score: null, tier: null, points_breakdown: null, _excluded_reason: "no_cp_data" };
    }
    const gm = groupMeans[op.group];
    if (!gm) {
      return { ...op, score: 0, tier: assignTier(0, tiers), _excluded_reason: "no_group_data" };
    }
    let score = 0;
    const points = {};
    for (const [kpi, weight] of Object.entries(weights)) {
      const norm = normalizeKpi(op._kpis[kpi], gm[kpi]);
      points[kpi] = norm;
      score += norm * weight;
    }
    score = Math.round(score * 100) / 100;
    return { ...op, score, tier: assignTier(score, tiers), points_breakdown: points, group_means_cp: gm, _kpis_cp: op._kpis };
  });

  // Step 4: sort + rank
  scored.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  let rank = 1;
  for (const r of scored) {
    if (r.score !== null && r.score > 0) r.rank = rank++;
    else r.rank = null;
  }
  return { ranking: scored, groupMeansCp: groupMeans };
}
