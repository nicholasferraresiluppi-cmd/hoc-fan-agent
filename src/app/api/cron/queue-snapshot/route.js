/**
 * POST/GET /api/cron/queue-snapshot — cattura giornaliera degli snapshot coda.
 *
 * È lo step "logger del loop" smistato dal dispatcher (/api/cron/dispatch).
 * Path pubblico nel middleware; si difende con isCronAuthorized (Bearer
 * CRON_SECRET) + fallback sessione SEED per il trigger manuale.
 * Solo metadata + LTV, tenant HOC: nessun contenuto chat, nessun LLM.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { captureAllSnapshots, bigQueryConfigured } from "@/lib/loop-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  if (!bigQueryConfigured()) {
    return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  }
  try {
    const res = await captureAllSnapshots();
    await kv
      .set("cron:heartbeat:queue-snapshot", { at: Date.now(), via: viaCron ? "cron" : "session", ...res }, { ex: 40 * 24 * 3600 })
      .catch(() => {});
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  return run(request);
}
export async function GET(request) {
  return run(request);
}
