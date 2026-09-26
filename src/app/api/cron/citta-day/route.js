/**
 * POST/GET /api/cron/citta-day — salva ogni notte lo stato dei piani della città
 * (serve all'avviso "piano in ritardo da due settimane"). Smistato dal dispatcher.
 * Path pubblico nel middleware; si difende con isCronAuthorized + fallback sessione SEED.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getCitySnapshot, recordCityDay } from "@/lib/citta";
import { getCityLive, mergeCityLive } from "@/lib/citta-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const snap = await getCitySnapshot();
  if (!snap?.projects?.length) return Response.json({ ok: true, skipped: "nessuna fotografia" });
  try {
    const n = await recordCityDay(mergeCityLive(snap, await getCityLive()));
    await kv.set("cron:heartbeat:citta-day", { at: Date.now(), via: viaCron ? "cron" : "session", areas: n }, { ex: 40 * 24 * 3600 }).catch(() => {});
    return Response.json({ ok: true, areas: n });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
export const GET = run;
export const POST = run;
