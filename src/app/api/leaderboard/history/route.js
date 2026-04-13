import { kv } from "@vercel/kv";
import { auth } from "@clerk/nextjs/server";

export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "26", 10), 100);

    const weekKeys = (await kv.zrange("lb_snapshot:index", 0, limit - 1, { rev: true })) || [];
    if (!weekKeys.length) return Response.json({ snapshots: [] });

    const snaps = (await Promise.all(weekKeys.map((k) => kv.get(`lb_snapshot:${k}`)))).filter(Boolean);

    // Hall of Fame: count #1 wins per user across all snapshots
    const winCount = {};
    const winners = [];
    for (const s of snaps) {
      const champ = s.top10?.[0];
      if (!champ) continue;
      winners.push({ weekKey: s.weekKey, createdAt: s.createdAt, champion: champ });
      winCount[champ.userId] = winCount[champ.userId] || { userId: champ.userId, name: champ.name, wins: 0 };
      winCount[champ.userId].wins += 1;
    }

    const hallOfFame = Object.values(winCount).sort((a, b) => b.wins - a.wins).slice(0, 10);

    return Response.json({
      snapshots: snaps.map((s) => ({
        weekKey: s.weekKey,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        createdAt: s.createdAt,
        top3: (s.top10 || []).slice(0, 3),
        skillChampions: s.skillChampions || {},
        totalQualifying: s.totalQualifying,
        totalSessions: s.totalSessions,
      })),
      hallOfFame,
    });
  } catch (error) {
    console.error("History error:", error);
    return Response.json({ snapshots: [], hallOfFame: [], error: error?.message || "Errore" }, { status: 200 });
  }
}
