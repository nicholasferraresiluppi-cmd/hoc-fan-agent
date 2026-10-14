/**
 * POST /api/cron/squadra — ricalcolo notturno della scheda Squadra di Coaching
 * vendite (src/lib/squadra.js): KPI Infloww + calendario CP → classifica in KV.
 * Lanciato ogni notte dal dispatcher. Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { computeSquadraOnce } from "@/lib/squadra";

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
    const doc = await computeSquadraOnce();
    result = doc ? { ok: true, counts: doc.counts } : { skipped: "già in corso" };
  } catch (e) {
    result = { error: e?.message || "unknown" };
  }
  await kv
    .set("cron:heartbeat:squadra", { at: Date.now(), via: viaCron ? "cron" : "session", result: JSON.stringify(result).slice(0, 200), ...(result.error ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
