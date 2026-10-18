// «Contratti da recuperare» nella lista Milestone dell'Area Partner (18/10/2026). Smistata dal
// dispatcher (mai cron proprio in vercel.json), nella SUA funzione per avere il suo budget.
// Al primo giro crea un sottotask per ognuna delle persone senza contratto firmato; se il tempo
// finisce, il resto lo fa il giro dopo (o il bottone in /admin/hr/sync).
// Difesa propria via cron-auth (path pubblico /api/cron/*), + people.manage da sessione.
export const runtime = "nodejs";
export const maxDuration = 60;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { syncContractMilestones } from "@/lib/hr-contract-milestone";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try {
    const r = await syncContractMilestones({ budgetMs: 48_000 });
    result = r.ok ? `${r.created} creati, ${r.closed} chiusi, ${r.open} aperti${r.pending ? `, ${r.pending} al prossimo giro` : ""}${r.errors.length ? `, ${r.errors.length} errori: ${r.errors.slice(0, 2).join("; ")}` : ""}` : `skip:${r.reason}`;
  } catch (e) {
    result = "err:" + (e?.message || "unknown");
  }
  await kv.set("cron:heartbeat:hr-milestones", { at: Date.now(), result }, { ex: 40 * 24 * 3600 }).catch(() => {});
  return Response.json({ ok: true, result });
}

export const GET = handle;
export const POST = handle;
