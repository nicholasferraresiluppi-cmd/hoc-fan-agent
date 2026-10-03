/**
 * POST /api/cron/sales-ai — la notte del sales manager AI (uffici: dati →
 * analisi → arbitro → garante). Parte dal dispatcher (03:00 UTC) e si
 * AUTO-CONCATENA (lib/cron-chain): ogni tick fa i passi che stanno in ~45s; se
 * un batch AI è ancora in lavorazione aspetta qualche secondo e passa al tick
 * successivo. Tetto di catena alto (i batch possono metterci decine di minuti)
 * ma finito: oltre, riprende il giorno dopo dallo stato in KV.
 *
 * Auth: Bearer CRON_SECRET (lib/cron-auth) oppure sessione SEED (avvio a mano
 * dal Quartier generale, anche per un giorno specifico: { day, force }).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { getConfig, getJob } from "@/lib/sales-ai/store";
import { startJob, step, romeYesterday } from "@/lib/sales-ai/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const WAIT_MS = 12_000;
const MAX_CHAIN = 150; // ~150 tick × ~50s ≈ 2 ore di attesa massima dei batch

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
  // i figli della catena non hanno corpo: proseguono il giorno avviato (anche se scelto a mano)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(body?.day || "") ? body.day
    : (chain > 0 ? (await kv.get("smai:active_day").catch(() => null)) || romeYesterday() : romeYesterday());
  await kv.set("smai:active_day", day, { ex: 3 * 86400 }).catch(() => {});
  if (chain === 0) await kv.set("cron:heartbeat:sales-ai", { at: Date.now(), via: viaCron ? "cron" : "session", day }, { ex: 40 * 86400 }).catch(() => {});

  const cfg = await getConfig();
  if (!cfg.enabled && !body?.force) return Response.json({ action: "spento" });

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
  // la catena continua anche dopo un errore non fatale: step() conta i fallimenti e si ferma da solo a 4
  const chained = done ? null : await continueChain(request, chain, { maxChain: MAX_CHAIN });
  return Response.json({ action: "step", day, stage: last?.job?.stage, status: last?.job?.status, chain, ...(chained ? { next: chained } : {}) });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
