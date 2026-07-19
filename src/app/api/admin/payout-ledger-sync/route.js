/**
 * /api/admin/payout-ledger-sync — orchestrazione sync ledger transazioni.
 *
 *   GET  ?period_id=YYYY-MM   → stato job + periodi sincronizzati + meta periodo
 *   POST { action: "start", period_id }  → avvia il job per il periodo
 *   POST { action: "step" }              → un passo (~40s); il client lo
 *                                          richiama in loop finché has_more
 *
 * Stesso modello driver di infloww-agency/wage-audit: il client orchestra,
 * lo stato vive in KV, ogni passo sta sotto i 60s di Vercel.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import {
  getLedgerJob, startLedgerJob, stepLedgerJob, resetLedgerJob,
  getLedgerPeriods, getLedgerMeta,
} from "@/lib/payout-ledger";

export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  const [job, periods, meta] = await Promise.all([
    getLedgerJob(),
    getLedgerPeriods(),
    /^\d{4}-\d{2}$/.test(periodId) ? getLedgerMeta(periodId) : Promise.resolve(null),
  ]);
  return Response.json({ job, periods, period_meta: meta });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body?.action === "start") {
    const periodId = String(body?.period_id || "");
    if (!/^\d{4}-\d{2}$/.test(periodId)) return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
    const running = await getLedgerJob();
    if (running?.status === "running") {
      return Response.json({ error: `Job già in corso su ${running.period_id} (${running.last_step}). Completa o attendi.` }, { status: 409 });
    }
    try {
      const job = await startLedgerJob(periodId);
      await logAuditAction({
        action: "payout.ledger.sync.start",
        target: periodId,
        by: az.userId,
        meta: { creators: job.total_creators },
      });
      return Response.json({ ok: true, job });
    } catch (e) {
      return Response.json({ error: String(e?.message || e) }, { status: 502 });
    }
  }

  if (body?.action === "step") {
    const res = await stepLedgerJob();
    return Response.json(res);
  }

  if (body?.action === "reset") {
    // Sblocco di un job incastrato in "running" (senza aspettare il TTL 6h).
    const prev = await getLedgerJob();
    await resetLedgerJob();
    await logAuditAction({
      action: "payout.ledger.sync.reset",
      target: prev?.period_id || "job",
      by: az.userId,
      meta: { last_step: prev?.last_step || null, status: prev?.status || null },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "action deve essere 'start', 'step' o 'reset'" }, { status: 400 });
}
