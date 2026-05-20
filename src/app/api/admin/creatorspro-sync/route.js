/**
 * /api/admin/creatorspro-sync
 *
 * v2: sync incrementale per stare sotto Vercel Hobby 60s.
 *
 * POST body action variants:
 *   { action: "refdata" }
 *     → fetch members/groups/intervals
 *   { action: "prepare", period_id }
 *     → fetch wage stub list e salva su KV (rapido, ~10-15s)
 *   { action: "batch", period_id, offset, batch_size }
 *     → fetch detail di [offset, offset+batch_size]
 *   { action: "finalize", period_id }
 *     → auto-match + scrive cp:_meta
 *
 * Variant retrocompatibile:
 *   { period_id } (senza action) → esegue tutti gli step in sequenza.
 *     NB: questo può andare in timeout su Hobby per periodi grandi.
 *     Il client UI dovrebbe usare le action separate.
 *
 * GET → status sync corrente (cp:_meta).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import {
  syncRefdata,
  prepareSync,
  syncWageBatch,
  finalizeSync,
  getSyncStatus,
} from "@/lib/creatorspro-sync";

export const maxDuration = 60; // Hobby plan max

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body?.action;
  const period_id = body?.period_id;

  try {
    if (action === "refdata") {
      const r = await syncRefdata();
      return Response.json({ ok: true, action, ...r });
    }
    if (action === "prepare") {
      if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
        return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
      }
      // Modalità incrementale se page_offset specificato
      const pageOffset = body.page_offset !== undefined ? parseInt(body.page_offset, 10) : null;
      const pagesLimit = body.pages_limit !== undefined ? parseInt(body.pages_limit, 10) : null;
      const r = await prepareSync({ periodId: period_id, pageOffset, pagesLimit });
      return Response.json({ ok: true, action, period_id, ...r });
    }
    if (action === "batch") {
      if (!period_id) return Response.json({ error: "period_id richiesto" }, { status: 400 });
      const offset = Math.max(0, parseInt(body.offset || 0, 10));
      const batchSize = Math.max(1, Math.min(100, parseInt(body.batch_size || 50, 10)));
      const r = await syncWageBatch({ periodId: period_id, offset, batchSize });
      return Response.json({ ok: true, action, period_id, ...r });
    }
    if (action === "finalize") {
      if (!period_id) return Response.json({ error: "period_id richiesto" }, { status: 400 });
      const r = await finalizeSync({ periodId: period_id });
      await logAuditAction({
        action: "creatorspro.sync",
        target: period_id,
        by: az.userId,
        meta: { counts: r.meta.counts, duration_ms: r.meta.duration_ms },
      });
      return Response.json({ ok: true, action, ...r });
    }

    // Retrocompat: senza action, fa tutto in sequenza (rischio timeout su Hobby!)
    if (period_id && /^\d{4}-\d{2}$/.test(period_id)) {
      await syncRefdata();
      const prep = await prepareSync({ periodId: period_id });
      let off = 0;
      while (off < prep.total) {
        const r = await syncWageBatch({ periodId: period_id, offset: off, batchSize: 50 });
        off = r.next_offset;
        if (r.done) break;
      }
      const fin = await finalizeSync({ periodId: period_id });
      await logAuditAction({
        action: "creatorspro.sync.full",
        target: period_id,
        by: az.userId,
        meta: { counts: fin.meta.counts, duration_ms: fin.meta.duration_ms },
      });
      return Response.json({ ok: true, ...fin });
    }

    return Response.json({ error: "action required (refdata|prepare|batch|finalize) o period_id YYYY-MM" }, { status: 400 });
  } catch (e) {
    console.error("CP sync error:", e);
    return Response.json({ error: "Sync step failed", reason: String(e?.message || e), action }, { status: 500 });
  }
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const status = await getSyncStatus();
  return Response.json(status);
}
