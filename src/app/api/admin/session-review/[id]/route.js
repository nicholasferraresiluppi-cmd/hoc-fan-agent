/**
 * GET /api/admin/session-review/[id]
 *
 * Restituisce il record completo di una sessione (con conversazione) per
 * la review da parte di un trainer/coach.
 *
 * Capability richiesta: REVIEW + lo scope del chiamante deve coprire
 * l'utente proprietario della sessione (own/team/all).
 */
import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { can, CAPABILITIES } from "@/lib/rbac";

export async function GET(_request, { params }) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const session = await kv.get(`session:${id}`);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const ownerId = session.userId;
  const allowed = await can(userId, CAPABILITIES.REVIEW, ownerId);
  if (!allowed) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let ownerDisplay = session.operatorName || null;
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(ownerId);
    ownerDisplay =
      u?.firstName || u?.lastName
        ? `${u.firstName || ""} ${u.lastName || ""}`.trim()
        : u?.username || u?.emailAddresses?.[0]?.emailAddress || ownerDisplay;
  } catch {
    // ignore
  }

  return Response.json({ session, ownerDisplay });
}
