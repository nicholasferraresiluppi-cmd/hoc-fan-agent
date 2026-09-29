/**
 * POST /api/admin/hr/people/[id]/reveal-cf — mostra il codice fiscale in chiaro.
 * Ogni lettura finisce nello storico della scheda (chi e quando). POST, non
 * GET: un link cliccato o un prefetch non devono poter svelare il dato.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { revealCf } from "@/lib/hr-people";

export const runtime = "nodejs";

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const res = await revealCf(id, az.userId);
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json({ ok: true, value: res.value }, { headers: { "Cache-Control": "no-store" } });
}
