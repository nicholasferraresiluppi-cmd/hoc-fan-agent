import { authorize, authorizeAdmin, auditAccess, CAPABILITIES, getUserRoles, setUserRoles, ROLES, ROLE_META, listCustomRoles } from "@/lib/rbac";
import { clerkClient } from "@clerk/nextjs/server";

// GET /api/admin/roles — lista utenti con ruoli correnti + meta ruoli predefiniti + custom
export async function GET() {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });

  // Membri = utenti Clerk dell'istanza (dal 25/09/2026 production, solo su invito).
  // Prima si univano anche gli id di lb:overall, ma dopo la migrazione dev→prod
  // quelli sono id dev orfani: comparivano come righe "user_…" senza nome.
  const nameMap = {};
  try {
    const cc = await clerkClient();
    for (let offset = 0; offset < 1000; offset += 100) {
      const list = await cc.users.getUserList({ limit: 100, offset, orderBy: "-created_at" });
      const data = Array.isArray(list) ? list : list?.data || [];
      data.forEach((u) => {
        nameMap[u.id] = {
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id,
          email: u.emailAddresses?.[0]?.emailAddress || null,
          lastSignInAt: u.lastSignInAt || null,
          createdAt: u.createdAt || null,
        };
      });
      if (data.length < 100) break;
    }
  } catch {}
  const ids = Object.keys(nameMap);

  const rows = await Promise.all(
    ids.map(async (uid) => ({
      userId: uid,
      name: nameMap[uid]?.name || uid,
      email: nameMap[uid]?.email || null,
      last_sign_in_at: nameMap[uid]?.lastSignInAt || null,
      created_at: nameMap[uid]?.createdAt || null,
      roles: await getUserRoles(uid),
    }))
  );
  rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const custom = await listCustomRoles();

  return Response.json({
    rows,
    predefined: ROLES,
    meta: ROLE_META,
    custom, // [{ id, name, emoji, color, description, capabilities }]
  });
}

// POST { userId, roles: [string] } — set ruoli multipli
export async function POST(req) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  try {
    const body = await req.json();
    const { userId } = body;
    if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
    // Retrocompat: accetta sia `role` (string) sia `roles` (array)
    let roles = body.roles;
    if (!Array.isArray(roles)) {
      roles = body.role ? [body.role] : [];
    }
    // valida: predefiniti o c:*
    const custom = await listCustomRoles();
    const customIds = new Set(custom.map((c) => c.id));
    const invalid = roles.filter((r) => !ROLES.includes(r) && !customIds.has(r));
    if (invalid.length) return Response.json({ error: `invalid roles: ${invalid.join(", ")}` }, { status: 400 });
    const before = await getUserRoles(userId);
    await setUserRoles(userId, roles);
    await auditAccess(a.userId, "roles_set", { target: userId, before, after: roles });
    return Response.json({ ok: true, userId, roles });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
