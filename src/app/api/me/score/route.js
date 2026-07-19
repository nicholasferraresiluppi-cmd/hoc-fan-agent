/**
 * GET /api/me/score?period_id=YYYY-MM
 *
 * "Il mio score, spiegato" — scope own (docs/VISIBILITY_POLICY.md).
 * L'identità è risolta SERVER-SIDE dall'utente Clerk (mai ?employee= dal client).
 * Ritorna SOLO i dati dell'operatore dell'utente + aggregati non nominativi
 * (percentile, conteggi): mai score altrui.
 *
 * Auth: utente loggato. Nessuna capability richiesta: per costruzione la route
 * non può esporre dati di altri (cfr policy, corollario b).
 */
import { kv } from "@vercel/kv";
import { resolveEmployeeForUser, normalizeName } from "@/lib/me";
import { buildLeaderboard } from "@/lib/leaderboard-calc";
import { listAvailablePeriods, loadHistoryForEmployee } from "@/lib/leaderboard-history";
import { loadSettings } from "@/app/api/admin/leaderboard-settings/route";

export async function GET(request) {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (!who.employee) {
    return Response.json({ linked: false, reason: who.reason || "no_match" });
  }
  const employee = who.employee;

  const { searchParams } = new URL(request.url);
  let periodId = searchParams.get("period_id");

  // listAvailablePeriods ordina per timestamp di IMPORT: qui serve l'ordine
  // di calendario (le etichette YYYY-MM sono confrontabili come stringhe).
  const periods = ((await listAvailablePeriods("monthly")) || [])
    .slice()
    .sort((a, b) => String(b).localeCompare(String(a)));
  if (!periodId) periodId = periods[0] || null;
  if (!periodId) {
    return Response.json({ linked: true, employee, period_id: null, reason: "no_periods" });
  }

  let records = [];
  try {
    records = (await kv.get(`ops_kpi:monthly:${periodId}`)) || [];
  } catch {}
  if (!records.length) {
    return Response.json({ linked: true, employee, period_id: periodId, reason: "no_data_for_period", available_periods: periods.slice(0, 12) });
  }

  const [settings, exclusions, snapshot] = await Promise.all([
    loadSettings(),
    kv.get("leaderboard:exclusions").catch(() => ({})),
    kv.get(`ops_kpi:score_snapshot:monthly:${periodId}`).catch(() => null),
  ]);

  // Stesso default della vista operational (?clock_in default "no"): la modalità
  // senza clock-in è quella pubblicata; teniamo la stessa per coerenza di numeri.
  const mode = "withoutClockIn";

  const { ranking } = buildLeaderboard(records, mode, settings, exclusions || {});
  const scored = ranking.filter((r) => r.score !== null);

  const target = normalizeName(employee);
  const mineMatches = scored.filter((r) => normalizeName(r.employee) === target);
  if (mineMatches.length !== 1) {
    // Nessun match univoco nei dati Infloww del periodo: stato onesto, mai dati altrui.
    return Response.json({
      linked: true,
      employee,
      period_id: periodId,
      reason: mineMatches.length === 0 ? "not_in_period" : "ambiguous_in_period",
      available_periods: periods.slice(0, 12),
    });
  }
  const mine = mineMatches[0];

  // Percentile nel gruppo dei valutati (aggregato non nominativo, policy-safe).
  const better = scored.filter((r) => r.score > mine.score).length;
  const percentile = scored.length > 1 ? Math.round((1 - better / scored.length) * 100) : 100;

  // Storico own (via lib, non via route gated). La lib ritorna oldest-first:
  // qui lo teniamo così com'è (serve al grafico timeline sinistra→destra).
  let history = [];
  try {
    const h = await loadHistoryForEmployee({ employee: mine.employee, periodType: "monthly", limit: 12 });
    history = (h || [])
      .map((x) => ({ period_id: x.period_id, score: x.score, tier: x.tier }))
      .sort((a, b) => String(a.period_id).localeCompare(String(b.period_id))); // cronologico per il grafico
  } catch {}

  const weights = settings.weights?.[mode] || {};
  const composition = Object.entries(mine.points_breakdown || {}).map(([kpi, points]) => ({
    kpi,
    points: typeof points === "number" ? Number(points.toFixed(1)) : points,
    weight: weights[kpi] ?? null,
    my_value: mine[kpi] ?? null,
    group_mean: mine.group_means?.[kpi] ?? null,
  }));

  return Response.json({
    linked: true,
    employee: mine.employee,
    group: mine.group || null,
    period_id: periodId,
    available_periods: periods.slice(0, 12),
    mode,
    score: Number(mine.score.toFixed(1)),
    tier: mine.tier,
    percentile,
    scored_count: scored.length,
    composition,
    formula: snapshot ? { hash: snapshot.hash, captured_at_iso: snapshot.captured_at_iso } : null,
    history,
  });
}
