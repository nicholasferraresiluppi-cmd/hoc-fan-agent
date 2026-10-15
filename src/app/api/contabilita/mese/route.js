/**
 * /api/contabilita/mese?m=YYYY-MM — un mese di compensi.
 * GET    → { doc, payees: { [personKey]: { iban mascherato, conti, fattura } } }
 * PUT    → { doc, rev } salva (409 se nel frattempo qualcuno ha salvato)
 * POST   → { from? } crea il mese copiando `from`
 * DELETE → solo titolare
 * I calcoli si rifanno nel browser con compensi-core (stessa funzione, niente drift).
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getMonth, saveMonth, createMonthFrom, deleteMonth, getPayees, maskIban, ConflictError } from "@/lib/compensi";
import { isMonthId } from "@/lib/compensi-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };
const bad = (error, status = 400) => Response.json({ error }, { status, headers: NS });

function maskedPayees(all) {
  const out = {};
  for (const [k, p] of Object.entries(all?.byKey || {})) {
    out[k] = {
      invoice: Boolean(p.invoice),
      accounts: (p.accounts || []).map((a) => ({ label: a.label, iban: maskIban(a.iban), share: a.share || "" })),
      hasAddress: Boolean(p.address || p.city),
    };
  }
  return out;
}

export async function GET(request) {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const m = new URL(request.url).searchParams.get("m");
  if (!isMonthId(m)) return bad("mese non valido");
  const doc = await getMonth(m);
  if (!doc) return bad("mese non trovato", 404);
  await audit(az.userId, "mese aperto", { month: m });
  return Response.json({ doc, payees: maskedPayees(await getPayees()) }, { headers: NS });
}

export async function PUT(request) {
  const az = await requireAccounting({ action: "write" });
  if (!az.ok) return az.response;
  const m = new URL(request.url).searchParams.get("m");
  if (!isMonthId(m)) return bad("mese non valido");
  const body = await request.json().catch(() => null);
  if (!body?.doc) return bad("dati mancanti");
  try {
    const doc = await saveMonth(m, body.doc, { by: az.userId, expectRev: body.rev ?? null });
    await audit(az.userId, "mese salvato", { month: m, rev: doc.rev, lines: doc.lines.length });
    return Response.json({ doc }, { headers: NS });
  } catch (e) {
    if (e instanceof ConflictError) return bad(e.message, 409);
    return bad(e.message || "Errore", 500);
  }
}

export async function POST(request) {
  const az = await requireAccounting({ action: "write" });
  if (!az.ok) return az.response;
  const m = new URL(request.url).searchParams.get("m");
  if (!isMonthId(m)) return bad("mese non valido");
  const body = await request.json().catch(() => ({}));
  const from = isMonthId(body?.from) ? body.from : null;
  try {
    const doc = await createMonthFrom(m, from, { by: az.userId });
    await audit(az.userId, "mese creato", { month: m, from });
    return Response.json({ doc }, { headers: NS });
  } catch (e) {
    return bad(e.message || "Errore");
  }
}

export async function DELETE(request) {
  const az = await requireAccounting({ action: "delete", ownerOnly: true });
  if (!az.ok) return az.response;
  const m = new URL(request.url).searchParams.get("m");
  if (!isMonthId(m)) return bad("mese non valido");
  await deleteMonth(m);
  await audit(az.userId, "mese eliminato", { month: m });
  return Response.json({ ok: true }, { headers: NS });
}
