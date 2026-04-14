import { authorize, CAPABILITIES, getUserTeam, setUserTeam, getUserRole } from "@/lib/rbac";
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";

// Teams definiti come set in KV: "teams:all" = set di teamId.
// team_lead:{teamId} = userId del lead.

async function listTeams() {
  return (await kv.smembers("teams:all")) || [];
}

// GET /api/admin/teams — ritorna:
// { teams: [{ teamId, lead, members: [{userId, name, role}] }], unassigned: [{...}] }
export async function GET() {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });

  const teams = await listTeams();

  // Raccogli tutti gli utenti discoverable
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
        nameMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id;
      });
    }
  } catch {}

  const enriched = await Promise.all(
    ids.map(async (uid) => ({
      userId: uid,
      name: nameMap[uid] || uid,
      role: await getUserRole(uid),
      team: await getUserTeam(uid),
    }))
  );

  const teamObjs = await Promise.all(
    teams.map(async (teamId) => {
      const lead = await kv.get(`team_lead:${teamId}`);
      const members = enriched.filter((e) => e.team === teamId);
      return { teamId, lead, members };
    })
  );

  const unassigned = enriched.filter((e) => !e.team);

  return Response.json({ teams: teamObjs, unassigned });
}

// POST { action, ... }
// Actions:
//   create_team { teamId }
//   delete_team { teamId }
//   assign_member { userId, teamId }  (teamId=null per rimuovere)
//   set_lead { teamId, userId }
export async function POST(req) {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create_team") {
      const teamId = (body.teamId || "").trim();
      if (!teamId) return Response.json({ error: "teamId required" }, { status: 400 });
      await kv.sadd("teams:all", teamId);
      return Response.json({ ok: true, teamId });
    }

    if (action === "delete_team") {
      const { teamId } = body;
      if (!teamId) return Response.json({ error: "teamId required" }, { status: 400 });
      const members = (await kv.smembers(`team_members:${teamId}`)) || [];
      for (const m of members) {
        await kv.del(`team:${m}`);
      }
      await kv.del(`team_members:${teamId}`);
      await kv.del(`team_lead:${teamId}`);
      await kv.srem("teams:all", teamId);
      return Response.json({ ok: true, deleted: teamId });
    }

    if (action === "assign_member") {
      const { userId, teamId } = body;
      if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
      // Se sta cambiando team, rimuovi dal precedente
      const prev = await getUserTeam(userId);
      if (prev && prev !== teamId) {
        await kv.srem(`team_members:${prev}`, userId);
      }
      await setUserTeam(userId, teamId || null);
      if (teamId) await kv.sadd("teams:all", teamId);
      return Response.json({ ok: true, userId, teamId: teamId || null });
    }

    if (action === "set_lead") {
      const { teamId, userId } = body;
      if (!teamId) return Response.json({ error: "teamId required" }, { status: 400 });
      if (userId) {
        await kv.set(`team_lead:${teamId}`, userId);
      } else {
        await kv.del(`team_lead:${teamId}`);
      }
      return Response.json({ ok: true, teamId, lead: userId || null });
    }

    return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
