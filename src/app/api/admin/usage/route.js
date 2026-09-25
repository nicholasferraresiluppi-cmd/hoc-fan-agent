// Dati grezzi per la dashboard Utilizzo (/admin/utilizzo): 60 giorni di
// aperture + membri Clerk. Il report si calcola nel browser con usage-core
// (serve l'elenco del menu, che vive nel componente Sidebar). Solo admin.
import { clerkClient } from "@clerk/nextjs/server";
import { authorizeAdmin, getUserRoles } from "@/lib/rbac";
import { getUsageDays, getUxDays } from "@/lib/usage";

export async function GET() {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const [days, members, ux] = await Promise.all([getUsageDays(60), listMembers(), getUxDays(30)]);
  return Response.json({ days, members, ux });
}

async function listMembers() {
  const cc = await clerkClient();
  const out = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const list = await cc.users.getUserList({ limit: 100, offset });
    const data = Array.isArray(list) ? list : list?.data || [];
    for (const u of data) {
      out.push({
        userId: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id,
        email: u.emailAddresses?.[0]?.emailAddress || null,
        lastSignInAt: u.lastSignInAt || null,
        createdAt: u.createdAt || null,
      });
    }
    if (data.length < 100) break;
  }
  await Promise.all(out.map(async (m) => { m.roles = await getUserRoles(m.userId).catch(() => []); }));
  return out;
}
