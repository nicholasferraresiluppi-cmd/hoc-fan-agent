import { authorize, CAPABILITIES, getUserRole, setUserRole, ROLES, ROLE_META } from "@/lib/rbac";
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";

// GET /api/admin/roles — lista di tutti gli utenti discoverabili con ruolo corrente
export async function GET() {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });

  // Discovery: utenti con almeno 1 sessione o utenti Clerk
  let userIds = new Set();
  try {
    (await kv.zrange("lb:overall", 0, -1, { rev: true }) || []).forEach((u) => userIds.add(u));
  } catch {}
  try {
    const cc = await clerkClient();
    const list = await cc.users.getUserList({ limit: 200 });
    (list?.data || []).forEach((u) => userIds.add(u.id));
  } catch {}

  // Enrich con ruolo + nome
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
      role: await getUserRole(uid),
    }))
  );

  rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return Response.json({ rows, roles: ROLES, meta: ROLE_META });
}

// POST { userId, role } — aggiorna ruolo
export async function POST(req) {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  try {
    const { userId, role } = await req.json();
    if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
    if (!ROLES.includes(role)) return Response.json({ error: `invalid role: ${role}` }, { status: 400 });
    await setUserRole(userId, role);
    return Response.json({ ok: true, userId, role });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
