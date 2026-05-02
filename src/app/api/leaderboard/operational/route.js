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
 * Response:
 *   {
 *     period_type, period_id, clock_in_mode,
 *     ranking: [{ rank, employee, group, score, tier, ...kpi }, ...],
 *     groups: ["MATILDE ITA", "Gaja ITA", ...],   // per dropdown UI
 *     total: number,
 *     mass_excluded: number,
 *   }
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
      },
      { status: 404 }
    );
  }

  // Calcola la leaderboard
  const mode = clock_in ? "withClockIn" : "withoutClockIn";
  let ranking;
  try {
    ranking = buildLeaderboard(records, mode);
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
    // Re-rank per la vista filtrata
    let rank = 1;
    for (const r of ranking) {
      if (r.score !== null) r.rank = rank++;
      else r.rank = null;
    }
  }

  // Lista group disponibili per dropdown
  const groups = Array.from(new Set(records.map((r) => r.group))).sort();

  // Conta mass esclusi
  const massExcluded = records.filter((r) => r.is_mass).length;

  return Response.json({
    period_type,
    period_id,
    clock_in_mode: clock_in,
    ranking,
    groups,
    total: ranking.length,
    mass_excluded: massExcluded,
  });
}
