// Creator terminate (vedi lib/creators-ended). Solo admin.
import { authorizeAdmin, auditAccess } from "@/lib/rbac";
import { getEndedCreators, setEndedCreator, removeEndedCreator } from "@/lib/creators-ended";

export async function GET() {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  return Response.json({ ended: await getEndedCreators() });
}

export async function POST(request) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const body = await request.json().catch(() => ({}));
  try {
    const ended = await setEndedCreator(body.alias, body.ended_on, a.userId);
    await auditAccess(a.userId, "creator_ended", { alias: body.alias, ended_on: body.ended_on });
    return Response.json({ ok: true, ended });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const alias = new URL(request.url).searchParams.get("alias");
  const ended = await removeEndedCreator(alias);
  return Response.json({ ok: true, ended });
}
