/**
 * POST /api/cron/scouting-probe — apre i link del Radar che da soli non dicono niente
 * (pagine di link sconosciute, siti personali, WhatsApp) e ci cerca OnlyFans/Telegram
 * (lib/scouting-probe, 17/10/2026, caso Elisa Esposito). Gratis: niente Apify.
 * Lanciata ogni giorno dal dispatcher; si AUTO-CONCATENA finché ci sono link da aprire
 * (ogni link si riapre dopo 30 giorni). Lucchetto: mai due passi insieme (scritture KV).
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { probeStep } from "@/lib/scouting-probe";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 200_000;
const MAX_CHAIN = 60;
const LOCK = "scouting:probe:lock";

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const chain = chainDepth(request);
  if (!(await kv.set(LOCK, Date.now(), { nx: true, ex: 290 }))) return Response.json({ action: "busy" });
  const t0 = Date.now();
  const tot = { probed: 0, upgraded: 0 };
  let last = null;
  try {
    while (Date.now() - t0 < BUDGET_MS) {
      last = await probeStep();
      tot.probed += last.probed;
      tot.upgraded += last.upgraded;
      if (last.done) break;
    }
  } catch (e) {
    last = { error: String(e?.message || e).slice(0, 200) };
  }
  await kv.del(LOCK).catch(() => {});
  await kv.set("cron:heartbeat:scouting-probe", { at: Date.now(), via: viaCron ? "cron" : "session", chain, ...tot, result: JSON.stringify(last || {}).slice(0, 200) }, { ex: 40 * 86400 }).catch(() => {});
  const chained = last?.done || last?.error ? null : await continueChain(request, chain, { maxChain: MAX_CHAIN });
  return Response.json({ action: "step", chain, ...tot, last, ...(chained ? { next: chained } : {}) });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
