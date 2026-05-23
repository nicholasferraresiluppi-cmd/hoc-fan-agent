/**
 * GET /api/admin/closed-loop-metrics?period_id=YYYY-MM
 *
 * Restituisce le 3 metriche aggregate che certificano se il ciclo
 * HR/coaching sta funzionando:
 *   - coaching: % operatori coachati nel mese prec. che sono migliorati
 *   - swaps:    % sostituzioni HR del mese prec. che hanno generato Good+
 *   - trend:    delta score medio agency vs mese precedente
 *
 * Auth: qualsiasi utente loggato (visibile a board, sales manager, HR).
 *
 * Nota performance: la computazione richiede buildCreatorMatrix su 2 periodi
 * consecutivi. Per evitare di pagare la latenza ad ogni hit Hub, useremmo
 * idealmente un job batch + KV. Per ora va in tempo reale con la cache
 * in-memory di buildCreatorMatrix.
 */
import { auth } from "@clerk/nextjs/server";
import { computeClosedLoopMetrics } from "@/lib/closed-loop-metrics";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  try {
    const metrics = await computeClosedLoopMetrics(period_id);
    return Response.json(metrics);
  } catch (e) {
    console.error("closed-loop-metrics error:", e);
    return Response.json({ error: String(e?.message || e), period_id }, { status: 500 });
  }
}
