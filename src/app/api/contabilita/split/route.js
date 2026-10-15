/**
 * /api/contabilita/split — accordi dello split (team/creator e persone).
 * Accesso: lib/compensi-access (titolari + chi ha l'accesso contabilità; admin no).
 * GET → { config, months, owner }      PUT { config, rev } → solo TITOLARE (sono contratti)
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getSplitConfig, saveSplitConfig, listSplitMonths } from "@/lib/split";
import { ConflictError } from "@/lib/compensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET() {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const [config, months] = await Promise.all([getSplitConfig(), listSplitMonths()]);
  await audit(az.userId, "conto split aperto");
  return Response.json({ config, months, owner: az.owner }, { headers: NS });
}

export async function PUT(request) {
  const az = await requireAccounting({ action: "accordi split", ownerOnly: true });
  if (!az.ok) return az.response;
  const body = await request.json().catch(() => null);
  if (!body?.config) return Response.json({ error: "dati mancanti" }, { status: 400, headers: NS });
  try {
    const config = await saveSplitConfig(body.config, { by: az.userId, expectRev: body.rev ?? null });
    await audit(az.userId, "accordi split salvati", { name: `${config.teams.length} team, ${config.people.length} accordi persona` });
    return Response.json({ config }, { headers: NS });
  } catch (e) {
    if (e instanceof ConflictError) return Response.json({ error: e.message }, { status: 409, headers: NS });
    return Response.json({ error: e.message || "Errore" }, { status: 500, headers: NS });
  }
}
