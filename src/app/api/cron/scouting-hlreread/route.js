/**
 * POST /api/cron/scouting-hlreread — porta avanti la rilettura delle prime storie in evidenza
 * del Radar (lib/scouting-hlreread). Si AUTO-CONCATENA finché il giro non finisce; il dispatcher
 * la riaccende ogni notte se una catena si è interrotta (deploy, timeout).
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { hlRereadStep, getHlReread } from "@/lib/scouting-hlreread";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const WAIT_MS = 20_000;
// ~10 blocchi da 100 + i loro run: ogni anello aspetta fino a 4 minuti, 200 anelli bastano e avanzano
const MAX_CHAIN = 200;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const chain = chainDepth(request);
  const st = await getHlReread();
  if (!st || st.status !== "in_corso") return Response.json({ action: "idle", status: st?.status || null });

  const t0 = Date.now();
  let last = null;
  try {
    while (Date.now() - t0 < BUDGET_MS) {
      last = await hlRereadStep();
      if (last.done) break;
      if (last.waiting) {
        if (Date.now() - t0 + WAIT_MS > BUDGET_MS) break;
        await new Promise((r) => setTimeout(r, WAIT_MS));
      }
    }
  } catch (e) {
    last = { error: e?.message || "unknown" };
    await kv.set("scouting:hlreread", { ...(await getHlReread()), lastError: String(last.error).slice(0, 200), lastErrorAt: Date.now() }).catch(() => {});
  }
  await kv.set("cron:heartbeat:scouting-hlreread", { at: Date.now(), via: viaCron ? "cron" : "session", chain, result: JSON.stringify(last || {}).slice(0, 200) }, { ex: 40 * 86400 }).catch(() => {});
  const chained = last?.done ? null : await continueChain(request, chain, { maxChain: MAX_CHAIN });
  return Response.json({ action: "step", chain, last, ...(chained ? { next: chained } : {}) });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
