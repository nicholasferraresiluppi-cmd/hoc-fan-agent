// Inviti in app (dal 25/09/2026 HOC Pro è "solo su invito" su Clerk production).
//
// Chi ha la capability USERS_INVITE (admin di default, assegnabile con un ruolo
// custom) invita una persona scegliendo i ruoli: Clerk manda l'email da
// houseofcreators.app, la persona si registra dal link e al primo accesso ha già
// i ruoli (publicMetadata.roles/role dell'invito → letti da getUserRoles).
//
// ANTI-ESCALATION: chi non è admin non può invitare come admin, né assegnare un
// ruolo custom che dia gestione accessi o il potere di invitare a sua volta.

import { clerkClient } from "@clerk/nextjs/server";
import { isUserIdAdmin } from "@/lib/admin";
import { ROLES, ROLE_META, CAPABILITIES, listCustomRoles } from "@/lib/rbac";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POWER_CAPS = [CAPABILITIES.ACCESS_MGMT, CAPABILITIES.USERS_INVITE, CAPABILITIES.SEED];

// Ruoli che l'invitante può assegnare
export async function assignableRoles(inviterId) {
  const admin = await isUserIdAdmin(inviterId).catch(() => false);
  const custom = await listCustomRoles().catch(() => []);
  const predefined = ROLES.filter((r) => admin || r !== "admin").map((r) => ({ id: r, label: ROLE_META[r]?.label || r, custom: false }));
  const customs = custom
    .filter((c) => admin || !POWER_CAPS.some((cap) => c.capabilities?.[cap]))
    .map((c) => ({ id: c.id, label: c.name || c.id, custom: true }));
  return { admin, roles: [...predefined, ...customs] };
}

function shape(inv) {
  return {
    id: inv.id,
    email: inv.emailAddress,
    status: inv.status,
    roles: inv.publicMetadata?.roles || (inv.publicMetadata?.role ? [inv.publicMetadata.role] : []),
    invited_by: inv.publicMetadata?.invited_by_name || null,
    created_at: inv.createdAt,
    updated_at: inv.updatedAt,
  };
}

export async function listInvitations() {
  const cc = await clerkClient();
  const [pending, accepted] = await Promise.all([
    cc.invitations.getInvitationList({ status: "pending", limit: 100 }),
    cc.invitations.getInvitationList({ status: "accepted", limit: 20 }),
  ]);
  const arr = (x) => (Array.isArray(x) ? x : x?.data || []);
  return { pending: arr(pending).map(shape), accepted: arr(accepted).map(shape) };
}

export async function createInvitation({ email, roles, inviterId, inviterName, origin }) {
  const mail = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new Error("Email non valida");
  const wanted = [...new Set((roles || []).map(String).filter(Boolean))];
  if (!wanted.length) throw new Error("Scegli almeno un ruolo");
  const { roles: allowed } = await assignableRoles(inviterId);
  const allowedIds = new Set(allowed.map((r) => r.id));
  const bad = wanted.filter((r) => !allowedIds.has(r));
  if (bad.length) throw new Error(`Non puoi assegnare: ${bad.join(", ")}`);

  const cc = await clerkClient();
  // Se la persona è già registrata l'invito non serve: si cambia il ruolo da Membri
  const existing = await cc.users.getUserList({ emailAddress: [mail] });
  const list = Array.isArray(existing) ? existing : existing?.data || [];
  if (list.length) {
    const err = new Error("Questa persona ha già un account: lo trovi già nell'elenco Membri: cambia lì il suo ruolo");
    err.code = "exists";
    throw err;
  }
  const primary = wanted.find((r) => ROLES.includes(r)) || "operator";
  const inv = await cc.invitations.createInvitation({
    emailAddress: mail,
    redirectUrl: `${origin}/sign-up`,
    notify: true,
    ignoreExisting: true, // re-invito: sostituisce un invito ancora in attesa
    publicMetadata: { role: primary, roles: wanted, invited_by: inviterId, invited_by_name: inviterName || null },
  });
  return shape(inv);
}

export async function revokeInvitation(id) {
  if (!/^inv_[A-Za-z0-9]+$/.test(String(id || ""))) throw new Error("Invito non valido");
  const cc = await clerkClient();
  return shape(await cc.invitations.revokeInvitation(id));
}
