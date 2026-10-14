/**
 * POST /api/cron/telegram-channels — giro giornaliero dei canali Telegram delle creator
 * (vedi src/lib/telegram-channels.js): rilegge dal bot gli iscritti di ogni canale, per la
 * serie a 7/30 giorni. Lanciato ogni notte dal dispatcher. Senza bot configurato non fa nulla.
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { refreshAll } from "@/lib/telegram-channels";

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
    result = await refreshAll();
  } catch (e) {
    result = { error: e?.message || "unknown" };
  }
  const summary = result.error ? `err:${result.error}` : JSON.stringify(result);
  await kv
    .set("cron:heartbeat:telegram-channels", { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(result.error ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
