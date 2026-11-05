/**
 * /api/cron/studio-telegram — manda nei canali Telegram i post dello Studio social arrivati all'ora.
 * Allinea anche lo stato dei reel programmati su Instagram tramite Postiz.
 * Cron proprio ogni 10 minuti in vercel.json (eccezione deliberata come hr-queue e scouting-hlreread,
 * 16/10/2026): il canale si scrive più volte al giorno a orari scelti, il centralino gira una volta
 * sola. Senza post in uscita è un giro a vuoto (poche letture KV). Parte SOLO ciò che una persona ha
 * approvato (lib/studio-telegram-core: duePosts). Lucchetto per post: due giri non mandano lo stesso.
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { listProfiles } from "@/lib/studio-social";
import { sendDuePosts } from "@/lib/studio-telegram";
import { syncInstagramStates } from "@/lib/studio-postiz";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try {
    const profiles = await listProfiles();
    result = await sendDuePosts({ listProfileIds: async () => profiles.map((p) => p.id), budgetMs: 40_000 });
    // stesso giro: allinea i reel programmati su Instagram (Postiz) → pubblicato col link, o errore
    result.instagram = await syncInstagramStates(profiles).catch((e) => ({ error: String(e?.message || e).slice(0, 120) }));
  } catch (e) {
    result = { error: String(e?.message || e).slice(0, 200) };
  }
  await kv.set("cron:heartbeat:studio-telegram", { at: Date.now(), via: viaCron ? "cron" : "session", result: JSON.stringify(result).slice(0, 200) }, { ex: 40 * 86400 }).catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
