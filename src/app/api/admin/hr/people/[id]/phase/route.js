/**
 * POST /api/admin/hr/people/[id]/phase — "Segna come uscita" e "Riattiva" (Centro HR, SEED, 03/10/2026).
 *
 * Da procedura non si elimina mai una persona: chi va via resta nel CRM con la
 * fase "Uscita". Corpo:
 *   { action: "exit", endDate?: "YYYY-MM-DD" } → fase "Uscita" + Fine collaborazione
 *        (la data scelta nella conferma; senza, quella già in scheda o oggi)
 *   { action: "reactivate" }                    → fase "Attiva"
 * La scheda resta e si sincronizza come sempre (tendina, stato del task, data).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { markPersonExited, reactivatePerson, publicPerson } from "@/lib/hr-people";
import { accessForPerson } from "@/lib/hr-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  let res;
  if (body?.action === "exit") res = await markPersonExited(id, { endDate: body.endDate ? String(body.endDate) : null, actor: az.userId });
  else if (body?.action === "reactivate") res = await reactivatePerson(id, { actor: az.userId });
  else return Response.json({ error: "Azione non prevista." }, { status: 400 });
  if (!res.ok) return Response.json({ error: res.errors.join(" ") }, { status: res.status });
  // all'uscita: chi ha ancora un account HOC Pro o un team (la checklist del dopo-uscita). Mai bloccante.
  const access = body.action === "exit" ? await accessForPerson(res.person?.fields).catch(() => null) : null;
  return Response.json({ ok: true, person: publicPerson(res.person, { withCfMask: true }), changed: res.changed, sync: res.sync, access });
}
