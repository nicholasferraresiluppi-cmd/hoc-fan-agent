/**
 * POST /api/cron/scouting-hlreread — porta avanti la rilettura delle prime storie in evidenza
 * del Radar (lib/scouting-hlreread). Si AUTO-CONCATENA finché il giro non finisce.
 * Cron proprio ogni 10 minuti in vercel.json (eccezione deliberata come hr-queue, 16/10/2026):
 * AVVIA il giro la prima volta (decisione di Nicholas: «fallo tu», tetto 25 $) e lo riprende se
 * la catena si interrompe (deploy, timeout). A giro finito/fermato è un giro a vuoto (1 lettura
 * KV). Lucchetto `scouting:hlreread:lock`: mai due passi insieme (lancerebbero due run Apify).
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { hlRereadStep, getHlReread, startHlReread } from "@/lib/scouting-hlreread";
import { apifyConfigured } from "@/lib/scouting-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const WAIT_MS = 20_000;
// ~10 blocchi da 100 + i loro run: ogni anello aspetta fino a 4 minuti, 200 anelli bastano e avanzano
const MAX_CHAIN = 200;
const LOCK = "scouting:hlreread:lock";

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const chain = chainDepth(request);
  let st = await getHlReread();
  // mai partita: la avvia il primo giro (una volta sola; finita o fermata non riparte da sé)
  if (!st && viaCron && apifyConfigured()) st = await startHlReread({ by: "avvio automatico" });
  if (!st || st.status !== "in_corso") return Response.json({ action: "idle", status: st?.status || null });
  if (!(await kv.set(LOCK, Date.now(), { nx: true, ex: 290 }))) return Response.json({ action: "busy" });

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
  await kv.del(LOCK).catch(() => {});
  await kv.set("cron:heartbeat:scouting-hlreread", { at: Date.now(), via: viaCron ? "cron" : "session", chain, result: JSON.stringify(last || {}).slice(0, 200) }, { ex: 40 * 86400 }).catch(() => {});
  // su errore la catena si ferma: riprova il cron dei 10 minuti (niente raffica di anelli che sbagliano)
  const chained = last?.done || last?.error ? null : await continueChain(request, chain, { maxChain: MAX_CHAIN });
  return Response.json({ action: "step", chain, last, ...(chained ? { next: chained } : {}) });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
