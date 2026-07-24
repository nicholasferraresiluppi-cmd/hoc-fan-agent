/**
 * GET/POST /api/cron/dispatch — smistatore giornaliero dei lavori schedulati.
 *
 * PERCHÉ (lun 20 lug 2026): su Hobby ogni cron scatta "entro l'ora" (±59
 * min, doc Vercel) → l'ORDINE tra cron separati non è garantito: il digest
 * delle 06:05 può scattare prima del run delle 06:00 (slittato alle 06:50)
 * e leggere findings stantii. Osservato inoltre il primo lunedì reale: lo
 * snapshot (00:05) è scattato alle 00:10, il run alert (06:00) ha perso la
 * finestra (probabile interferenza del deploy delle ~06:40, in mezzo alla
 * finestra) — con cron indipendenti un lavoro perso non si nota. Il limite
 * di CONTEGGIO invece non c'entra: 100 cron/progetto su tutti i piani dal
 * 20 gen 2026 (changelog Vercel).
 *
 * Soluzione: vercel.json dichiara SOLO 2 cron — lo snapshot leaderboard
 * (sensibile al confine settimana, resta alle 00:05 del lunedì) e questo
 * dispatcher (03:00 UTC ogni giorno), che esegue il resto in SEQUENZA
 * deterministica in base al giorno:
 *   - sempre:            tick cp-wages e payout-ledger (auto-concatenanti)
 *                        + snapshot coda del loop azione→esito (queue-snapshot)
 *   - lunedì:            run alert operativi + digest email (in sequenza:
 *                        il digest legge i findings scritti dal run)
 *   - giorno 1 del mese: snapshot leghe (chiusura stagione)
 *
 * Gli endpoint smistati restano invocabili singolarmente (UI/manuale).
 * Auth: Bearer CRON_SECRET o sessione SEED; path pubblico nel middleware.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { kickEndpoint } from "@/lib/cron-chain";

export const maxDuration = 60;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const now = new Date();
  const out = {
    monday: now.getUTCDay() === 1,
    first_of_month: now.getUTCDate() === 1,
  };
  await kv.set("cron:heartbeat:dispatch", { at: Date.now(), via: viaCron ? "cron" : "session" }, { ex: 40 * 24 * 3600 }).catch(() => {});

  if (out.monday) {
    out.alerts_run = await kickEndpoint(request, "/api/admin/ops-alerts/run", { awaitResponse: true });
    out.alerts_digest = await kickEndpoint(request, "/api/admin/ops-alerts/digest", { awaitResponse: true });
  }
  if (out.first_of_month) {
    out.leagues_snapshot = await kickEndpoint(request, "/api/leagues/snapshot", { awaitResponse: true });
  }
  out.cp_wages = await kickEndpoint(request, "/api/cron/cp-wages");
  out.payout_ledger = await kickEndpoint(request, "/api/cron/payout-ledger");
  out.queue_snapshot = await kickEndpoint(request, "/api/cron/queue-snapshot");

  // Riscalda la cache degli Academy Signals (query analitica pesante): così la
  // GET admin legge sempre dalla cache invece di calcolare inline. Best-effort:
  // un errore qui non deve far fallire il dispatcher.
  try {
    const { getAcademySignals, bigQueryConfigured } = await import("@/lib/academy-signals");
    if (bigQueryConfigured()) {
      await getAcademySignals({ force: true });
      out.academy_signals = "ok";
    } else {
      out.academy_signals = "skip:no-bq";
    }
  } catch (e) {
    out.academy_signals = "err:" + (e?.message || "unknown");
  }

  return Response.json(out);
}

export async function GET(request) {
  return POST(request);
}
