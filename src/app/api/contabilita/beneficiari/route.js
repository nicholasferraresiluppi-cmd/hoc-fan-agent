/**
 * /api/contabilita/beneficiari?person=Nome — dati di pagamento COMPLETI di una persona
 * (IBAN in chiaro). Ogni apertura finisce nel registro: l'IBAN si guarda una
 * persona alla volta, mai in blocco.
 * GET → { payee }   PUT { person, payee } → salva
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getPayees, savePayee } from "@/lib/compensi";
import { personKey } from "@/lib/compensi-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET(request) {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const person = new URL(request.url).searchParams.get("person") || "";
  const key = personKey(person);
  if (!key) return Response.json({ error: "persona mancante" }, { status: 400, headers: NS });
  const all = await getPayees();
  await audit(az.userId, "dati di pagamento visti", { person: key });
  return Response.json({ payee: all.byKey[key] || null }, { headers: NS });
}

export async function PUT(request) {
  const az = await requireAccounting({ action: "write" });
  if (!az.ok) return az.response;
  const body = await request.json().catch(() => null);
  if (!body?.person) return Response.json({ error: "persona mancante" }, { status: 400, headers: NS });
  try {
    const payee = await savePayee(body.person, body.payee || {}, { by: az.userId });
    await audit(az.userId, "dati di pagamento modificati", { person: personKey(body.person) });
    return Response.json({ payee }, { headers: NS });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400, headers: NS });
  }
}
