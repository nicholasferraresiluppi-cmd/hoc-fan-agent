// Riconciliazione notturna Centro HR ↔ ClickUp (29/09/2026). Smistata dal
// dispatcher (mai cron proprio in vercel.json), gira nella SUA funzione per
// avere il suo budget: import completo della lista, push dei campi rimasti in
// sospeso, schede mai portate su ClickUp, fase allineata con lo stato del task.
// 03/10/2026: nessuna pulizia delle archiviate e nessuna cancellazione di task
// (da procedura non si elimina mai una persona; l'archivio resta come rete di sicurezza).
// 03/10/2026 (upload diretti): dopo l'import si svuota la coda dei documenti
// (hr:upload:pending) e si cancellano dal Blob i file più vecchi di 24 ore che
// non sono in coda (upload abbandonati: un documento d'identità non resta lì).
// La pulizia gira anche con la sync spenta.
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { importFromClickup, hrSyncConfig } from "@/lib/hr-people";
import { drainUploadQueue, cleanupOrphanUploads } from "@/lib/hr-uploads";

async function uploadsPart() {
  const parts = [];
  try {
    if (hrSyncConfig().enabled) {
      const q = await drainUploadQueue({ budgetMs: 10_000 });
      parts.push(q.skipped ? `coda file: ${q.skipped}` : `coda file: ${q.done || 0} arrivati, ${q.queued || 0} in attesa, ${q.failed || 0} abbandonati`);
    }
  } catch (e) {
    parts.push("coda file err:" + (e?.message || "?"));
  }
  try {
    const c = await cleanupOrphanUploads();
    parts.push(c.skipped ? `pulizia blob: ${c.skipped}` : `pulizia blob: ${c.deleted} cancellati su ${c.seen}`);
  } catch (e) {
    parts.push("pulizia blob err:" + (e?.message || "?"));
  }
  return parts.join(" · ");
}

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  if (!hrSyncConfig().enabled) {
    result = "skip:sync-off";
  } else {
    try {
      const r = await importFromClickup({ mode: "reconcile", by: "riconciliazione notturna", budgetMs: 34_000 });
      result = r.ok ? `ok: ${r.tasks} task, ${r.created} nuove, ${r.updated} aggiornate, ${r.pushedBack} rimandati, ${r.archived} archiviate` : `err:${r.reason || r.fatal || "?"}`;
    } catch (e) {
      result = "err:" + (e?.message || "unknown");
    }
  }
  result += " · " + (await uploadsPart());
  await kv.set("cron:heartbeat:hr-clickup", { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
  return Response.json({ result });
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  // GET solo per il cron (Bearer): niente avvio via link con la sessione (CSRF)
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handle(request);
}
