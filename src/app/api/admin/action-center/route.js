/**
 * /api/admin/action-center
 *
 * Backend del pannello "Action Center" — gestisce i mark + swap mapping
 * per gli operatori da rivedere/cambiare/sostituire questo periodo.
 *
 * Capability richiesta: SEED (admin-only).
 *
 * Storage KV: chiave `action_center:swaps:{period_id}` → JSON
 *   {
 *     "Mario Rossi": {
 *       marked_at: 1716100000000,
 *       marked_by: "user_xxxx",
 *       status: "marked" | "ready_for_hr",
 *       swap_with: "Luca Bianchi" | null,
 *       note: ""
 *     }
 *   }
 *
 * GET    ?period_id=YYYY-MM             → ritorna swaps + lista underperformers
 * POST   body { period_id, employee, action, swap_with?, note?, status? }
 *         → upsert entry (action="mark", "set_swap", "set_ready", "set_pending")
 * DELETE ?period_id=YYYY-MM&employee=N → rimuove entry (unmark)
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { buildCreatorMatrix } from "@/lib/creator-aggregates";
import { buildOperatorsForCpLeaderboard, hasCpDataForPeriod } from "@/lib/creatorspro-data";
import { buildCpLeaderboard } from "@/lib/creatorspro-score";

const SWAP_KEY = (periodId) => `action_center:swaps:${periodId}`;
const IGNORED_KEY = "underperformers:ignored";

const UNDERPERFORMER_SCORE_MAX = 25;   // Average e sotto
const UNDERPERFORMER_MIN_SHIFTS = 5;   // Almeno 5 shift TOTALI nel periodo
const TOP_N = 30;                      // Max candidati ritornati

function isValidPeriod(p) { return typeof p === "string" && /^\d{4}-\d{2}$/.test(p); }

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });

  const cpAvail = await hasCpDataForPeriod(period_id);
  if (!cpAvail) {
    return Response.json({
      error: `Nessun dato CP sincronizzato per ${period_id}. Sync prima da /admin/creatorspro-sync.`,
      cp_available: false, candidates: [], swaps: {},
    }, { status: 404 });
  }

  const [swaps, ignored, operatorsRaw, matrixResult] = await Promise.all([
    kv.get(SWAP_KEY(period_id)),
    kv.get(IGNORED_KEY),
    buildOperatorsForCpLeaderboard(period_id),
    buildCreatorMatrix(period_id),
  ]);
  const swapsObj = swaps || {};
  const ignoredObj = ignored || {};

  // Calcola score con buildCpLeaderboard (deriva da matrix v3)
  const { ranking } = await buildCpLeaderboard(operatorsRaw, period_id);

  // Filtra underperformers
  const candidates = ranking
    .filter((r) => {
      if (r.score == null) return false;
      if (r.score > UNDERPERFORMER_SCORE_MAX) return false;
      const totalShifts = r.cp_aggregates?.total_shifts || 0;
      if (totalShifts < UNDERPERFORMER_MIN_SHIFTS) return false;
      if (ignoredObj[r.employee]) return false;
      return true;
    })
    .sort((a, b) => a.score - b.score) // peggiore primo
    .slice(0, TOP_N)
    .map((r) => {
      const swapEntry = swapsObj[r.employee] || null;
      return {
        employee: r.employee,
        group: r.group || null,
        score: r.score,
        tier: r.tier,
        rank: r.rank,
        cp_total_sales: r.cp_aggregates?.total_sales || 0,
        cp_total_shifts: r.cp_aggregates?.total_shifts || 0,
        top_creator: r.cp_breakdown?.top_creator || null,
        top_creator_sales: r.cp_breakdown?.top_creator_sales || 0,
        specialization_pct: r.cp_breakdown?.specialization_pct || 0,
        reliable_creators_count: r.cp_breakdown?.reliable_creators || 0,
        swap_entry: swapEntry, // { marked_at, marked_by, status, swap_with, note } | null
      };
    });

  // Lista candidati per swap (operatori "buoni" non in underperformer list)
  const swapTargets = ranking
    .filter((r) => r.score != null && r.score >= 50) // Good+
    .filter((r) => (r.cp_aggregates?.total_shifts || 0) >= 3)
    .sort((a, b) => b.score - a.score)
    .map((r) => ({
      employee: r.employee,
      score: r.score,
      tier: r.tier,
      group: r.group,
      total_shifts: r.cp_aggregates?.total_shifts || 0,
    }))
    .slice(0, 100); // top 100 sostituibili

  // Lista finale per HR
  const readyForHr = Object.entries(swapsObj)
    .filter(([, e]) => e?.status === "ready_for_hr")
    .map(([emp, e]) => ({ employee: emp, ...e }));

  return Response.json({
    period_id,
    cp_available: true,
    candidates_count: candidates.length,
    candidates,
    swap_targets: swapTargets,
    ignored_count: Object.keys(ignoredObj).length,
    ready_for_hr: readyForHr,
    swaps: swapsObj,
  });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { period_id, employee, action, swap_with, note, status } = body || {};
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (!employee || typeof employee !== "string") return Response.json({ error: "employee (string) required" }, { status: 400 });

  const validActions = ["mark", "set_swap", "set_ready", "set_pending"];
  if (!validActions.includes(action)) return Response.json({ error: `action must be ${validActions.join("|")}` }, { status: 400 });

  const key = SWAP_KEY(period_id);
  const swaps = (await kv.get(key)) || {};
  const prev = swaps[employee] || null;
  const now = Date.now();

  const next = {
    marked_at: prev?.marked_at || now,
    marked_by: prev?.marked_by || az.userId,
    updated_at: now,
    updated_by: az.userId,
    status: prev?.status || "marked",
    swap_with: prev?.swap_with || null,
    note: prev?.note || "",
  };

  if (action === "mark") {
    // upsert "marked" (entry creata)
  } else if (action === "set_swap") {
    if (swap_with !== null && (typeof swap_with !== "string" || !swap_with.trim())) {
      return Response.json({ error: "swap_with must be string or null" }, { status: 400 });
    }
    next.swap_with = swap_with === null ? null : swap_with.trim();
  } else if (action === "set_ready") {
    next.status = "ready_for_hr";
  } else if (action === "set_pending") {
    next.status = "marked";
  }

  if (typeof note === "string") next.note = note.trim();

  swaps[employee] = next;
  await kv.set(key, swaps);

  await logAuditAction({
    action: `action_center.${action}`,
    target: employee,
    by: az.userId,
    meta: { period_id, swap_with: next.swap_with, status: next.status, previous: prev },
  });

  return Response.json({ ok: true, employee, entry: next, total: Object.keys(swaps).length });
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  const employee = url.searchParams.get("employee");
  if (!isValidPeriod(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (!employee) return Response.json({ error: "?employee=NAME required" }, { status: 400 });

  const key = SWAP_KEY(period_id);
  const swaps = (await kv.get(key)) || {};
  if (!(employee in swaps)) return Response.json({ error: "employee not in mapping" }, { status: 404 });

  const removed = swaps[employee];
  delete swaps[employee];
  await kv.set(key, swaps);

  await logAuditAction({
    action: "action_center.unmark",
    target: employee,
    by: az.userId,
    meta: { period_id, removed_entry: removed },
  });

  return Response.json({ ok: true, removed: employee, total: Object.keys(swaps).length });
}
