/**
 * GET/POST /api/cron/infloww-agency — sync automatico dei ricavi agenzia Infloww.
 *
 * Perché (26/09/2026): il sync della pagina "Revenue agency" partiva SOLO dal
 * bottone in pagina; l'ultimo giro era dell'8 luglio → 79 giorni di $0 che
 * sembravano "l'agenzia non ha incassato". Ora gira ogni notte dal dispatcher,
 * stessa meccanica di /api/cron/payout-ledger: un passo (<60s) e poi si
 * AUTO-CONCATENA finché il job non è finito (guardia freshness contro le
 * sovrapposizioni con la UI, catena max 20). Rilancia il sync se l'ultimo è
 * più vecchio di 20h. Finestra 31 giorni (come il bottone in pagina).
 *
 * Auth: Bearer CRON_SECRET (lib/cron-auth) oppure sessione SEED. Path pubblico nel middleware.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { getJob, startJob, stepJob } from "@/lib/infloww-sync-job";

export const maxDuration = 60;

const FRESH_MS = 90 * 1000;
const STALE_MS = 20 * 3600 * 1000;
const MAX_CHAIN = 20;

async function tick(chain = 0) {
  const job = await getJob();
  if (job?.status === "running") {
    if (chain === 0 && Date.now() - (job.updated_at || 0) < FRESH_MS) {
      return { action: "skip", reason: "step già in corso", last_step: job.last_step };
    }
    const res = await stepJob();
    return { action: "step", has_more: res.has_more, last_step: res.job?.last_step, error: res.error || null };
  }
  const meta = await kv.get("infloww:sync:meta").catch(() => null);
  if (meta && Date.now() - (meta.last_sync_at || 0) <= STALE_MS) {
    return { action: "idle", reason: "sync più recente di 20h" };
  }
  await startJob(31);
  const res = await stepJob();
  return { action: "start", has_more: res.has_more, last_step: res.job?.last_step, error: res.error || null };
}

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  if (!process.env.INFLOWW_API_KEY || !process.env.INFLOWW_OID) {
    return Response.json({ action: "error", error: "Env Infloww mancanti (INFLOWW_API_KEY / INFLOWW_OID)" }, { status: 428 });
  }
  const chain = chainDepth(request);
  if (chain === 0) {
    await kv.set("cron:heartbeat:infloww-agency", { at: Date.now(), via: viaCron ? "cron" : "session" }, { ex: 40 * 24 * 3600 }).catch(() => {});
  }
  try {
    const out = await tick(chain);
    let chained = null;
    if ((out.action === "step" || out.action === "start") && out.has_more) {
      chained = await continueChain(request, chain, { maxChain: MAX_CHAIN });
    }
    return Response.json({ ...out, chain, ...(chained ? { next: chained } : {}) });
  } catch (e) {
    return Response.json({ action: "error", error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
