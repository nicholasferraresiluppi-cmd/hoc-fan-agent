/**
 * POST /api/cron/trend-modelle — giro notturno dei Trend modelle (src/lib/trend-modelle.js):
 * una lettura del warehouse (reel esplosi da trendfinder e dai nostri profili) + descrizione AI
 * dei nuovi esplosi. Lanciato ogni notte dal dispatcher; legge al massimo una volta al giorno.
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { nightly } from "@/lib/trend-modelle";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try { result = await nightly(); } catch (e) { result = { ok: false, error: e?.message || "unknown" }; }
  const failed = result.ok === false;
  const summary = failed ? `err:${result.error}` : JSON.stringify(result);
  await kv
    .set("cron:heartbeat:trend-modelle", { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(failed ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: failed ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
