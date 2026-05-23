/**
 * HOC Fan Agent — Closed-loop metrics.
 *
 * Le tre metriche aggregate che certificano se il ciclo Misura → Diagnostica
 * → Agisci sta effettivamente migliorando l'agency, o se stiamo solo cambiando
 * facce nelle stesse posizioni.
 *
 *   1. coachingEffectiveness  — % operatori che dopo un coaching hanno migliorato
 *      lo score nel periodo successivo
 *   2. swapSuccessRate        — % sostituzioni HR che hanno generato un operatore
 *      Good+ sulla creator originale
 *   3. agencyScoreTrend       — variazione score medio agency vs periodo precedente
 *
 * Tutte richiedono storia: senza almeno 2 periodi consecutivi sincronizzati
 * non si possono calcolare. Restituiscono `null` con `reason` se i dati mancano.
 */
import { kv } from "@vercel/kv";
import { buildCreatorMatrix } from "./creator-aggregates";

function prevPeriod(periodId) {
  const [y, m] = periodId.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function hasCpDataForPeriod(periodId) {
  const wages = await kv.get(`cp:wages:${periodId}`);
  return Array.isArray(wages) && wages.length > 0;
}

/**
 * Coaching effectiveness: per il periodo dato, guarda le coaching assignments
 * COMPLETATE nel mese precedente, recupera lo score di allora vs lo score di
 * ora, conta quante sono migliorate di ≥5 punti.
 *
 * @param {string} periodId - es. "2026-05" (il "mese di adesso")
 * @returns {Promise<{rate, sample, improved, total, reason?}>}
 */
export async function computeCoachingEffectiveness(periodId) {
  const prev = prevPeriod(periodId);
  const [prevAssigns, currOk, prevOk] = await Promise.all([
    kv.get(`coaching_center:assignments:${prev}`),
    hasCpDataForPeriod(periodId),
    hasCpDataForPeriod(prev),
  ]);

  if (!currOk || !prevOk) {
    return { rate: null, sample: 0, improved: 0, total: 0, reason: "no_history" };
  }
  const completed = Object.entries(prevAssigns || {}).filter(([, a]) => a.status === "completed");
  if (completed.length === 0) {
    return { rate: null, sample: 0, improved: 0, total: 0, reason: "no_completed_coaching" };
  }

  const [prevMatrix, currMatrix] = await Promise.all([
    buildCreatorMatrix(prev),
    buildCreatorMatrix(periodId),
  ]);

  let improved = 0;
  let total = 0;
  for (const [employee] of completed) {
    const prevOp = prevMatrix.operators?.[employee];
    const currOp = currMatrix.operators?.[employee];
    if (prevOp?.score == null || currOp?.score == null) continue;
    total++;
    if (currOp.score - prevOp.score >= 5) improved++;
  }

  return {
    rate: total > 0 ? Math.round((improved / total) * 100) : null,
    sample: completed.length,
    improved,
    total,
    reason: total === 0 ? "no_paired_scores" : null,
  };
}

/**
 * Swap success rate: per il periodo dato, guarda gli swap del mese precedente
 * marcati "ready_for_hr" con un swap_with definito. Conta quante volte il
 * sostituto sceltro nel periodo corrente ha score ≥50 (Good+) sulla creator
 * principale dell'operatore originale.
 */
export async function computeSwapSuccessRate(periodId) {
  const prev = prevPeriod(periodId);
  const [prevSwaps, currOk, prevOk] = await Promise.all([
    kv.get(`action_center:swaps:${prev}`),
    hasCpDataForPeriod(periodId),
    hasCpDataForPeriod(prev),
  ]);

  if (!currOk || !prevOk) {
    return { rate: null, sample: 0, success: 0, total: 0, reason: "no_history" };
  }
  const swaps = Object.entries(prevSwaps || {}).filter(([, s]) => (s.status === "ready_for_hr" || s.status === "marked") && s.swap_with);
  if (swaps.length === 0) {
    return { rate: null, sample: 0, success: 0, total: 0, reason: "no_swaps_with_replacement" };
  }

  const [prevMatrix, currMatrix] = await Promise.all([
    buildCreatorMatrix(prev),
    buildCreatorMatrix(periodId),
  ]);

  let success = 0;
  let total = 0;
  for (const [originalOp, swap] of swaps) {
    const prevTopCreator = prevMatrix.operators?.[originalOp]?.top_creator;
    if (!prevTopCreator) continue;
    const swapWith = swap.swap_with;
    const swapCells = currMatrix.matrix?.[swapWith] || {};
    const cellOnCreator = swapCells[prevTopCreator];
    total++;
    if (cellOnCreator && cellOnCreator.score != null && cellOnCreator.score >= 50) {
      success++;
    }
  }

  return {
    rate: total > 0 ? Math.round((success / total) * 100) : null,
    sample: swaps.length,
    success,
    total,
    reason: total === 0 ? "no_paired_data" : null,
  };
}

/**
 * Agency score trend: differenza score medio agency tra periodo corrente
 * e periodo precedente (mese su mese).
 */
export async function computeAgencyScoreTrend(periodId) {
  const prev = prevPeriod(periodId);
  const [currOk, prevOk] = await Promise.all([
    hasCpDataForPeriod(periodId),
    hasCpDataForPeriod(prev),
  ]);
  if (!currOk || !prevOk) {
    return { delta: null, current: null, previous: null, reason: "no_history" };
  }

  const [currMatrix, prevMatrix] = await Promise.all([
    buildCreatorMatrix(periodId),
    buildCreatorMatrix(prev),
  ]);

  const avg = (ops) => {
    const scores = Object.values(ops || {}).map((o) => o.score).filter((s) => s != null && s > 0);
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  };

  const current = avg(currMatrix.operators);
  const previous = avg(prevMatrix.operators);
  if (current == null || previous == null) {
    return { delta: null, current, previous, reason: "no_scores" };
  }

  return {
    delta: Math.round((current - previous) * 10) / 10,
    current,
    previous,
    reason: null,
  };
}

/**
 * Bundle delle 3 metriche in una sola chiamata.
 */
export async function computeClosedLoopMetrics(periodId) {
  const [coaching, swaps, trend] = await Promise.all([
    computeCoachingEffectiveness(periodId),
    computeSwapSuccessRate(periodId),
    computeAgencyScoreTrend(periodId),
  ]);
  return { coaching, swaps, trend, period_id: periodId };
}
