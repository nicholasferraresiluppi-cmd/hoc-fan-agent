/**
 * /api/contabilita/accordi — accordi con le creator (percentuale HOC sulle revenue in $).
 * Stesso accesso della contabilità (lib/compensi-access: titolari + membri, admin no).
 * GET → { rev, deals, teamEcosystems }      PUT { deals, rev, teamEcosystems? } → solo TITOLARE (sono contratti)
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getDeals, saveDeals } from "@/lib/creator-deals";
import { ConflictError } from "@/lib/compensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET() {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  await audit(az.userId, "accordi creator aperti");
  return Response.json(await getDeals(), { headers: NS });
}

export async function PUT(request) {
  const az = await requireAccounting({ action: "accordi", ownerOnly: true });
  if (!az.ok) return az.response;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.deals)) return Response.json({ error: "dati mancanti" }, { status: 400, headers: NS });
  try {
    const before = await getDeals();
    const doc = await saveDeals(body.deals, { by: az.userId, expectRev: body.rev ?? null, teamEcosystems: body.teamEcosystems });
    const was = new Map(before.deals.map((d) => [d.id, JSON.stringify(d)]));
    const changed = doc.deals.filter((d) => was.get(d.id) !== JSON.stringify(d)).map((d) => d.creator);
    const removed = before.deals.filter((d) => !doc.deals.some((x) => x.id === d.id)).map((d) => d.creator);
    const teamsChanged = JSON.stringify(before.teamEcosystems || {}) !== JSON.stringify(doc.teamEcosystems);
    await audit(az.userId, "accordi creator salvati", { name: [...changed, ...removed.map((r) => `− ${r}`), ...(teamsChanged ? ["squadre→ecosistemi"] : [])].join(", ").slice(0, 300) || "nessun cambio" });
    return Response.json(doc, { headers: NS });
  } catch (e) {
    if (e instanceof ConflictError) return Response.json({ error: e.message }, { status: 409, headers: NS });
    return Response.json({ error: e.message || "Errore" }, { status: 500, headers: NS });
  }
}
