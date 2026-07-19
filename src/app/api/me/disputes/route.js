/**
 * /api/me/disputes — contestazioni dell'operatore loggato (scope own).
 *
 * GET  → { linked, disputes: [...] } — solo le proprie
 * POST → crea una contestazione: { type: "score"|"compenso"|"altro", period_id?, metric?, message }
 *        Identità risolta server-side (VISIBILITY_POLICY): l'employee non arriva dal client.
 *        Max 5 contestazioni aperte per operatore (anti-flood, il resto via TL).
 *
 * Implementa CAREER_LADDER §8.2 lato operatore. La risoluzione è in
 * /api/admin/disputes (rotazione reviewer + SM, mai il proprio TL da solo).
 */
import { resolveEmployeeForUser } from "@/lib/me";
import { createDispute, listDisputesForEmployee, DISPUTE_TYPES, OPEN_STATUS } from "@/lib/disputes";

export async function GET() {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!who.employee) return Response.json({ linked: false, reason: who.reason || "no_match" });
  const disputes = await listDisputesForEmployee(who.employee);
  return Response.json({ linked: true, employee: who.employee, disputes });
}

export async function POST(request) {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!who.employee) {
    return Response.json({ error: "Account non collegato a un profilo operatore: chiedi a un admin." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { type, period_id, metric, message } = body || {};
  if (!DISPUTE_TYPES.includes(type)) {
    return Response.json({ error: `type deve essere uno di: ${DISPUTE_TYPES.join(", ")}.` }, { status: 400 });
  }
  if (!message || String(message).trim().length < 10) {
    return Response.json({ error: "Spiega la contestazione in almeno 10 caratteri: aiuta chi la esamina." }, { status: 400 });
  }

  const existing = await listDisputesForEmployee(who.employee);
  const openCount = existing.filter((d) => d.status === OPEN_STATUS).length;
  if (openCount >= 5) {
    return Response.json({ error: "Hai già 5 contestazioni aperte: attendi la risposta o parla col tuo team lead." }, { status: 429 });
  }

  const dispute = await createDispute({
    employee: who.employee,
    userId: who.userId,
    type,
    periodId: period_id,
    metric,
    message,
  });
  return Response.json({ ok: true, dispute });
}
