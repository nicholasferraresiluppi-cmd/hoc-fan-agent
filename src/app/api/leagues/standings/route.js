import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import {
  buildSeasonStandings,
  currentSeasonKey,
  LEAGUE_TIERS,
  LEAGUE_META,
} from "@/lib/leagues";

// GET /api/leagues/standings?season=YYYY-MM
// Ritorna gli standings della stagione (snapshot se esiste, altrimenti on-the-fly).
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const seasonKey = url.searchParams.get("season") || currentSeasonKey();
    const { userId } = await auth();

    let snap = await kv.get(`league:snapshot:${seasonKey}`);
    if (!snap) {
      snap = await buildSeasonStandings(seasonKey);
    }

    // Arricchisci con nomi da Clerk
    const entries = snap.entries || [];
    const userIds = entries.map((e) => e.userId).filter(Boolean).slice(0, 100);
    let nameMap = {};
    try {
      if (userIds.length) {
        const cc = await clerkClient();
        const list = await cc.users.getUserList({ userId: userIds, limit: 100 });
        (list?.data || []).forEach((u) => {
          nameMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailAddresses?.[0]?.emailAddress || u.id;
        });
      }
    } catch (e) {
      console.warn("clerk users fetch failed:", e?.message);
    }

    const withNames = entries.map((e) => ({ ...e, name: nameMap[e.userId] || e.userId }));

    // Group by tier
    const byTier = {};
    ["unranked", ...LEAGUE_TIERS].forEach((t) => (byTier[t] = []));
    withNames.forEach((e) => byTier[e.tier]?.push(e));

    return Response.json({
      seasonKey,
      totalRanked: snap.totalRanked || 0,
      tiers: LEAGUE_TIERS,
      meta: LEAGUE_META,
      byTier,
      me: userId || null,
    });
  } catch (e) {
    console.error("standings error:", e);
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}
