/**
 * POST /api/cron/warmup-metrics — giro notturno dei numeri pubblici del Warm-up
 * (vedi src/lib/warmup-metrics.js). Lanciato ogni notte dal dispatcher; legge al massimo
 * una volta al giorno. Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { refreshPublicMetrics } from "@/lib/warmup-metrics";
import { weeklyRefresh } from "@/lib/warmup-xrefs";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try {
    result = await refreshPublicMetrics();
  } catch (e) {
    result = { error: e?.message || "unknown" };
  }
  // Ispirazioni X: le reference tenute si rileggono da sole una volta a settimana
  try { result.xrefs = await weeklyRefresh(); } catch (e) { result.xrefs = { error: e?.message || "unknown" }; }
  const summary = result.error ? `err:${result.error}` : JSON.stringify(result);
  await kv
    .set("cron:heartbeat:warmup-metrics", { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(result.error ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
