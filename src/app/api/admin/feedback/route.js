// Lettura e gestione delle segnalazioni (admin).
import { authorizeAdmin } from "@/lib/rbac";
import { listFeedback, setFeedbackStatus } from "@/lib/feedback";

export async function GET() {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  return Response.json({ items: await listFeedback(200) });
}

export async function PATCH(request) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const body = await request.json().catch(() => ({}));
  try { return Response.json({ ok: true, item: await setFeedbackStatus(body.id, body.status) }); }
  catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
}
