import { auth, currentUser } from "@clerk/nextjs/server";
import { isUserIdAdmin } from "@/lib/admin";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ userId: null, authenticated: false });
    const user = await currentUser();
    const admin = await isUserIdAdmin(userId);
    return Response.json({
      authenticated: true,
      userId,
      admin,
      email: user?.emailAddresses?.[0]?.emailAddress,
      name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || null,
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}
