// Foglio «Anagrafica Operatori» ← CRM persone (17/11/2026). Smistata dal dispatcher (mai cron
// proprio in vercel.json), nella SUA funzione per avere il suo budget. Solo aggiunta in fondo:
// regole in lib/hr-anagrafica-sheet-core.js.
// Difesa propria via cron-auth (path pubblico /api/cron/*), + people.manage da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { syncAnagraficaSheet } from "@/lib/hr-anagrafica-sheet";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try {
    const r = await syncAnagraficaSheet();
    result = r.ok ? `${r.added} aggiunte, ${r.present} già nel foglio` : `skip:${r.reason}`;
  } catch (e) {
    result = "err:" + (e?.message || "unknown");
  }
  await kv.set("cron:heartbeat:hr-anagrafica-sheet", { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
  return Response.json({ ok: true, result });
}

export const GET = handle;
export const POST = handle;
