/**
 * /api/admin/creatorspro-sync
 *
 * Triggera il sync di un periodo da CreatorsPro a KV.
 * Capability richiesta: SEED (admin only).
 *
 * POST body: { period_id: "YYYY-MM" }
 * Response: { ok, meta, unmatched_sample }
 *
 * NB: questa è una operazione lunga (~30-120s per mese con 500+ wage).
 * Vercel default timeout serverless: 60s su free, fino a 300s su Pro.
 * Se vai in timeout, valuta:
 *   - Sync di periodi più stretti (es. settimanale invece di mensile)
 *   - Sposta su cron job dedicato
 *   - Sync incrementale (skip wage già normalizzati)
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { syncPeriod, getSyncStatus } from "@/lib/creatorspro-sync";

// Estende il timeout della serverless function al massimo del piano corrente.
// Su Vercel Hobby = 60s, Pro = 300s, Enterprise = 900s.
export const maxDuration = 300;

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { period_id } = body || {};
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id richiesto in formato YYYY-MM" }, { status: 400 });
  }

  try {
    const result = await syncPeriod({
      periodId: period_id,
      onProgress: (p) => {
        // In production niente streaming SSE per ora — log solo
        console.log(`[CP sync ${period_id}]`, p);
      },
    });
    await logAuditAction({
      action: "creatorspro.sync",
      target: period_id,
      by: az.userId,
      meta: { counts: result.meta.counts, duration_ms: result.meta.duration_ms },
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("CP sync error:", e);
    return Response.json({ error: "Sync failed", reason: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const status = await getSyncStatus();
  return Response.json(status);
}
