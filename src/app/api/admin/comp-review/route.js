/**
 * GET /api/admin/comp-review?period_id=YYYY-MM&min_sales=500&min_shifts=3
 *
 * Hot list globale compensation: 1 schermata, top N coppie (operatore × creator)
 * dove la % effettiva si discosta significativamente dalla % media del team
 * di quella creator.
 *
 * Pipeline:
 *  1. buildCreatorMatrix(periodId) — 1 call sola, gira sui dati già in KV
 *  2. Per ogni creator: calcola team_avg_pct (= total_earnings / total_sales)
 *  3. Per ogni cell (operator × creator) con shifts >= min_shifts e sales >= min_sales:
 *     - effective_pct = cell.earnings / cell.sales
 *     - delta_vs_team = (effective_pct - team_avg_pct) / team_avg_pct
 *     - impact_usd = |cell.earnings - cell.sales × team_avg_pct|
 *  4. Verdetto: OK (|delta| < 15%) / REVIEW (<35%) / OUT_OF_SCALE (>=35%)
 *  5. Filtra non-OK, ordina per impact_usd desc, ritorna top 100
 *
 * Filtri:
 *  - min_sales (default 500$): esclude celle marginali
 *  - min_shifts (default 3): esclude operatori che hanno fatto 1-2 turni
 *  - direction: "all" | "underpaid" | "overpaid"
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";

export const maxDuration = 60;

function defaultPeriod() {
  // Mese chiuso più recente (corrente -1)
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || defaultPeriod();
  const minSales = Math.max(0, parseInt(url.searchParams.get("min_sales") || "500", 10));
  const minShifts = Math.max(1, parseInt(url.searchParams.get("min_shifts") || "3", 10));
  const direction = url.searchParams.get("direction") || "all"; // all | underpaid | overpaid
  const limit = Math.max(10, Math.min(500, parseInt(url.searchParams.get("limit") || "100", 10)));

  try {
    const matrixData = await buildCreatorMatrix(periodId);
    const { matrix, creators } = matrixData;

    // Per ogni creator: team_avg_pct = total_earnings / total_sales (weighted)
    // creator-aggregates.js già lo calcola in c.effective_pct → uso quello
    const creatorTeamAvg = {};
    for (const [alias, c] of Object.entries(creators || {})) {
      creatorTeamAvg[alias] = {
        team_avg_pct: c.effective_pct,
        team_total_sales: c.total_sales,
        team_total_earnings: c.total_earnings,
        team_operators_count: c.operators_count,
      };
    }

    // Costruisci lista anomalie
    const anomalies = [];
    for (const [opName, byCreator] of Object.entries(matrix || {})) {
      for (const [alias, cell] of Object.entries(byCreator)) {
        if (!cell || cell.sales < minSales || cell.shifts < minShifts) continue;
        const sales = cell.sales;
        const earnings = cell.earnings || 0;
        if (sales <= 0) continue;
        const effective_pct = earnings / sales;
        const teamAvg = creatorTeamAvg[alias];
        if (!teamAvg || teamAvg.team_avg_pct == null) continue;
        const teamPct = teamAvg.team_avg_pct;
        const delta = (effective_pct - teamPct) / teamPct;
        const absDelta = Math.abs(delta);

        let verdict, severity;
        if (absDelta < 0.15) { verdict = "OK"; severity = 0; }
        else if (absDelta < 0.35) { verdict = "REVIEW"; severity = 1; }
        else { verdict = "OUT_OF_SCALE"; severity = 2; }

        const dir = delta > 0 ? "overpaid" : "underpaid";

        // Skip OK (low impact) e applica direction filter
        if (verdict === "OK") continue;
        if (direction === "underpaid" && dir !== "underpaid") continue;
        if (direction === "overpaid" && dir !== "overpaid") continue;

        // Impact = quanto HOC ha pagato in più (o meno) rispetto al team avg
        const impact_usd = earnings - sales * teamPct;

        anomalies.push({
          creator_alias: alias,
          operator: opName,
          sales: Math.round(sales),
          earnings: Math.round(earnings),
          effective_pct,
          team_avg_pct: teamPct,
          delta_pct: delta,
          shifts: Math.round(cell.shifts * 10) / 10,
          mono_count: cell.shift_mono_count || 0,
          split_count: cell.shift_split_count || 0,
          exact_count: cell.shift_exact_count || 0,
          pct_distribution: cell.pct_distribution || {},
          impact_usd: Math.round(impact_usd),
          impact_abs: Math.abs(Math.round(impact_usd)),
          direction: dir,
          verdict,
          severity,
        });
      }
    }

    // Ordina per impact assoluto desc (i casi di maggior leva in cima)
    anomalies.sort((a, b) => b.impact_abs - a.impact_abs);

    // Totali aggregati
    const totalOverpaid = anomalies.filter((a) => a.direction === "overpaid").reduce((s, a) => s + a.impact_usd, 0);
    const totalUnderpaid = anomalies.filter((a) => a.direction === "underpaid").reduce((s, a) => s + a.impact_usd, 0);

    // Top creator e operator per anomalie count
    const byCreator = {};
    const byOperator = {};
    for (const a of anomalies) {
      byCreator[a.creator_alias] = (byCreator[a.creator_alias] || 0) + 1;
      byOperator[a.operator] = (byOperator[a.operator] || 0) + 1;
    }
    const topCreators = Object.entries(byCreator).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topOperators = Object.entries(byOperator).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return Response.json({
      period_id: periodId,
      filters: { min_sales: minSales, min_shifts: minShifts, direction },
      summary: {
        total_anomalies: anomalies.length,
        review_count: anomalies.filter((a) => a.verdict === "REVIEW").length,
        out_of_scale_count: anomalies.filter((a) => a.verdict === "OUT_OF_SCALE").length,
        overpaid_count: anomalies.filter((a) => a.direction === "overpaid").length,
        underpaid_count: anomalies.filter((a) => a.direction === "underpaid").length,
        total_overpaid_impact_usd: Math.round(totalOverpaid),
        total_underpaid_impact_usd: Math.round(totalUnderpaid),
        net_impact_usd: Math.round(totalOverpaid + totalUnderpaid),
        top_creators_with_anomalies: topCreators.map(([k, v]) => ({ creator: k, count: v })),
        top_operators_with_anomalies: topOperators.map(([k, v]) => ({ operator: k, count: v })),
      },
      anomalies: anomalies.slice(0, limit),
      creators_analyzed: Object.keys(creators || {}).length,
      operators_analyzed: Object.keys(matrix || {}).length,
    });
  } catch (e) {
    console.error("[comp-review] error:", e);
    return Response.json({ error: String(e?.message || e), stack: String(e?.stack || "").slice(0, 600) }, { status: 500 });
  }
}
