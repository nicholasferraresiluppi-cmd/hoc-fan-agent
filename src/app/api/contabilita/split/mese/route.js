/**
 * /api/contabilita/split/mese?m=YYYY-MM — numeri del mese dello split (revenue, chatter, cambio, extra).
 * GET → { doc }   PUT { doc, rev } → salva   POST → crea   DELETE → solo titolare
 * Il conto si rifà nel browser con split-core (stessa funzione dei test).
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getSplitMonth, saveSplitMonth, createSplitMonth, deleteSplitMonth } from "@/lib/split";
import { ConflictError } from "@/lib/compensi";
import { isMonthId } from "@/lib/compensi-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };
const bad = (error, status = 400) => Response.json({ error }, { status, headers: NS });
const monthOf = (request) => new URL(request.url).searchParams.get("m");

export async function GET(request) {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const m = monthOf(request);
  if (!isMonthId(m)) return bad("mese non valido");
  const doc = await getSplitMonth(m);
  if (!doc) return bad("mese non trovato", 404);
  return Response.json({ doc }, { headers: NS });
}

export async function PUT(request) {
  const az = await requireAccounting({ action: "write" });
  if (!az.ok) return az.response;
  const m = monthOf(request);
  if (!isMonthId(m)) return bad("mese non valido");
  const body = await request.json().catch(() => null);
  if (!body?.doc) return bad("dati mancanti");
  try {
    const doc = await saveSplitMonth(m, body.doc, { by: az.userId, expectRev: body.rev ?? null });
    await audit(az.userId, "mese split salvato", { month: m, rev: doc.rev });
    return Response.json({ doc }, { headers: NS });
  } catch (e) {
    if (e instanceof ConflictError) return bad(e.message, 409);
    return bad(e.message || "Errore", 500);
  }
}

export async function POST(request) {
  const az = await requireAccounting({ action: "write" });
  if (!az.ok) return az.response;
  const m = monthOf(request);
  if (!isMonthId(m)) return bad("mese non valido");
  try {
    const doc = await createSplitMonth(m, { by: az.userId });
    await audit(az.userId, "mese split creato", { month: m });
    return Response.json({ doc }, { headers: NS });
  } catch (e) {
    return bad(e.message || "Errore");
  }
}

export async function DELETE(request) {
  const az = await requireAccounting({ action: "delete", ownerOnly: true });
  if (!az.ok) return az.response;
  const m = monthOf(request);
  if (!isMonthId(m)) return bad("mese non valido");
  await deleteSplitMonth(m);
  await audit(az.userId, "mese split eliminato", { month: m });
  return Response.json({ ok: true }, { headers: NS });
}
