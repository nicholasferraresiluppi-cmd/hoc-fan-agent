/**
 * HOC Fan Agent — Coaching Center logic.
 *
 * Identifica operatori con margini di crescita (Weak/Average con score affidabile)
 * e suggerisce un percorso di coaching mirato, matchando il loro pattern di debolezza
 * con un training scenario dell'Academy esistente.
 *
 * Filosofia: parallelo all'Action Center.
 *   Action Center → "chi sostituire" (Critical, score ≤25)
 *   Coaching Center → "chi può crescere" (Weak/Average, 25 < score ≤ 50, dati affidabili,
 *     pattern leggibile)
 *
 * Output per candidato:
 *   - punto debole identificato (creator dove score locale è più basso)
 *   - pattern detection (CP vs Infloww, polarizzazione tra creator, ecc.)
 *   - training scenario suggerito (categoria dall'Academy)
 *   - owner suggerito (Team Lead della creator principale — futuro)
 *
 * Storage: cp:coaching:assignments:{periodId} → { employee: {trainingCategoryId, owner, status, assignedAt, deadline, note} }
 */
import { buildCreatorMatrix } from "./creator-aggregates";

/**
 * Match pattern → training category dell'Academy.
 * Versione v1 semplice; può evolvere quando arrivano altri segnali (Infloww breakdown, ecc.).
 */
const PATTERN_TO_TRAINING = {
  // CP score basso ma Infloww alto: il chatter chatta bene ma converte male in $
  "low_conversion": {
    categoryId: "custom-e-upsell",
    categoryName: "Custom & Upsell",
    rationale: "Bravo in chat (Infloww alto) ma non converte in sales (CP basso) → focus closing / PPV / customs",
  },
  // Score CP basso, performance simile su tutte le creator → mancanza di basi
  "uniform_low": {
    categoryId: "le-basi-della-chat",
    categoryName: "Le Basi della Chat",
    rationale: "Performance uniformemente sotto media → ripasso fondamentali: opening, tono, anti-spam",
  },
  // Forte su una creator, debole su altra → mancanza di adattabilità
  "polarized_creators": {
    categoryId: "mass-e-conversione",
    categoryName: "Mass & Conversione",
    rationale: "Performance polarizzata tra creator (forte su una, debole su altra) → migliorare adattabilità tono e mass mirate",
  },
  // Score basso ma con dati limitati / specializzato → potrebbe servire respiro
  "low_volume_specialist": {
    categoryId: "recuperi-e-retention",
    categoryName: "Recuperi & Retention",
    rationale: "Pochi shift ma su poche creator: lavoro sulla profondità della relazione coi fan esistenti",
  },
  // Fallback
  "general": {
    categoryId: "le-basi-della-chat",
    categoryName: "Le Basi della Chat",
    rationale: "Pattern non univoco — ripasso fondamentali come base sicura",
  },
};

/**
 * Identifica il pattern di debolezza di un operatore dato il suo cells (matrix[op]) e
 * lo score Infloww corrente (se disponibile).
 */
function detectPattern(opCells, opScore, inflowwScore) {
  const reliableCells = Object.values(opCells).filter((c) => !c.low_confidence && c.score != null);
  if (reliableCells.length === 0) return "general";

  const scores = reliableCells.map((c) => c.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const spread = maxScore - minScore;

  // CP basso + Infloww alto → conversion gap
  if (opScore != null && inflowwScore != null && (inflowwScore - opScore) > 15) {
    return "low_conversion";
  }

  // Spread ampio tra celle → polarizzato
  if (spread >= 25 && reliableCells.length >= 2) {
    return "polarized_creators";
  }

  // Pochi creator, score basso → specialist con calo
  if (reliableCells.length <= 2 && opScore < 40) {
    return "low_volume_specialist";
  }

  // Default uniforme basso
  if (spread < 15) return "uniform_low";

  return "general";
}

/**
 * Costruisce la lista candidati Coaching per il periodo.
 *
 * Criteri:
 *   - Score CP tra COACHING_MIN (incluso) e COACHING_MAX (escluso): default 25 < s ≤ 50
 *   - reliable_creators_count >= 1 (almeno una creator con dati affidabili)
 *   - non già marcato "completed" o "rejected" nelle assignments del periodo
 *
 * @param {string} periodId
 * @param {object} [opts]
 * @param {number} [opts.minScore=25] estremo inferiore esclusivo
 * @param {number} [opts.maxScore=50] estremo superiore inclusivo (sotto Good)
 * @param {Map<string, number>} [opts.inflowwScoreByEmployee] mappa Infloww score per employee, opzionale
 * @returns {Promise<Array>} candidati ordinati per score (i più bassi prima)
 */
export async function buildCoachingCandidates(periodId, opts = {}) {
  const { minScore = 25, maxScore = 50, inflowwScoreByEmployee = new Map() } = opts;
  const { matrix, creators, operators } = await buildCreatorMatrix(periodId);

  const candidates = [];
  for (const [employee, op] of Object.entries(operators)) {
    if (op.score == null) continue;
    if (op.score <= minScore || op.score > maxScore) continue;
    if ((op.reliable_creators_count || 0) === 0) continue;

    const opCells = matrix[employee] || {};
    const inflowwScore = inflowwScoreByEmployee.get(employee) ?? null;

    // Pattern detection
    const pattern = detectPattern(opCells, op.score, inflowwScore);
    const training = PATTERN_TO_TRAINING[pattern] || PATTERN_TO_TRAINING.general;

    // Punto debole: la creator con score locale più basso (tra le reliable)
    const reliableCellEntries = Object.entries(opCells).filter(([, c]) => !c.low_confidence && c.score != null);
    let weakestCreator = null;
    let weakestScore = Infinity;
    for (const [cr, c] of reliableCellEntries) {
      if (c.score < weakestScore) { weakestScore = c.score; weakestCreator = cr; }
    }

    // Punto di forza: la creator con score locale più alto
    let strongestCreator = null;
    let strongestScore = -Infinity;
    for (const [cr, c] of reliableCellEntries) {
      if (c.score > strongestScore) { strongestScore = c.score; strongestCreator = cr; }
    }

    candidates.push({
      employee,
      score: op.score,
      tier: op.tier,
      total_sales: op.total_sales,
      total_creators: op.total_creators,
      reliable_creators_count: op.reliable_creators_count,
      top_creator: op.top_creator,
      weakest_creator: weakestCreator,
      weakest_creator_score: weakestCreator ? Math.round(weakestScore * 10) / 10 : null,
      strongest_creator: strongestCreator,
      strongest_creator_score: strongestCreator ? Math.round(strongestScore * 10) / 10 : null,
      infloww_score: inflowwScore,
      pattern,
      training,
    });
  }

  // Ordina per score crescente: chi è più vicino a Critical riceve attenzione prima
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

export const COACHING_DEFAULTS = { minScore: 25, maxScore: 50 };
export { PATTERN_TO_TRAINING };
