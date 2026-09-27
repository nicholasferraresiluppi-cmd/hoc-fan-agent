// "Porta gli operatori nell'app": elenco operatori invitabili + invio in blocco.
// Stesso permesso degli inviti singoli (USERS_INVITE); l'invio è sempre un atto
// esplicito di chi è loggato (bottone con conferma), mai automatico.
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES, auditAccess } from "@/lib/rbac";
import { listInvitableOperators, inviteOperators } from "@/lib/operator-invites";
import { internalOrigin } from "@/lib/cron-chain";

export async function GET() {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    return Response.json(await listInvitableOperators());
  } catch (e) {
    return Response.json({ error: e.message || "Elenco non disponibile" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  const emails = Array.isArray(body?.emails) ? body.emails : [];
  if (!emails.length) return Response.json({ error: "Nessun operatore scelto" }, { status: 400 });
  if (emails.length > 60) return Response.json({ error: "Massimo 60 inviti per volta" }, { status: 400 });
  const me = await currentUser().catch(() => null);
  const inviterName = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || null;
  const results = await inviteOperators({ emails, inviterId: az.userId, inviterName, origin: internalOrigin(request) });
  await auditAccess(az.userId, "invite_operators_bulk", { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  return Response.json({ ok: true, results });
}
