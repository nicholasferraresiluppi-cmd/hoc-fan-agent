// Riconciliazione notturna Centro HR ↔ ClickUp (29/09/2026). Smistata dal
// dispatcher (mai cron proprio in vercel.json), gira nella SUA funzione per
// avere il suo budget: import completo della lista, push dei campi rimasti in
// sospeso, schede mai portate su ClickUp, task da cestinare rimasti in coda.
// Prima di tutto (anche a sync spenta) la pulizia delle schede archiviate da più
// di 30 giorni: si cancellano davvero, scheda e storico (03/10/2026).
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { importFromClickup, hrSyncConfig, purgeExpiredArchived } from "@/lib/hr-people";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  // pulizia delle archiviate scadute: solo KV, budget breve (il grosso del tempo resta alla riconciliazione)
  let purge = "";
  try {
    const pr = await purgeExpiredArchived({ budgetMs: 5_000 });
    purge = pr.purged || pr.deferred ? `; archiviate cancellate ${pr.purged}${pr.deferred ? `, ${pr.deferred} al giro dopo` : ""}` : "";
  } catch (e) {
    purge = `; pulizia archivio err:${e?.message || "unknown"}`;
  }
  if (!hrSyncConfig().enabled) {
    const result = `skip:sync-off${purge}`;
    await kv.set("cron:heartbeat:hr-clickup", { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
    return Response.json({ result });
  }
  let result;
  try {
    const r = await importFromClickup({ mode: "reconcile", by: "riconciliazione notturna", budgetMs: 42_000 });
    result = r.ok ? `ok: ${r.tasks} task, ${r.created} nuove, ${r.updated} aggiornate, ${r.pushedBack} rimandati, ${r.archived} archiviate, ${r.trashed} cestinati` : `err:${r.reason || r.fatal || "?"}`;
  } catch (e) {
    result = "err:" + (e?.message || "unknown");
  }
  result += purge;
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
