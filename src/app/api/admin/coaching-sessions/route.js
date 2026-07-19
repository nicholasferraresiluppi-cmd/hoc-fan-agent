/**
 * /api/admin/coaching-sessions — sessioni di coaching (backlog benchmark #3).
 *
 * Il coaching è il mestiere del TL: serve SCORES_VIEW con scope team o all
 * (l'operatore, scope own, riceve 403 — le sue sessioni le vede in /api/me/coaching).
 * Con scope team si vedono solo le sessioni create da sé (coach_id = self);
 * con scope all si vede tutto.
 *
 * GET  ?employee=NAME → sessioni (filtrate per scope come sopra)
 * POST { employee, topic, evidence?: string[], commitments?: [{label, due_date?}],
 *        notes?, follow_up_date? } → crea (status "sent")
 * PUT  { id, action: "close", closing_note } → chiude al follow-up (solo coach
 *      creatore o scope all). Le sessioni non si cancellano mai (audit).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { createSession, getSession, saveSession, listAllSessions, listSessionsForEmployee } from "@/lib/coaching-sessions";

function scopeOk(az) {
  return az.scope === "team" || az.scope === "all";
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!scopeOk(az)) return Response.json({ error: "Serve scope team o all." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const employee = searchParams.get("employee");
  let sessions = employee ? await listSessionsForEmployee(employee) : await listAllSessions();
  if (az.scope === "team") {
    sessions = sessions.filter((s) => s.coach_id === az.userId);
  }
  return Response.json({ sessions, scope: az.scope });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!scopeOk(az)) return Response.json({ error: "Serve scope team o all." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { employee, topic, evidence, commitments, notes, follow_up_date } = body || {};
  if (!employee || typeof employee !== "string") {
    return Response.json({ error: "employee richiesto." }, { status: 400 });
  }
  try {
    const session = await createSession({
      employee: employee.trim(),
      coachId: az.userId || "",
      topic,
      evidence,
      commitments,
      notes,
      followUpDate: follow_up_date,
    });
    return Response.json({ ok: true, session });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}

export async function PUT(request) {
  const az = await authorize(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!scopeOk(az)) return Response.json({ error: "Serve scope team o all." }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { id, action, closing_note } = body || {};
  if (action !== "close") return Response.json({ error: 'action deve essere "close".' }, { status: 400 });

  const session = await getSession(id);
  if (!session) return Response.json({ error: `Sessione "${id}" non trovata.` }, { status: 404 });
  if (az.scope === "team" && session.coach_id !== az.userId) {
    return Response.json({ error: "Puoi chiudere solo le sessioni che hai creato." }, { status: 403 });
  }
  if (session.status === "closed") {
    return Response.json({ error: "Già chiusa." }, { status: 400 });
  }
  if (!closing_note || String(closing_note).trim().length < 5) {
    return Response.json({ error: "closing_note richiesta: com'è andato il follow-up." }, { status: 400 });
  }

  session.status = "closed";
  session.closed_at = Date.now();
  session.closed_by = az.userId || "";
  session.closing_note = String(closing_note).slice(0, 500);
  await saveSession(session);
  return Response.json({ ok: true, session });
}
