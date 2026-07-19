/**
 * GET/POST /api/cron/payout-ledger — tick del sync automatico del ledger.
 *
 * VINCOLO PIANO HOBBY (scoperto 20 lug 2026: schedule sub-giornaliera →
 * Vercel RIFIUTA il deploy): i cron Hobby girano al massimo una volta al
 * giorno. Quindi: UN cron giornaliero (04:00 UTC, vedi vercel.json) che fa un
 * passo (~40s) e poi si AUTO-CONCATENA — invoca sé stesso per il passo
 * successivo finché il lavoro non è finito (guardie: contatore di catena max
 * 25, freshness 90s contro le sovrapposizioni, e la catena muore da sola
 * quando il tick risponde idle). Ogni tick: avanza il job in corso, oppure
 * avvia il sync del primo periodo stantio tra mese corrente e precedente
 * (refresh > 20h fa). I refund tardivi arrivano così ogni notte da soli.
 *
 * Auth: Bearer CRON_SECRET (lib/cron-auth) oppure sessione con SEED (trigger
 * manuale). Il path è pubblico nel middleware.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { continueChain, chainDepth } from "@/lib/cron-chain";
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

async function tick(chain = 0) {
  const job = await getLedgerJob();
  if (job?.status === "running") {
    // La guardia freshness ferma i tick CONCORRENTI (UI + cron insieme), non
    // il figlio della catena: quello arriva per definizione subito dopo il
    // checkpoint del padre ed È la continuazione legittima.
    if (chain === 0 && Date.now() - (job.updated_at || 0) < FRESH_MS) {
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

// Backstop contro loop: ~25 passi coprono il refresh completo di due mesi
// (5-6 passi l'uno) con ampio margine; oltre, qualcosa non va → si ferma e
// riparte domani dal cron.
const MAX_CHAIN = 25;

export async function POST(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const chain = chainDepth(request);
  try {
    const out = await tick(chain);
    // Continua la catena finché il tick produce lavoro: quando risponde
    // idle/skip (o esaurisce i periodi stantii) la catena muore da sola.
    let chained = null;
    if (out.action === "step" || out.action === "start") {
      chained = await continueChain(request, chain, { maxChain: MAX_CHAIN });
    }
    return Response.json({ ...out, chain, ...(chained ? { next: chained } : {}) });
  } catch (e) {
    return Response.json({ action: "error", error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
