/**
 * POST /api/admin/richieste/[token]/file { pathname } — «caricato» per riferimento o nota vocale
 * (26/11/2026). Controlla il file vero (peso e primi byte) e lo aggancia alla ripresa.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { confirmUpload, validToken } from "@/lib/richieste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { token } = await props.params;
  if (!validToken(token)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const r = await confirmUpload(token, body?.pathname, "app");
  return Response.json(r.ok ? r : { error: r.error }, { status: r.ok ? 200 : r.status });
}
