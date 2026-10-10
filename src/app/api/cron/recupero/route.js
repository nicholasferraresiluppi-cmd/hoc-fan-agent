/**
 * POST /api/cron/recupero — la notte di "Fan da recuperare" (dati → invio batch AI → attesa → fatto).
 * Parte dal dispatcher (03:00 UTC) e si AUTO-CONCATENA (lib/cron-chain) finché il batch non è pronto.
 * Auth: Bearer CRON_SECRET oppure sessione SEED (avvio a mano: { force: true }).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { getJob, startJob, step, todayUTC } from "@/lib/recupero";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const WAIT_MS = 12_000;
const MAX_CHAIN = 120;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  let by = "cron";
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
    by = az.userId;
  }
  const chain = chainDepth(request);
  const body = await request.json().catch(() => ({}));
  const day = chain > 0 ? (await kv.get("recupero:active_day").catch(() => null)) || todayUTC() : todayUTC();
  await kv.set("recupero:active_day", day, { ex: 2 * 86400 }).catch(() => {});
  if (chain === 0) await kv.set("cron:heartbeat:recupero", { at: Date.now(), via: viaCron ? "cron" : "session", day }, { ex: 40 * 86400 }).catch(() => {});

  const t0 = Date.now();
  let job = await getJob(day);
  if (!job || (body?.force && chain === 0)) job = await startJob(day, { force: !!body?.force, by });
  if (job.status !== "in_corso") return Response.json({ action: "idle", day, status: job.status });

  let last = null;
  while (Date.now() - t0 < BUDGET_MS) {
    last = await step(day);
    if (last.done || last.error) break;
    if (last.waiting) {
      if (Date.now() - t0 + WAIT_MS > BUDGET_MS) break;
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
  }
  const done = !!last?.done;
  const chained = done ? null : await continueChain(request, chain, { maxChain: MAX_CHAIN });
  return Response.json({ action: "step", day, stage: last?.job?.stage, status: last?.job?.status, chain, ...(chained ? { next: chained } : {}) });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
