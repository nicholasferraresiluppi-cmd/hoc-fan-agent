/**
 * POST /api/admin/hr/people/[id]/restore — "Ripristina" una scheda archiviata (Centro HR, SEED, 03/10/2026).
 *
 * La scheda torna attiva e alla prima sincronizzazione crea un task NUOVO su
 * ClickUp (quello nel cestino di ClickUp non si recupera da qui). Se il vecchio
 * task non era ancora stato cancellato (cancellazione in coda) lo riprende.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { restorePerson, publicPerson } from "@/lib/hr-people";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const r = await restorePerson(id, az.userId);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, sync: r.sync, person: publicPerson(r.person, { withCfMask: true }) });
}
