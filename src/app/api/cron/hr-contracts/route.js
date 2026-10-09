// Contratti Dropbox Sign → Centro HR (09/10/2026). Smistata dal dispatcher (mai cron
// proprio in vercel.json), nella SUA funzione per avere il suo budget: elenco richieste,
// lettura dei contratti nuovi, stato del contratto sulle schede, PDF firmati su ClickUp.
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { syncContracts, beat } from "@/lib/hr-contracts";
import { dropboxSignConfigured } from "@/lib/dropbox-sign";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  if (!dropboxSignConfigured()) result = "skip:no-key";
  else {
    try {
      const r = await syncContracts({ budgetMs: 48_000 });
      result = r.ok
        ? `ok: ${r.requests} richieste, ${r.classified} lette${r.pending ? ` (${r.pending} al prossimo giro)` : ""}, ${r.statusSet} stati, ${r.attached} PDF${r.attachPending ? ` (+${r.attachPending} in attesa)` : ""}${r.errors.length ? `, ${r.errors.length} errori` : ""}`
        : `err:${r.reason}`;
    } catch (e) {
      result = "err:" + (e?.message || "unknown");
    }
  }
  await beat(result);
  return Response.json({ result });
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handle(request);
}
