// GET /api/leaderboard/agency-sales?period_id=YYYY-MM — il venduto ufficiale del mese e il confronto
// onesto col mese prima allo STESSO GIORNO (lib/agency-sales-core). Chi vede solo alcune creator riceve
// i totali delle sue (stessa regola di Classifica vendite / Creator).
import { authorizeScoped, allowsCreator, scopeSummary } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { getWages } from "@/lib/cp-wages-store";
import { listAlerts } from "@/lib/ops-alerts";
import { agencySales, compareUntilDay, dataWarnings, pctDelta, romeDay } from "@/lib/agency-sales-core";

export const dynamic = "force-dynamic";

const prevOf = (pid) => { const [y, m] = pid.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const periodId = new URL(request.url).searchParams.get("period_id");
  if (!/^\d{4}-\d{2}$/.test(periodId || "")) return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  const prevId = prevOf(periodId);
  const scope = az.creatorScope;
  const allow = (alias) => allowsCreator(scope, alias);
  const visibility = scopeSummary(scope);
  if (!scope.all && !scope.creators?.size) return Response.json({ period_id: periodId, visibility, empty_scope: true });

  const [cur, prev, al] = await Promise.all([getWages(periodId), getWages(prevId), listAlerts().catch(() => ({ alerts: [] }))]);
  const full = agencySales(cur, { periodId, allow });
  const prevFull = agencySales(prev, { periodId: prevId, allow });
  const until = compareUntilDay(periodId, romeDay(new Date().toISOString()), full.lastDay);
  const curCmp = until == null ? full : agencySales(cur, { periodId, allow, untilDay: until });
  const prevCmp = until == null ? prevFull : agencySales(prev, { periodId: prevId, allow, untilDay: until });
  const warnings = dataWarnings(al.alerts, [periodId, prevId]);

  return Response.json({
    period_id: periodId,
    prev_period_id: prevId,
    visibility,
    has_data: Array.isArray(cur) && cur.length > 0,
    current: full,                    // tutto il mese finora (numero ufficiale)
    prev_full: prevFull,              // mese prima intero
    compare: until == null ? null : { until_day: until, current: curCmp, prev: prevCmp,
      delta_pct: { sales: pctDelta(curCmp.sales, prevCmp.sales), shifts: pctDelta(curCmp.shifts, prevCmp.shifts), operators: pctDelta(curCmp.operators, prevCmp.operators) } },
    // i titoli degli alert solo a chi vede tutta l'agenzia; agli altri basta sapere che i dati sono incompleti
    incomplete: warnings.length > 0,
    warnings: scope.all ? warnings : [],
  });
}
