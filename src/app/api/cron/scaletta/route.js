// Ricalcolo SETTIMANALE della scaletta (smistato dal dispatcher, mai cron
// proprio in vercel.json). Ricalcola solo se la cache ha più di 6 giorni.
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.
export const runtime = "nodejs";
export const maxDuration = 120;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { warmScaletta, bigQueryConfigured } from "@/lib/scaletta";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  if (!bigQueryConfigured()) return Response.json({ result: "skip:no-bq" });
  let result;
  try {
    result = await warmScaletta();
  } catch (e) {
    result = "err:" + (e?.message || "unknown");
  }
  await kv.set("cron:heartbeat:scaletta", { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
  return Response.json({ result });
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  // GET solo per il cron (Bearer): niente avvio via link con la sessione (CSRF)
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handle(request);
}
