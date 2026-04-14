import { authorize, CAPABILITIES } from "@/lib/rbac";
import { computeSeniority, setSeniorityOverride, TIERS } from "@/lib/seniority";
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";

// GET /api/admin/seniority — lista operatori con sessioni e tier
export async function GET() {
  const auth = await authorize(CAPABILITIES.SENIORITY_OVERRIDE);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  // Discover operatori da leaderboard index (zset con members = userId)
  let userIds = [];
  try {
    userIds = (await kv.zrange("lb:overall", 0, -1, { rev: true })) || [];
  } catch (e) {
    console.warn("lb:overall fetch failed:", e?.message);
  }

  // Nomi dai Clerk
  let nameMap = {};
  try {
    const cc = await clerkClient();
    if (userIds.length) {
      const list = await cc.users.getUserList({ userId: userIds.slice(0, 100), limit: 100 });
      (list?.data || []).forEach((u) => {
        const n = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id;
        nameMap[u.id] = n;
      });
    }
  } catch (e) {
    console.warn("clerk users fetch failed:", e?.message);
  }

  const rows = await Promise.all(
    userIds.map(async (uid) => {
      const s = await computeSeniority(uid);
      return {
        userId: uid,
        name: nameMap[uid] || uid,
        tier: s.tier,
        auto: s.auto,
        override: s.override,
        totalSessions: s.stats.totalSessions,
        avgRecent30: s.stats.avgRecent30,
        avgRecent50: s.stats.avgRecent50,
      };
    })
  );

  return Response.json({ rows, tiers: TIERS });
}

// POST /api/admin/seniority { userId, tier } — set/clear override
export async function POST(req) {
  const auth = await authorize(CAPABILITIES.SENIORITY_OVERRIDE);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  try {
    const { userId, tier } = await req.json();
    if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
    const res = await setSeniorityOverride(userId, tier || null);
    const s = await computeSeniority(userId);
    return Response.json({ ok: true, ...res, seniority: s });
  } catch (e) {
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
