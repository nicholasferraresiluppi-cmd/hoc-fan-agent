import { kv } from "@vercel/kv";
import { viewAsFor } from "@/lib/view-as";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isUserIdAdmin, isUserIdAdminRaw, userHasMfa, adminMfaRequired } from "@/lib/admin";
import { getUserRole, getUserRoles, getUserTeam, getEffectiveCapabilities } from "@/lib/rbac";
import { getCreatorScope } from "@/lib/creator-scope";
import { resolveWorkspace } from "@/lib/workspace-store";
import { defaultWorkspace } from "@/lib/workspaces";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ userId: null, authenticated: false });
    const user = await currentUser();
    const admin = await isUserIdAdmin(userId);
    const role = await getUserRole(userId); // primario (retrocompat)
    const roles = await getUserRoles(userId); // multi
    const team = await getUserTeam(userId);
    const capabilities = { ...(await getEffectiveCapabilities(userId)) }; // unione
    // visibilità per creator (27/09/2026): per il MENU, "vede tutte le creator" come pseudo-permesso
    const cs = await getCreatorScope(userId).catch(() => null);
    if (cs?.all) capabilities["creators.all"] = "all";
    const creators = cs ? { all: cs.all, count: cs.creators?.size || 0, source: cs.source } : null;
    const adminRaw = admin || (await isUserIdAdminRaw(userId));
    // mansione (03/10/2026): menu e hub per il lavoro della persona; in "Vedi come" quella del membro/ruolo guardato
    const va = adminRaw ? await viewAsFor(userId).catch(() => null) : null;
    const workspace = va
      ? (va.target ? await resolveWorkspace(va.target, { admin: false, roles }) : { id: defaultWorkspace({ admin: false, roles }), source: "ruolo" })
      : await resolveWorkspace(userId, { admin, roles }).catch(() => ({ id: defaultWorkspace({ admin, roles }), source: "ruolo" }));
    // appena attivata la 2FA la cache del controllo si aggiorna subito
    if (adminRaw && user?.twoFactorEnabled) await kv.set(`mfa:ok:${userId}`, 1, { ex: 600 }).catch(() => {});
    const security = adminRaw
      ? { admin_raw: true, mfa_enabled: !!user?.twoFactorEnabled, mfa_required: await adminMfaRequired() }
      : { admin_raw: false };
    return Response.json({
      authenticated: true,
      userId,
      admin,
      role,
      roles,
      team,
      capabilities,
      creators,
      security,
      workspace,
      view_as: va ? { label: va.label, roles: va.roles, exp: va.exp, employee: va.employee || null } : null,
      email: user?.emailAddresses?.[0]?.emailAddress,
      name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || null,
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}
