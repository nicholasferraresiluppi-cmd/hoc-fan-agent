import { auth, currentUser } from "@clerk/nextjs/server";
import { isUserIdAdmin } from "@/lib/admin";
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
    return Response.json({
      authenticated: true,
      userId,
      admin,
      role,
      roles,
      team,
      capabilities,
      email: user?.emailAddresses?.[0]?.emailAddress,
      name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || null,
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}
