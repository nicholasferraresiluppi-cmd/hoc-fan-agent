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
    // 03/10/2026: negli inviti in attesa si vede anche cosa vedrà la persona
    creators: inv.publicMetadata?.creators || null,
    workspace: inv.publicMetadata?.workspace || null,
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

export async function createInvitation({ email, roles, creators, workspace, inviterId, inviterName, origin, notify = true }) {
  const mail = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new Error("Email non valida");
  const wanted = [...new Set((roles || []).map(String).filter(Boolean))];
  if (!wanted.length) throw new Error("Scegli almeno un ruolo");
  const { roles: allowed, admin } = await assignableRoles(inviterId);
  const allowedIds = new Set(allowed.map((r) => r.id));
  const bad = wanted.filter((r) => !allowedIds.has(r));
  if (bad.length) throw new Error(`Non puoi assegnare: ${bad.join(", ")}`);

  // Creator visibili (27/09/2026): "*" = tutte, lista = solo quelle. Un non-admin può dare
  // solo creator che vede lui (anti-escalation, come per i ruoli).
  let creatorsMeta = null;
  if (creators === "*" || (Array.isArray(creators) && creators.length)) {
    const { getCreatorScope, cleanScope } = await import("@/lib/creator-scope");
    const mine = admin ? { all: true } : await getCreatorScope(inviterId);
    if (creators === "*") {
      if (!mine.all) throw new Error("Non puoi dare la vista su tutte le creator");
      creatorsMeta = "*";
    } else {
      const wantedC = cleanScope({ creators }).creators;
      const badC = mine.all ? [] : wantedC.filter((c) => !mine.creators.has(c));
      if (badC.length) throw new Error(`Non puoi assegnare: ${badC.join(", ")}`);
      creatorsMeta = wantedC;
    }
  }

  // 03/10/2026 (prova d'uso, Sales Manager il primo giorno vedeva tutto vuoto): chi guida vendite o squadre
  // senza creator assegnate non vede nessun dato. Gli admin vedono tutto e non ne hanno bisogno.
  const LEADS = ["sales_manager", "team_lead", "qa_reviewer"];
  if (!wanted.includes("admin") && wanted.some((r) => LEADS.includes(r)) && !creatorsMeta) {
    throw new Error("Scegli le creator che vedrà (oppure «Tutte»): senza, le sue pagine restano vuote.");
  }
  const { isWorkspaceId } = await import("@/lib/workspaces");
  const workspaceMeta = isWorkspaceId(workspace) ? workspace : null;

  const cc = await clerkClient();
  // Se la persona è già registrata l'invito non serve: si cambia il ruolo da Membri
  const existing = await cc.users.getUserList({ emailAddress: [mail] });
  const list = Array.isArray(existing) ? existing : existing?.data || [];
  if (list.length) {
    const err = new Error("Questa persona ha già un account: lo trovi già nell'elenco Membri: cambia lì il suo ruolo");
    err.code = "exists";
    throw err;
  }
  // ruolo principale = il più alto tra i predefiniti scelti (admin prima di tutto)
  const primary = [...ROLES].reverse().find((r) => wanted.includes(r)) || "operator";
  const inv = await cc.invitations.createInvitation({
    emailAddress: mail,
    redirectUrl: `${origin}/sign-up`,
    // notify:false = l'email la mandiamo noi (attestato di benvenuto) col link inv.url
    notify,
    // re-invito che sostituisce un invito in attesa: solo admin (un non-admin
    // non deve poter riscrivere i ruoli di un invito fatto da un admin)
    ignoreExisting: admin,
    publicMetadata: { role: primary, roles: wanted, invited_by: inviterId, invited_by_name: inviterName || null, ...(creatorsMeta ? { creators: creatorsMeta } : {}), ...(workspaceMeta ? { workspace: workspaceMeta } : {}) },
  });
  return { ...shape(inv), url: inv.url || null };
}

/**
 * Rimanda un invito in attesa (05/10/2026, richiesta Nicholas: «girare di nuovo il link»).
 * Clerk non rimanda un invito: se ne crea uno NUOVO con la stessa email e gli stessi ruoli,
 * creator e mansione (nessun permesso in più: l'invito è identico), poi si annulla il vecchio.
 * Chi non è admin può rimandare solo i propri inviti. Restituisce anche il link, da girare
 * su WhatsApp se l'email non arriva.
 */
export async function resendInvitation(id, actorId, origin) {
  if (!/^inv_[A-Za-z0-9]+$/.test(String(id || ""))) throw new Error("Invito non valido");
  const cc = await clerkClient();
  const list = await cc.invitations.getInvitationList({ status: "pending", limit: 100 }).then((x) => (Array.isArray(x) ? x : x?.data || []));
  const old = list.find((x) => x.id === id);
  if (!old) throw new Error("Invito non trovato: forse è già stato usato o annullato");
  const admin = await isUserIdAdmin(actorId).catch(() => false);
  if (!admin && old.publicMetadata?.invited_by !== actorId) throw new Error("Puoi rimandare solo gli inviti che hai mandato tu");
  const redirectUrl = origin ? `${origin}/sign-up` : null;
  const inv = await cc.invitations.createInvitation({
    emailAddress: old.emailAddress,
    ...(redirectUrl ? { redirectUrl } : {}),
    notify: true,
    ignoreExisting: true,
    publicMetadata: old.publicMetadata || {},
  });
  await cc.invitations.revokeInvitation(id).catch(() => {});
  return { ...shape(inv), url: inv.url || null };
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
