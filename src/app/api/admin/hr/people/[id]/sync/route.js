/**
 * POST /api/admin/hr/people/[id]/sync — riporta la scheda su ClickUp adesso
 * (tutti i campi; crea il task se manca). Per i casi "errore" / "task cancellato".
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson, pushPersonSafe, publicPerson } from "@/lib/hr-people";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  const r = await pushPersonSafe(p, null, { actor: az.userId });
  return Response.json({ ok: r.status === "ok" || r.status === "partial", status: r.status, message: r.message, errors: r.errors, skipped: r.skipped, person: publicPerson(r.person, { withCfMask: true }) });
}
