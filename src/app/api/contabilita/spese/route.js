/**
 * /api/contabilita/spese — registro delle spese non-persona dello split (18/11/2026).
 * Accesso: lib/compensi-access (titolari + chi ha l'accesso contabilità; admin no).
 * GET → { doc: { rev, items }, owner }      PUT { items, rev } → salva
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getSplitExpenses, saveSplitExpenses } from "@/lib/split";
import { ConflictError } from "@/lib/compensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET() {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const doc = await getSplitExpenses();
  return Response.json({ doc, owner: az.owner }, { headers: NS });
}

export async function PUT(request) {
  const az = await requireAccounting({ action: "spese split" });
  if (!az.ok) return az.response;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.items)) return Response.json({ error: "dati mancanti" }, { status: 400, headers: NS });
  try {
    const doc = await saveSplitExpenses(body.items, { by: az.userId, expectRev: body.rev ?? null });
    await audit(az.userId, "spese split salvate", { name: `${doc.items.length} voci`, rev: doc.rev });
    return Response.json({ doc }, { headers: NS });
  } catch (e) {
    if (e instanceof ConflictError) return Response.json({ error: e.message }, { status: 409, headers: NS });
    return Response.json({ error: e.message || "Errore" }, { status: 500, headers: NS });
  }
}
