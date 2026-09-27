/**
 * GET /api/admin/citta/ufficio?t=<palazzo> — l'ufficio di un palazzo della città: team chat,
 * team progetto (ClickUp + anagrafica), presenza da Calendar. SEED: contiene costi delle persone.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { buildOffice } from "@/lib/citta-people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const t = new URL(request.url).searchParams.get("t") || "";
  try {
    return Response.json(await buildOffice(t.slice(0, 60)));
  } catch (e) {
    const msg = String(e?.message || e);
    return Response.json({ error: msg }, { status: msg === "Palazzo sconosciuto" ? 404 : 500 });
  }
}
