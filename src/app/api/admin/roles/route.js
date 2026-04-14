import { authorize, CAPABILITIES, getUserRoles, setUserRoles, ROLES, ROLE_META, listCustomRoles } from "@/lib/rbac";
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";

// GET /api/admin/roles — lista utenti con ruoli correnti + meta ruoli predefiniti + custom
export async function GET() {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });

  // Discovery
  let userIds = new Set();
  try {
    (await kv.zrange("lb:overall", 0, -1, { rev: true }) || []).forEach((u) => userIds.add(u));
  } catch {}
  try {
    const cc = await clerkClient();
    const list = await cc.users.getUserList({ limit: 200 });
    (list?.data || []).forEach((u) => userIds.add(u.id));
  } catch {}

  const ids = Array.from(userIds);
  let nameMap = {};
  try {
    const cc = await clerkClient();
    if (ids.length) {
      const list = await cc.users.getUserList({ userId: ids.slice(0, 100), limit: 100 });
      (list?.data || []).forEach((u) => {
        nameMap[u.id] = {
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id,
          email: u.emailAddresses?.[0]?.emailAddress || null,
        };
      });
    }
  } catch {}

  const rows = await Promise.all(
    ids.map(async (uid) => ({
      userId: uid,
      name: nameMap[uid]?.name || uid,
      email: nameMap[uid]?.email || null,
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
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
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
    await setUserRoles(userId, roles);
    return Response.json({ ok: true, userId, roles });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
