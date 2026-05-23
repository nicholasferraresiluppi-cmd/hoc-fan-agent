/**
 * HOC Fan Agent — CreatorsPro score (v3).
 *
 * Lo score operatore NON è più calcolato vs media Group (v1/v2):
 * deriva dalla media pesata dei suoi score_per_creator (vedi
 * creator-aggregates.buildCreatorMatrix).
 *
 * Pipeline:
 *   1) buildCreatorMatrix(period) — già calcola score per ogni (op, creator) e
 *      aggrega in operators[opName].score (media pesata su sales).
 *   2) buildCpLeaderboard(operatorsInput, period) — combina i dati da matrix
 *      con quelli Infloww (group/category/language/infloww_kpis) e ritorna
 *      ranking ordinato per score.
 *
 * Tier (percentile-based, uguale a creator-aggregates):
 *   ≥90 Elite · ≥75 Strong · ≥50 Good · ≥25 Average · ≥10 Weak · <10 Critical
 *
 * Coerenza matematica: un operatore Elite a Sales CP è automaticamente Strong+
 * sulla maggior parte delle creator dove vende molto.
 */
import { buildCreatorMatrix, tierFromPercentile } from "./creator-aggregates";

export const SCORE_TIERS_CP = [
  { label: "Critical", min: 0,  max: 9.99,  color: "#EF4444" },
  { label: "Weak",     min: 10, max: 24.99, color: "#F59E0B" },
  { label: "Average",  min: 25, max: 49.99, color: "#9CA3AF" },
  { label: "Good",     min: 50, max: 74.99, color: "#10B981" },
  { label: "Strong",   min: 75, max: 89.99, color: "#3B82F6" },
  { label: "Elite",    min: 90, max: 100,   color: "#A855F7" },
];

/**
 * Build leaderboard CP partendo dagli operatori arricchiti (Infloww + CP).
 *
 * @param {Array} operators - oggetti con { employee, group, category, language,
 *                            has_cp_data, cp_aggregates, infloww_* }
 * @param {string} periodId - YYYY-MM, serve per pescare la matrix v3
 * @returns {Promise<{ranking, groupMeansCp}>}
 *
 * Nota: groupMeansCp è kept per backward compat ma è {} (non più calcolato).
 */
export async function buildCpLeaderboard(operators, periodId) {
  const { operators: opAgg } = await buildCreatorMatrix(periodId);

  // Step 1: merge — per ogni operator Infloww, pescare score aggregato da matrix
  const merged = operators.map((op) => {
    const fromMatrix = opAgg[op.employee];
    if (!fromMatrix) {
      // operatore non ha attribuzione su nessuna creator (no CP data)
      return {
        ...op,
        score: null, tier: null,
        _kpis_cp: null,
        cp_breakdown: null,
        _excluded_reason: op.has_cp_data ? "no_matrix_match" : "no_cp_data",
      };
    }
    if (fromMatrix.score == null) {
      // Ha dati CP ma sotto MIN_SHIFTS_RELIABLE su tutte le creator
      return {
        ...op,
        score: null, tier: null,
        _kpis_cp: deriveKpisFromAgg(op.cp_aggregates),
        cp_breakdown: {
          reliable_creators: 0,
          top_creator: fromMatrix.top_creator,
          total_creators: fromMatrix.total_creators,
        },
        _excluded_reason: "low_confidence_all_creators",
      };
    }
    return {
      ...op,
      score: fromMatrix.score,
      tier: fromMatrix.tier,
      _kpis_cp: deriveKpisFromAgg(op.cp_aggregates),
      cp_breakdown: {
        reliable_creators: fromMatrix.reliable_creators_count,
        total_creators: fromMatrix.total_creators,
        top_creator: fromMatrix.top_creator,
        top_creator_sales: fromMatrix.top_creator_sales,
        specialization_pct: fromMatrix.specialization_pct,
      },
    };
  });

  // Step 2: sort by score desc (null in fondo)
  merged.sort((a, b) => {
    if (a.score == null && b.score == null) return 0;
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score;
  });

  // Step 3: rank
  let rank = 1;
  for (const r of merged) {
    if (r.score != null && r.score > 0) r.rank = rank++;
    else r.rank = null;
  }

  return { ranking: merged, groupMeansCp: {} };
}

/**
 * Deriva i KPI semplici per la UI (sales/shift, sales/h) — informativi.
 * Lo score reale viene dalla matrix v3.
 */
function deriveKpisFromAgg(agg) {
  if (!agg) return null;
  const shifts = agg.total_shifts || 0;
  const hours = agg.total_hours || 0;
  const sales = agg.total_sales || 0;
  return {
    sales_per_shift: shifts > 0 ? Math.round((sales / shifts) * 100) / 100 : 0,
    sales_per_hour: hours > 0 ? Math.round((sales / hours) * 100) / 100 : 0,
  };
}

// Re-export per consumatori legacy
export { tierFromPercentile };
