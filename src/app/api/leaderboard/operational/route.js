/**
 * GET /api/leaderboard/operational
 *
 * Restituisce la leaderboard operativa calcolata dai dati Infloww importati.
 * Visibilità: TUTTI gli operatori autenticati. È materiale pubblico al team.
 *
 * Query params:
 *   ?period_type=monthly|weekly|quarterly  (required)
 *   ?period_id=2026-02 ecc.                 (required)
 *   ?clock_in=yes|no                        (default: no)
 *   ?group=GROUP_NAME                       (opzionale, filtra per group)
 *
 * v9: aggiunto groupAverages nella response per visualizzazione media Group accanto KPI.
 */
import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";
import { buildLeaderboard } from "@/lib/leaderboard-calc";

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }

  const url = new URL(request.url);
  const period_type = url.searchParams.get("period_type");
  const period_id = url.searchParams.get("period_id");
  const clock_in = url.searchParams.get("clock_in") === "yes";
  const group_filter = url.searchParams.get("group");

  if (!period_type || !["weekly", "monthly", "quarterly"].includes(period_type)) {
    return Response.json(
      { error: "period_type must be weekly|monthly|quarterly" },
      { status: 400 }
    );
  }
  if (!period_id) {
    return Response.json({ error: "period_id required" }, { status: 400 });
  }

  // Carica i dati dal KV
  const key = `ops_kpi:${period_type}:${period_id}`;
  const records = await kv.get(key);
  if (!records || !Array.isArray(records) || records.length === 0) {
    return Response.json(
      {
        error: `Nessun dato disponibile per ${period_type}:${period_id}. Importa prima un CSV.`,
        period_type,
        period_id,
        ranking: [],
        groups: [],
        groupAverages: {},
      },
      { status: 404 }
    );
  }

  // Calcola la leaderboard
  const mode = clock_in ? "withClockIn" : "withoutClockIn";
  let ranking;
  let groupAverages;
  try {
    const result = buildLeaderboard(records, mode);
    ranking = result.ranking;
    groupAverages = result.groupAverages;
  } catch (e) {
    console.error("buildLeaderboard error:", e);
    return Response.json(
      { error: "Errore nel calcolo della leaderboard.", reason: String(e?.message || e) },
      { status: 500 }
    );
  }

  // Filtro per group (se richiesto)
  if (group_filter) {
    ranking = ranking.filter((r) => r.group === group_filter);
    let rank = 1;
    for (const r of ranking) {
      if (r.score !== null) r.rank = rank++;
      else r.rank = null;
    }
  }

  // Lista group disponibili per dropdown — solo group con almeno 1 operatore non-mass
  const eligibleGroups = new Set();
  for (const r of records) {
    if (r.group && !r.is_mass) eligibleGroups.add(r.group);
  }
  const groups = Array.from(eligibleGroups).sort();

  // Conta mass esclusi
  const massExcluded = records.filter((r) => r.is_mass).length;

  // Statistiche di overview
  const eligibleRanking = ranking.filter((r) => r.score !== null);
  const avgScore = eligibleRanking.length > 0
    ? eligibleRanking.reduce((sum, r) => sum + r.score, 0) / eligibleRanking.length
    : 0;
  const eliteCount = eligibleRanking.filter((r) => r.tier === "Elite").length;
  const strongCount = eligibleRanking.filter((r) => r.tier === "Strong").length;

  return Response.json({
    period_type,
    period_id,
    clock_in_mode: clock_in,
    ranking,
    groups,
    groupAverages,
    total: ranking.length,
    eligible_total: eligibleRanking.length,
    mass_excluded: massExcluded,
    avg_score: Math.round(avgScore * 10) / 10,
    elite_count: eliteCount,
    strong_count: strongCount,
  });
}
