// Riconciliazione notturna Centro HR ↔ ClickUp (29/09/2026). Smistata dal
// dispatcher (mai cron proprio in vercel.json), gira nella SUA funzione per
// avere il suo budget: import completo della lista, push dei campi rimasti in
// sospeso, schede mai portate su ClickUp, fase allineata con lo stato del task.
// 03/10/2026: nessuna pulizia delle archiviate e nessuna cancellazione di task
// (da procedura non si elimina mai una persona; l'archivio resta come rete di sicurezza).
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { importFromClickup, hrSyncConfig } from "@/lib/hr-people";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  if (!hrSyncConfig().enabled) {
    const result = "skip:sync-off";
    await kv.set("cron:heartbeat:hr-clickup", { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
    return Response.json({ result });
  }
  let result;
  try {
    const r = await importFromClickup({ mode: "reconcile", by: "riconciliazione notturna", budgetMs: 42_000 });
    result = r.ok ? `ok: ${r.tasks} task, ${r.created} nuove, ${r.updated} aggiornate, ${r.pushedBack} rimandati, ${r.archived} archiviate` : `err:${r.reason || r.fatal || "?"}`;
  } catch (e) {
    result = "err:" + (e?.message || "unknown");
  }
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
