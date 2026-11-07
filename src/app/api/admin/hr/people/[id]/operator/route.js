/**
 * /api/admin/hr/people/[id]/operator — chi è questa persona su Infloww (e da lì
 * su CreatorsPro). people.manage: admin e People Partner. Logica in lib/person-operator.
 *
 * GET    → { link, suggestion, cp, candidates }
 * POST   { inflowwName } → collega (un nome Infloww appartiene a una sola scheda)
 * DELETE → scollega
 */
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson } from "@/lib/hr-people";
import { operatorView, setOperatorLink, clearOperatorLink } from "@/lib/person-operator";

export const dynamic = "force-dynamic";

async function load(props) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return { res: Response.json({ error: az.message }, { status: az.status }) };
  const { id } = await props.params;
  const person = await getPerson(id);
  if (!person) return { res: Response.json({ error: "Persona non trovata." }, { status: 404 }) };
  const me = await currentUser().catch(() => null);
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || null;
  return { person, actor: { id: az.userId, name } };
}

export async function GET(request, props) {
  const { res, person } = await load(props);
  if (res) return res;
  try {
    return Response.json(await operatorView(person));
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request, props) {
  const { res, person, actor } = await load(props);
  if (res) return res;
  if (person.archived) return Response.json({ error: "Scheda archiviata: prima si ripristina." }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json({ ok: true, link: await setOperatorLink(person, body.inflowwName, actor) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}

export async function DELETE(request, props) {
  const { res, person, actor } = await load(props);
  if (res) return res;
  await clearOperatorLink(person, actor);
  return Response.json({ ok: true, link: null });
}
