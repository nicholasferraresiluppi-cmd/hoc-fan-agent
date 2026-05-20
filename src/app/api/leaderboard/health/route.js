/**
 * GET /api/leaderboard/health
 *
 * Health bar globale: trend dello score medio dell'agenzia + distribuzione
 * tier negli ultimi N periodi. Usato dalla leaderboard operativa per
 * rispondere alle domande "stiamo alzando la media?" e "la qualità sale?".
 *
 * Visibilità: tutti gli operatori autenticati.
 *
 * Query params:
 *   ?period_type=monthly|weekly|quarterly  (default: monthly)
 *   ?limit=12                              (default 12, max 36)
 *
 * Response:
 *   {
 *     period_type,
 *     history: [ { period_id, avg_score, eligible, elite_strong, critical_weak, tier_counts } ],
 *     summary: { current, previous, delta_avg, delta_quality }
 *   }
 */
import { auth } from "@clerk/nextjs/server";
import { loadGlobalHealthHistory } from "@/lib/leaderboard-history";

const VALID_PERIOD_TYPES = ["monthly", "weekly", "quarterly"];

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const period_type = url.searchParams.get("period_type") || "monthly";
  const limit = Math.max(2, Math.min(36, parseInt(url.searchParams.get("limit") || "12", 10)));

  if (!VALID_PERIOD_TYPES.includes(period_type)) {
    return Response.json({ error: `period_type must be one of: ${VALID_PERIOD_TYPES.join(", ")}` }, { status: 400 });
  }

  const history = await loadGlobalHealthHistory({ periodType: period_type, limit });

  if (history.length === 0) {
    return Response.json({ period_type, history: [], summary: null });
  }

  // Summary: current vs previous (ultimo vs penultimo)
  const current = history[history.length - 1];
  const previous = history.length > 1 ? history[history.length - 2] : null;
  const summary = previous
    ? {
        current,
        previous,
        delta_avg: Math.round((current.avg_score - previous.avg_score) * 10) / 10,
        delta_quality: (current.elite_strong - current.critical_weak) - (previous.elite_strong - previous.critical_weak),
        delta_eligible: current.eligible - previous.eligible,
      }
    : { current, previous: null, delta_avg: 0, delta_quality: 0, delta_eligible: 0 };

  return Response.json({ period_type, history, summary });
}
