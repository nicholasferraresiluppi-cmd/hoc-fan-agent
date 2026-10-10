/**
 * /api/admin/hr/contracts — contratti Dropbox Sign nel Centro HR (SEED, 09/10/2026).
 *
 * GET  → { view (stato per persona, contratti, senza scheda), configured, sync }
 * POST → { action: "sync" }                       aggiorna da Dropbox Sign adesso (a budget)
 *        { action: "link", contractId, personId }  collega a mano ("none" = non è del personale, null = automatico)
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getView, syncContracts, setContractLink, beat } from "@/lib/hr-contracts";
import { dropboxSignConfigured } from "@/lib/dropbox-sign";
import { hrSyncConfig } from "@/lib/hr-people";
import { kickEndpoint } from "@/lib/cron-chain";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { view, people } = await getView();
  const phases = Object.fromEntries(people.filter((p) => !p.archived).map((p) => [p.id, { phase: p.fields?.collaborationStatus || null, mansioni: p.fields?.mansioni || [] }]));
  return Response.json({ view, phases, configured: dropboxSignConfigured(), sync: { enabled: hrSyncConfig().enabled } });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  if (body?.action === "sync") {
    const r = await syncContracts({ budgetMs: 45_000, by: az.userId });
    await beat(r.ok ? `manuale: ${r.requests} contratti, ${r.classified} letti, ${r.statusSet} stati, ${r.attached} PDF${r.more ? " → continua in background" : ""}` : `manuale err: ${r.reason}`);
    // il resto (contratti da leggere, PDF da allegare) prosegue da solo dopo la risposta
    if (r.ok && r.more) after(() => kickEndpoint(request, "/api/cron/hr-contracts?apply=1").catch(() => {}));
    return Response.json(r, { status: r.ok ? 200 : r.reason?.includes("in corso") ? 409 : 502 });
  }
  if (body?.action === "link") {
    const contractId = String(body.contractId || "");
    const personId = body.personId === null || body.personId === "" ? null : String(body.personId);
    if (!contractId) return Response.json({ error: "contractId mancante." }, { status: 400 });
    const r = await setContractLink(contractId, personId, { actor: az.userId });
    return Response.json(r, { status: r.ok ? 200 : r.status || 400 });
  }
  return Response.json({ error: "Azione sconosciuta." }, { status: 400 });
}
