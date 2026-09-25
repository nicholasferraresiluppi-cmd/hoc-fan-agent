// Inviti in app (dal 25/09/2026 HOC Pro è "solo su invito" su Clerk production).
//
// Chi ha la capability USERS_INVITE (admin di default, assegnabile con un ruolo
// custom) invita una persona scegliendo i ruoli: Clerk manda l'email da
// houseofcreators.app, la persona si registra dal link e al primo accesso ha già
// i ruoli (publicMetadata.roles/role dell'invito → letti da getUserRoles).
//
// ANTI-ESCALATION (rivista dopo l'audit set 2026): chi non è admin può dare
// SOLO ruoli i cui permessi sono già tutti suoi, con scope non più ampio
// (un team lead non può creare un sales manager che vede i soldi di tutta
// l'org), mai ruoli con poteri sugli accessi, e può annullare solo i propri
// inviti.

import { clerkClient } from "@clerk/nextjs/server";
import { isUserIdAdmin } from "@/lib/admin";
import { ROLES, ROLE_META, ROLE_CAPABILITIES, CAPABILITIES, listCustomRoles, getEffectiveCapabilities } from "@/lib/rbac";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POWER_CAPS = [CAPABILITIES.ACCESS_MGMT, CAPABILITIES.USERS_INVITE, CAPABILITIES.SEED];

// Ruoli che l'invitante può assegnare
const RANK = { own: 1, team: 2, all: 3 };

// true se ogni permesso del ruolo è già dell'invitante con scope ≥
function withinInviterPowers(roleCaps, mine) {
  return Object.entries(roleCaps || {}).every(([cap, scope]) =>
    !POWER_CAPS.includes(cap) && (RANK[mine[cap]] || 0) >= (RANK[scope] || 0));
}

export async function assignableRoles(inviterId) {
  const admin = await isUserIdAdmin(inviterId).catch(() => false);
  const custom = await listCustomRoles().catch(() => []);
  const mine = admin ? null : await getEffectiveCapabilities(inviterId).catch(() => ({}));
  const ok = (caps) => admin || withinInviterPowers(caps, mine);
  const predefined = ROLES.filter((r) => r !== "admin" || admin)
    .filter((r) => ok(ROLE_CAPABILITIES[r]))
    .map((r) => ({ id: r, label: ROLE_META[r]?.label || r, custom: false }));
  const customs = custom
    .filter((c) => ok(c.capabilities))
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
  const { roles: allowed, admin } = await assignableRoles(inviterId);
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
    // re-invito che sostituisce un invito in attesa: solo admin (un non-admin
    // non deve poter riscrivere i ruoli di un invito fatto da un admin)
    ignoreExisting: admin,
    publicMetadata: { role: primary, roles: wanted, invited_by: inviterId, invited_by_name: inviterName || null },
  });
  return shape(inv);
}

export async function revokeInvitation(id, actorId) {
  if (!/^inv_[A-Za-z0-9]+$/.test(String(id || ""))) throw new Error("Invito non valido");
  const cc = await clerkClient();
  if (!(await isUserIdAdmin(actorId).catch(() => false))) {
    const { data } = await cc.invitations.getInvitationList({ status: "pending", limit: 100 }).then((x) => (Array.isArray(x) ? { data: x } : x));
    const inv = (data || []).find((x) => x.id === id);
    if (!inv || inv.publicMetadata?.invited_by !== actorId) throw new Error("Puoi annullare solo gli inviti che hai mandato tu");
  }
  return shape(await cc.invitations.revokeInvitation(id));
}
