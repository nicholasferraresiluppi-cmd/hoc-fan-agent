/**
 * GET/POST /api/cron/payout-ledger — tick del sync automatico del ledger.
 *
 * Schedulato da Vercel ogni 10 min nella finestra 04:00-06:50 UTC (vedi
 * vercel.json): ogni tick fa UN passo (~40s) del job in corso, oppure avvia
 * il sync del primo periodo stantio tra mese corrente e mese precedente
 * (refresh > 20h fa). Con ~18 tick/giorno entrambi i mesi si completano ogni
 * notte senza intervento umano — i refund tardivi arrivano da soli, il
 * ledger smette di dipendere da chi preme il bottone.
 *
 * Auth: Bearer CRON_SECRET (lib/cron-auth) oppure sessione con SEED (trigger
 * manuale). Il path è pubblico nel middleware.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import {
  getLedgerJob, startLedgerJob, stepLedgerJob, getLedgerMeta, romePeriod,
} from "@/lib/payout-ledger";

export const maxDuration = 60;

// Un altro step (UI o tick precedente) è vivo se ha checkpointato da poco:
// non sovrapporsi (il checkpoint per batch aggiorna updated_at ogni ~20-40s).
const FRESH_MS = 90 * 1000;
// Un periodo è da risincronizzare se l'ultimo refresh è più vecchio di 20h
// (= una volta al giorno, con margine sulla finestra cron).
const STALE_MS = 20 * 3600 * 1000;

function prevPeriod(p) {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

async function tick() {
  const job = await getLedgerJob();
  if (job?.status === "running") {
    if (Date.now() - (job.updated_at || 0) < FRESH_MS) {
      return { action: "skip", reason: "step già in corso", last_step: job.last_step };
    }
    const res = await stepLedgerJob();
    return { action: "step", period: job.period_id, has_more: res.has_more, last_step: res.job?.last_step, error: res.error };
  }

  const now = Date.now();
  const current = romePeriod(now);
  for (const p of [current, prevPeriod(current)]) {
    const meta = await getLedgerMeta(p);
    if (meta && now - (meta.synced_at || 0) <= STALE_MS) continue;
    await startLedgerJob(p);
    const res = await stepLedgerJob();
    return { action: "start", period: p, has_more: res.has_more, last_step: res.job?.last_step, error: res.error };
  }
  return { action: "idle", reason: "mese corrente e precedente freschi (<20h)" };
}

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  try {
    const out = await tick();
    return Response.json(out);
  } catch (e) {
    return Response.json({ action: "error", error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
