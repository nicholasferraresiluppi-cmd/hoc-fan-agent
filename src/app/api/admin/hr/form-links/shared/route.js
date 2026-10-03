/**
 * /api/admin/hr/form-links/shared — il link UNICO del modulo HR (Centro HR, SEED, 03/10/2026).
 *
 * GET  → { link: { path, createdAt } | null }
 * POST { action: "regenerate" } → crea il link, o lo sostituisce (il vecchio smette di funzionare)
 * POST { action: "disable" }    → nessun link attivo finché non se ne crea uno nuovo
 *
 * Il token non ha scadenza: vale finché un admin non lo cambia. Nessuna email
 * parte da qui: il link si copia.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getSharedFormLink, regenerateSharedFormLink, disableSharedFormLink } from "@/lib/hr-people";

export const runtime = "nodejs";

const view = (l) => (l ? { path: l.path, createdAt: l.createdAt } : null);

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const link = await getSharedFormLink();
  return Response.json({ ok: true, link: view(link) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { body = {}; }
  if (body?.action === "regenerate") {
    const r = await regenerateSharedFormLink({ actor: az.userId });
    return Response.json({ ok: true, link: view(r), replaced: r.replaced });
  }
  if (body?.action === "disable") {
    await disableSharedFormLink({ actor: az.userId });
    return Response.json({ ok: true, link: null });
  }
  return Response.json({ error: "Azione non prevista." }, { status: 400 });
}
