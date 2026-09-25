// Inviti in app. Gate: capability USERS_INVITE (admin di default; assegnabile
// con un ruolo custom). Le regole anti-escalation sono in lib/invitations.
export const runtime = "nodejs";

import { currentUser } from "@clerk/nextjs/server";
import { authorize, auditAccess, CAPABILITIES } from "@/lib/rbac";
import { internalOrigin } from "@/lib/cron-chain";
import { listInvitations, createInvitation, revokeInvitation, assignableRoles } from "@/lib/invitations";

export async function GET() {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    const [inv, assignable] = await Promise.all([listInvitations(), assignableRoles(az.userId)]);
    return Response.json({ ...inv, assignable: assignable.roles, is_admin: assignable.admin });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura inviti fallita" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }
  try {
    const me = await currentUser().catch(() => null);
    const inviterName = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.emailAddresses?.[0]?.emailAddress || null;
    // origin fisso (dominio pubblico), non l'host della richiesta
    const origin = internalOrigin(request);
    const invitation = await createInvitation({ email: body?.email, roles: body?.roles, inviterId: az.userId, inviterName, origin });
    await auditAccess(az.userId, "invite", { email: invitation.email, roles: invitation.roles });
    return Response.json({ ok: true, invitation });
  } catch (e) {
    const msg = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e.message || "Invito non riuscito";
    return Response.json({ error: msg, code: e.code || null }, { status: e.code === "exists" ? 409 : 400 });
  }
}

export async function DELETE(request) {
  const az = await authorize(CAPABILITIES.USERS_INVITE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const id = new URL(request.url).searchParams.get("id");
  try {
    await revokeInvitation(id, az.userId);
    await auditAccess(az.userId, "invite_revoke", { invitation: id });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || "Annullamento non riuscito" }, { status: 400 });
  }
}
