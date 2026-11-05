/**
 * POST /api/cron/scouting-webcheck — porta avanti la ricerca su Google degli OnlyFans delle
 * creator del Radar (lib/scouting-webcheck). Si AUTO-CONCATENA finché il giro non finisce.
 * Sveglie: il dispatcher (una volta al giorno) e un cron suo ogni 10 minuti in vercel.json — la
 * catena da sola si ferma al 4º salto (protezione anti-ricorsione di Vercel, vedi lib/cron-chain):
 * il primo giro vero si è fermato a 600 su 2.238. Avvia il primo giro, lo fa ripartire ogni
 * settimana sugli account nuovi e lo riprende se la catena si è interrotta (deploy, timeout).
 * A giro finito è un giro a vuoto (1 lettura KV). Lucchetto `scouting:webcheck:lock`: mai due
 * passi insieme (lancerebbero due run Apify). Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
import { webCheckStep, getWebCheck, maybeRestartWebCheck } from "@/lib/scouting-webcheck";
import { apifyConfigured } from "@/lib/scouting-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const WAIT_MS = 20_000;
// ~30 blocchi da 100 ricerche, ognuno ~3-6 minuti di run: ogni anello aspetta fino a 4 minuti
const MAX_CHAIN = 200;
const LOCK = "scouting:webcheck:lock";

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const chain = chainDepth(request);
  let st = await getWebCheck();
  // primo anello del giorno (dal dispatcher): avvio la prima volta, poi una volta a settimana
  if (viaCron && chain === 0 && apifyConfigured()) st = await maybeRestartWebCheck();
  if (!st || st.status !== "in_corso") return Response.json({ action: "idle", status: st?.status || null });
  if (!(await kv.set(LOCK, Date.now(), { nx: true, ex: 290 }))) return Response.json({ action: "busy" });

  const t0 = Date.now();
  let last = null;
  try {
    while (Date.now() - t0 < BUDGET_MS) {
      last = await webCheckStep();
      if (last.done) break;
      if (last.waiting) {
        if (Date.now() - t0 + WAIT_MS > BUDGET_MS) break;
        await new Promise((r) => setTimeout(r, WAIT_MS));
      }
    }
  } catch (e) {
    last = { error: e?.message || "unknown" };
    await kv.set("scouting:webcheck", { ...(await getWebCheck()), lastError: String(last.error).slice(0, 200), lastErrorAt: Date.now() }).catch(() => {});
  }
  await kv.del(LOCK).catch(() => {});
  await kv.set("cron:heartbeat:scouting-webcheck", { at: Date.now(), via: viaCron ? "cron" : "session", chain, result: JSON.stringify(last || {}).slice(0, 200) }, { ex: 40 * 86400 }).catch(() => {});
  // su errore la catena si ferma: riprova il dispatcher il giorno dopo
  const chained = last?.done || last?.error ? null : await continueChain(request, chain, { maxChain: MAX_CHAIN });
  return Response.json({ action: "step", chain, last, ...(chained ? { next: chained } : {}) });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
