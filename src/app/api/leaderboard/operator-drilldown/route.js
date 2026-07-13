/**
 * GET /api/leaderboard/operator-drilldown
 *
 * Drill-down diagnostico per un singolo operatore in un periodo dato.
 * Risponde alle domande: dove è forte, dove è debole, perché.
 *
 * Query params:
 *   ?employee=NAME (richiesto)
 *   ?period_id=YYYY-MM (richiesto)
 *
 * Response:
 *   {
 *     employee, period_id,
 *     cp: {
 *       score, tier, rank_agency, total_in_ranking,
 *       total_sales, total_shifts, total_hours,
 *       top_creator, specialization_pct, reliable_creators_count,
 *       per_creator: [
 *         { creator, sales, shifts, hours, sales_per_shift, score, tier,
 *           percentile_vs_creator, percentile_vs_agency, creator_avg_sps,
 *           vs_cohort_pct, low_confidence }
 *       ],
 *       agency_avg_score, agency_size,
 *       peer_strong: [ { name, score } ]   // top 3 Strong+ sulle stesse creator
 *     },
 *     infloww: { score, tier } | null,
 *     insights: [ { kind, severity, text } ]
 *   }
 *
 * Auth: qualsiasi utente loggato.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";
import { buildCpLeaderboard } from "@/lib/creatorspro-score";
import { buildOperatorsForCpLeaderboard } from "@/lib/creatorspro-data";

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const employee = url.searchParams.get("employee");
  const period_id = url.searchParams.get("period_id");
  if (!employee) return Response.json({ error: "employee richiesto" }, { status: 400 });
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  // 1. Matrix CP per il periodo
  const { matrix, creators, operators } = await buildCreatorMatrix(period_id);
  const opRow = operators[employee];
  const opCells = matrix[employee] || {};

  // 2. Leaderboard CP completa per calcolare rank
  const ops = await buildOperatorsForCpLeaderboard(period_id);
  const leaderboard = await buildCpLeaderboard(ops, period_id);
  const ranking = leaderboard.ranking || [];
  const rankedWithScore = ranking.filter((r) => r.score != null && r.score > 0);
  const idx = rankedWithScore.findIndex((r) => r.employee === employee);
  const rank_agency = idx >= 0 ? idx + 1 : null;
  const agency_avg_score = rankedWithScore.length
    ? Math.round((rankedWithScore.reduce((s, r) => s + r.score, 0) / rankedWithScore.length) * 10) / 10
    : null;

  // 3. Per-creator breakdown
  const per_creator = [];
  for (const [creatorAlias, cell] of Object.entries(opCells)) {
    if (!cell || cell.sales <= 0) continue;
    const creatorMeta = creators[creatorAlias] || {};
    const creator_avg_sps = creatorMeta.avg_sales_per_shift || 0;
    const vs_cohort_pct = creator_avg_sps > 0
      ? Math.round(((cell.sales_per_shift - creator_avg_sps) / creator_avg_sps) * 100)
      : null;
    per_creator.push({
      creator: creatorAlias,
      sales: cell.sales,
      shifts: cell.shifts,
      hours: cell.hours,
      sales_per_shift: cell.sales_per_shift,
      score: cell.score,
      tier: cell.tier,
      percentile_vs_creator: cell.percentile_vs_creator,
      percentile_vs_agency: cell.percentile_vs_agency,
      creator_avg_sps,
      vs_cohort_pct,
      low_confidence: !!cell.low_confidence,
      shift_events_total: cell.shift_events_total || 0,
    });
  }
  per_creator.sort((a, b) => b.sales - a.sales);

  // 4. Peer Strong+ sulle stesse creator (per "peer compare")
  const creatorsList = per_creator.map((p) => p.creator);
  const peerScores = new Map(); // peerName → { score, sharedCreators }
  for (const [otherOp, cells] of Object.entries(matrix)) {
    if (otherOp === employee) continue;
    const otherRow = operators[otherOp];
    if (!otherRow || otherRow.score == null || otherRow.score < 50) continue; // Good+
    let shared = 0;
    for (const cr of creatorsList) {
      if (cells[cr] && !cells[cr].low_confidence && cells[cr].score != null) shared++;
    }
    if (shared > 0) {
      peerScores.set(otherOp, { score: otherRow.score, tier: otherRow.tier, shared });
    }
  }
  const peer_strong = Array.from(peerScores.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.shared - a.shared || b.score - a.score)
    .slice(0, 3);

  // 5. Auto-insights (lato client passa l'Infloww score per confronto se vuole)
  const insights = [];
  if (per_creator.length > 1) {
    const strong = per_creator.filter((p) => p.tier === "Strong" || p.tier === "Elite");
    const weak = per_creator.filter((p) => p.tier === "Weak" || p.tier === "Critical");
    if (strong.length > 0 && weak.length > 0) {
      insights.push({
        kind: "performance_mista",
        severity: "warning",
        text: `Performance polarizzata: forte su ${strong.map((s) => s.creator).join(", ")}, debole su ${weak.map((w) => w.creator).join(", ")}. Coaching mirato su creator specifiche, non generico.`,
      });
    }
  }
  if (opRow && opRow.specialization_pct >= 80) {
    insights.push({
      kind: "iperspecializzato",
      severity: "info",
      text: `Iperspecializzato: ${opRow.specialization_pct}% dei sales su ${opRow.top_creator}. Rischio se quella creator cala o cambia team.`,
    });
  }
  if (opRow && opRow.reliable_creators_count === 0) {
    insights.push({
      kind: "no_reliable_data",
      severity: "warning",
      text: `Tutti i suoi turni hanno meno di 3 shift su ogni creator: dati statisticamente non affidabili per uno score CP.`,
    });
  }

  return Response.json({
    employee,
    period_id,
    cp: opRow ? {
      score: opRow.score,
      tier: opRow.tier,
      rank_agency,
      total_in_ranking: rankedWithScore.length,
      total_sales: opRow.total_sales,
      total_shifts: per_creator.reduce((s, p) => s + p.shifts, 0),
      total_hours: per_creator.reduce((s, p) => s + p.hours, 0),
      top_creator: opRow.top_creator,
      specialization_pct: opRow.specialization_pct,
      reliable_creators_count: opRow.reliable_creators_count,
      per_creator,
      agency_avg_score,
      agency_size: rankedWithScore.length,
      peer_strong,
    } : null,
    insights,
  });
}
