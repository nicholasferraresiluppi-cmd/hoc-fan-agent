import { kv } from "@vercel/kv";
import { viewAsFor } from "@/lib/view-as";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isUserIdAdmin, isUserIdAdminRaw, userHasMfa, adminMfaRequired } from "@/lib/admin";
import { getUserRole, getUserRoles, getUserTeam, getEffectiveCapabilities } from "@/lib/rbac";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ userId: null, authenticated: false });
    const user = await currentUser();
    const admin = await isUserIdAdmin(userId);
    const role = await getUserRole(userId); // primario (retrocompat)
    const roles = await getUserRoles(userId); // multi
    const team = await getUserTeam(userId);
    const capabilities = await getEffectiveCapabilities(userId); // unione
    const adminRaw = admin || (await isUserIdAdminRaw(userId));
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
      security,
      view_as: adminRaw ? await viewAsFor(userId).then((v) => (v ? { label: v.label, roles: v.roles, exp: v.exp } : null)).catch(() => null) : null,
      email: user?.emailAddresses?.[0]?.emailAddress,
      name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || null,
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}
