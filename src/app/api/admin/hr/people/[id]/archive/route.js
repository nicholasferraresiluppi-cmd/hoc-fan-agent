/**
 * POST /api/admin/hr/people/[id]/archive — "Elimina" dalla scheda (Centro HR, SEED, 03/10/2026).
 *
 * La scheda va tra le ARCHIVIATE (non si sincronizza più) e il task ClickUp va nel
 * cestino (su ClickUp è recuperabile per 30 giorni). Se ClickUp non risponde la
 * scheda va comunque in archivio e la cancellazione del task resta in coda: la
 * riprova la riconciliazione notturna. Tutto finisce nello storico della scheda.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { archivePerson, publicPerson } from "@/lib/hr-people";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const r = await archivePerson(id, az.userId);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, task: r.task || null, already: Boolean(r.already), error: r.error || null, person: publicPerson(r.person, { withCfMask: true }) });
}
