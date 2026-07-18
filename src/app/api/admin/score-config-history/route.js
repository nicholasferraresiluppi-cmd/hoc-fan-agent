/**
 * /api/admin/score-config-history
 *
 * Storico versionato della formula dello score operativo Infloww (pesi/soglie/tier)
 * congelata a ogni import CSV. Serve a rilevare il *drift*: capire con quale formula
 * ciascun mese è stato scorato, prerequisito della policy dispute/retroattività
 * (docs/CAREER_LADDER.md §8.2) e del gate 0b del benchmark.
 *
 * Capability richiesta: SEED (admin only).
 *
 * GET  ?period_type=monthly|weekly|quarterly (default monthly)
 *      → { period_type, active_hash, snapshots: [ { period_id, hash, drift_vs_prev, ... } ] }
 *
 * POST { period_type, period_id, source? }
 *      → snapshot baseline manuale della formula corrente per un periodo già importato.
 *        Utile per creare un riferimento prima del prossimo import automatico.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listScoreSnapshots, snapshotScoreConfig } from "@/lib/score-config-snapshot";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }
  const { searchParams } = new URL(request.url);
  const periodType = searchParams.get("period_type") || "monthly";
  if (!["weekly", "monthly", "quarterly"].includes(periodType)) {
    return Response.json({ error: "period_type must be weekly|monthly|quarterly." }, { status: 400 });
  }
  const result = await listScoreSnapshots({ period_type: periodType });
  return Response.json(result);
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { period_type, period_id } = body || {};
  if (!["weekly", "monthly", "quarterly"].includes(period_type)) {
    return Response.json({ error: "period_type must be weekly|monthly|quarterly." }, { status: 400 });
  }
  if (!period_id || typeof period_id !== "string") {
    return Response.json({ error: "Missing period_id." }, { status: 400 });
  }
  const snap = await snapshotScoreConfig({ period_type, period_id, source: "baseline" });
  if (!snap.ok) {
    return Response.json({ error: "Snapshot failed.", reason: snap.reason }, { status: 500 });
  }
  return Response.json({ ok: true, hash: snap.hash, period_type, period_id });
}
