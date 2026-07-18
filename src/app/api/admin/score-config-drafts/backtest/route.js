/**
 * POST /api/admin/score-config-drafts/backtest
 *
 * Replay dei periodi storici reali con la formula della bozza, confrontata con
 * la formula attiva (pattern Everstage "Time Machine" + Ambition pre-save
 * simulation — cfr docs/BENCHMARK_DEEP_STUDY.md, backlog #6).
 * SOLA LETTURA sui dati: non tocca né i settings attivi né i periodi.
 *
 * Body: { id, period_type?: "monthly"|"weekly"|"quarterly", mode?: "withClockIn"|"withoutClockIn", limit?: 1-12 }
 * Il risultato viene anche persistito sulla bozza (draft.backtest) per la UI.
 *
 * Capability: SEED (admin only).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getDraft, saveDraft, runBacktest } from "@/lib/score-config-drafts";

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { id, period_type = "monthly", mode = "withoutClockIn", limit = 6 } = body || {};
  if (!["weekly", "monthly", "quarterly"].includes(period_type)) {
    return Response.json({ error: "period_type must be weekly|monthly|quarterly." }, { status: 400 });
  }
  if (!["withClockIn", "withoutClockIn"].includes(mode)) {
    return Response.json({ error: "mode must be withClockIn|withoutClockIn." }, { status: 400 });
  }
  const lim = Math.max(1, Math.min(12, Number(limit) || 6));

  const draft = await getDraft(id);
  if (!draft) return Response.json({ error: `Bozza "${id}" non trovata.` }, { status: 404 });

  try {
    const result = await runBacktest({ draft, period_type, mode, limit: lim });
    if (draft.status === "draft") {
      draft.backtest = result;
      draft.updated_at = Date.now();
      await saveDraft(draft);
    }
    return Response.json({ ok: true, backtest: result });
  } catch (e) {
    console.error("Backtest error:", e);
    return Response.json({ error: "Backtest fallito.", reason: String(e?.message || e) }, { status: 500 });
  }
}
