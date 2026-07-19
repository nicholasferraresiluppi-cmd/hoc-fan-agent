/**
 * /api/me/coaching — le mie sessioni di coaching (scope own).
 *
 * GET → le proprie sessioni (coach anonimo no: il coach si vede, è il proprio
 *       TL — il rapporto di coaching è dichiarato, a differenza della QA).
 * POST { id, action: "acknowledge", reply_note? } → conferma di lettura con
 *       replica opzionale (right-of-reply, pattern Observe.AI): la paper trail
 *       diventa a due voci. Solo sulle PROPRIE sessioni, una sola volta.
 */
import { resolveEmployeeForUser } from "@/lib/me";
import { getSession, saveSession, listSessionsForEmployee } from "@/lib/coaching-sessions";

export async function GET() {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!who.employee) return Response.json({ linked: false, reason: who.reason || "no_match" });

  const sessions = await listSessionsForEmployee(who.employee);
  // coach_id interno non serve all'operatore; niente id Clerk in giro.
  const safe = sessions.map(({ coach_id, closed_by, ...s }) => s);
  return Response.json({ linked: true, employee: who.employee, sessions: safe });
}

export async function POST(request) {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!who.employee) return Response.json({ error: "Account non collegato a un profilo operatore." }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { id, action, reply_note } = body || {};
  if (action !== "acknowledge") return Response.json({ error: 'action deve essere "acknowledge".' }, { status: 400 });

  const session = await getSession(id);
  if (!session || session.employee !== who.employee) {
    // Stessa risposta per inesistente e altrui: nessun leak di esistenza.
    return Response.json({ error: "Sessione non trovata." }, { status: 404 });
  }
  if (session.status !== "sent") {
    return Response.json({ error: "Già confermata." }, { status: 400 });
  }

  session.status = "acknowledged";
  session.acknowledged_at = Date.now();
  if (reply_note && String(reply_note).trim()) {
    session.reply_note = String(reply_note).slice(0, 1000);
    session.reply_at = session.acknowledged_at;
  }
  await saveSession(session);
  const { coach_id, closed_by, ...safe } = session;
  return Response.json({ ok: true, session: safe });
}
