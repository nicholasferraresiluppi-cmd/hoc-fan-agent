/**
 * POST/GET /api/cron/citta-clickup — ogni notte rilegge ClickUp e ricostruisce la fotografia
 * della città (lib/citta-clickup), poi registra lo stato del giorno. Smistato dal dispatcher.
 * Path pubblico nel middleware; si difende con isCronAuthorized + fallback sessione SEED
 * (così un admin può lanciare l'aggiornamento a mano).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCityDay, getCitySnapshot } from "@/lib/citta";
import { getCityLive, mergeCityLive } from "@/lib/citta-live";
import { refreshCityFromClickup } from "@/lib/citta-clickup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const t0 = Date.now();
  try {
    const r = await refreshCityFromClickup();
    await recordCityDay(mergeCityLive(await getCitySnapshot(), await getCityLive())).catch(() => {});
    await kv.set("cron:heartbeat:citta-clickup", { at: Date.now(), via: viaCron ? "cron" : "session", ms: Date.now() - t0, ...r }, { ex: 40 * 24 * 3600 }).catch(() => {});
    return Response.json({ ok: true, ms: Date.now() - t0, ...r });
  } catch (e) {
    await kv.set("cron:heartbeat:citta-clickup", { at: Date.now(), via: viaCron ? "cron" : "session", error: String(e?.message || e) }, { ex: 40 * 24 * 3600 }).catch(() => {});
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
export const GET = run;
export const POST = run;
