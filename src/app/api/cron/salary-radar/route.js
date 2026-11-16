/**
 * POST /api/cron/salary-radar — un passo del giro settimanale del Radar salary sugli account
 * aggiunti a mano (src/lib/salary-radar.js): lancia il run Apify una volta a settimana e ne
 * raccoglie l'esito al giro dopo. Lanciato ogni notte dal dispatcher.
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { salaryRadarTick } from "@/lib/salary-radar";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try {
    result = await salaryRadarTick();
  } catch (e) {
    result = { error: e?.message || "unknown" };
  }
  const summary = result.error ? `err:${result.error}` : JSON.stringify(result);
  await kv
    .set("cron:heartbeat:salary-radar", { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(result.error ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
