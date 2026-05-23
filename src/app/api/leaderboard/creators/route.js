/**
 * GET /api/leaderboard/creators
 *
 * Lista creator con metriche aggregate dai dati CP (sales totale, # operatori,
 * top operator, avg sales/shift). Ordina by total_sales desc.
 *
 * Query:
 *   ?period_id=YYYY-MM    (required)
 *   ?include_suggestions=1 (default 0) — include match suggestions
 *
 * Response: { period_id, creators[], suggestions[]?, total_sales_agency }
 */
import { auth } from "@clerk/nextjs/server";
import { buildCreatorMatrix, computeMatchSuggestions } from "@/lib/creator-aggregates";
import { hasCpDataForPeriod } from "@/lib/creatorspro-data";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  const includeSuggestions = url.searchParams.get("include_suggestions") === "1";

  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }
  const cpAvail = await hasCpDataForPeriod(period_id);
  if (!cpAvail) {
    return Response.json({
      error: `Nessun dato CP sincronizzato per ${period_id}. Vai a /admin/creatorspro-sync.`,
      period_id, creators: [], cp_available: false,
    }, { status: 404 });
  }

  const { creators, operators } = await buildCreatorMatrix(period_id);
  const list = Object.values(creators).sort((a, b) => b.total_sales - a.total_sales);
  // Aggiungi rank
  list.forEach((c, i) => { c.rank = i + 1; });

  const totalAgency = list.reduce((s, c) => s + c.total_sales, 0);
  const totalShifts = list.reduce((s, c) => s + (c.total_shifts || 0), 0);
  const avgPerShift = totalShifts > 0 ? Math.round((totalAgency / totalShifts) * 100) / 100 : 0;

  let suggestions = null;
  if (includeSuggestions) {
    suggestions = await computeMatchSuggestions(period_id);
  }

  return Response.json({
    period_id,
    cp_available: true,
    creators: list,
    creators_count: list.length,
    total_sales_agency: totalAgency,
    total_shifts: totalShifts,
    avg_sales_per_shift_agency: avgPerShift,
    avg_sales_per_creator: list.length > 0 ? Math.round(totalAgency / list.length) : 0,
    suggestions,
    operators_count: Object.keys(operators).length,
  });
}
