/**
 * POST /api/admin/hr/form-links — crea il link di compilazione (Centro HR, SEED).
 * Body: { personId? , label? } — senza personId il modulo crea una persona nuova.
 * Restituisce il PERCORSO da copiare: nessuna email parte da qui (Resend non
 * è verificato e la scelta del canale resta a chi manda il link).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { createFormLink } from "@/lib/hr-people";

export const runtime = "nodejs";

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const res = await createFormLink({ personId: body?.personId || null, label: body?.label || "", actor: az.userId });
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json({ ok: true, path: res.path, expiresAt: res.expiresAt }, { status: 201 });
}
