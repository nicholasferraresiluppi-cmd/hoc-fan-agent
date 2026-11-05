/**
 * /api/cron/editoriale-autopub — segna «pubblicato» da solo i contenuti dell'Editoriale trovati sul
 * profilo Instagram dopo l'orario in calendario (vedi src/lib/editoriale-autopub.js).
 * Cron proprio ogni ora in vercel.json (eccezione deliberata come studio-telegram: il controllo
 * deve seguire gli orari di pubblicazione, il centralino gira una volta sola). Senza contenuti in
 * attesa è un giro a vuoto (letture KV, nessuna chiamata Apify).
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { autoPublishCheck } from "@/lib/editoriale-autopub";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try { result = await autoPublishCheck(); }
  catch (e) { result = { error: e?.message || "unknown" }; }
  const summary = result.error ? `err:${result.error}` : JSON.stringify(result);
  await kv
    .set("cron:heartbeat:editoriale-autopub", { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(result.error ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
