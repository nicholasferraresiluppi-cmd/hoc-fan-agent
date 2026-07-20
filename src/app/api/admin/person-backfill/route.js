/**
 * /api/admin/person-backfill — popola l'event-store persona dai dati esistenti.
 *
 * GET            → DRY-RUN (nessuna scrittura): report di cosa verrebbe scritto,
 *                  con statistiche di risoluzione identità e fonti vuote.
 * POST {run:true} → esecuzione reale (idempotente, ri-eseguibile).
 *
 * Admin-only (SEED). Scrive nel namespace `person:*` (event-store, ADR
 * docs/PERSON_EVENT_STORE.md). Backfill = tutte le fonti (decisione ADR §8).
 * NB: finché le fonti a monte (profili, certificazioni, QA, coaching, dispute,
 * action-center) non sono popolate, il backfill è un no-op che scrive 0 eventi.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { runBackfill } from "@/lib/person-backfill";

export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const report = await runBackfill({ dryRun: true });
  return Response.json(report);
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body = {};
  try { body = await request.json(); } catch { /* body opzionale */ }
  if (!body?.run) {
    return Response.json({ error: "POST con { run: true } per eseguire davvero; GET per dry-run" }, { status: 400 });
  }

  const report = await runBackfill({ dryRun: false });
  try {
    await logAuditAction({ action: "person.backfill", target: "all", by: az.userId || null, meta: { written: report.written, by_source: report.by_source } });
  } catch { /* audit best-effort */ }
  return Response.json(report);
}
