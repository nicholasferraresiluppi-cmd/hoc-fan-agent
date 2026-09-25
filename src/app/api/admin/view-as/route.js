// Attiva / disattiva "Vedi come…" (vedi lib/view-as). Solo admin veri.
import { cookies } from "next/headers";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isUserIdAdminRaw } from "@/lib/admin";
import { getUserRoles, ROLES, ROLE_META, listCustomRoles, auditAccess } from "@/lib/rbac";
import { encodeViewAs, VIEW_AS_COOKIE, VIEW_AS_TTL_MS } from "@/lib/view-as";

const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };

export async function POST(request) {
  const { userId } = await auth();
  if (!userId || !(await isUserIdAdminRaw(userId))) return Response.json({ error: "Serve un admin" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  let roles, label;
  if (body.userId) {
    if (body.userId === userId) return Response.json({ error: "Sei già tu" }, { status: 400 });
    roles = await getUserRoles(body.userId); // ruoli REALI dell'altra persona (l'anteprima vale solo per la propria sessione)
    try {
      const u = await (await clerkClient()).users.getUser(body.userId);
      label = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || body.userId;
    } catch { label = body.userId; }
  } else if (Array.isArray(body.roles) && body.roles.length) {
    const custom = await listCustomRoles().catch(() => []);
    const ok = new Set([...ROLES, ...custom.map((c) => c.id)]);
    roles = body.roles.filter((r) => ok.has(r));
    if (!roles.length) return Response.json({ error: "Ruolo non valido" }, { status: 400 });
    label = roles.map((r) => ROLE_META[r]?.label || custom.find((c) => c.id === r)?.name || r).join(" + ");
  } else {
    return Response.json({ error: "Indica un membro o un ruolo" }, { status: 400 });
  }
  const v = { by: userId, roles, label, target: body.userId || null, exp: Date.now() + VIEW_AS_TTL_MS };
  (await cookies()).set(VIEW_AS_COOKIE, encodeViewAs(v), { ...cookieOpts, maxAge: VIEW_AS_TTL_MS / 1000 });
  await auditAccess(userId, "view_as_start", { label, roles, target: v.target });
  return Response.json({ ok: true, label, roles });
}

export async function DELETE() {
  const { userId } = await auth();
  (await cookies()).set(VIEW_AS_COOKIE, "", { ...cookieOpts, maxAge: 0 });
  if (userId) await auditAccess(userId, "view_as_stop", {});
  return Response.json({ ok: true });
}
