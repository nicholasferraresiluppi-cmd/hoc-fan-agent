import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";

const DAY = 24 * 60 * 60 * 1000;

// GET — V6.5 Leaderboard based on score_hist
// Query params:
//   ?period=week (default) | month | all
//   ?skill=overall (default) | esclusivita | dipendenza | conversione | tono | naturalezza | gestione_obiezioni
export async function GET(request) {
  try {
    const { userId: currentUserId } = await auth();
    if (!currentUserId) return Response.json({ error: "Non autenticato." }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "week";
    const skill = searchParams.get("skill") || "overall";

    const now = Date.now();
    const cutoff =
      period === "all" ? 0 :
      period === "month" ? now - 30 * DAY :
      now - 7 * DAY;

    const keys = (await kv.zrange("score_hist:index", 0, 499, { rev: true })) || [];
    const records = (await Promise.all(keys.map((k) => kv.get(k)))).filter(Boolean);
    const inPeriod = records.filter((r) => r.timestamp >= cutoff);

    const byUser = {};
    for (const r of inPeriod) {
      if (!byUser[r.userId]) byUser[r.userId] = [];
      const val = skill === "overall" ? r.overall : r.skills?.[skill];
      if (typeof val === "number") byUser[r.userId].push({ val, ts: r.timestamp });
    }

    const MIN_SESSIONS = period === "week" ? 2 : period === "month" ? 3 : 5;

    let entries = Object.entries(byUser)
      .filter(([, arr]) => arr.length >= MIN_SESSIONS)
      .map(([uid, arr]) => ({
        userId: uid,
        avg: Math.round(arr.reduce((a, b) => a + b.val, 0) / arr.length),
        sessions: arr.length,
        lastTimestamp: Math.max(...arr.map((x) => x.ts)),
      }))
      .sort((a, b) => b.avg - a.avg);

    const totalQualifying = entries.length;

    const topIds = entries.slice(0, 10).map((e) => e.userId);
    const nameMap = {};
    try {
      const cc = await clerkClient();
      const users = await cc.users.getUserList({ userId: [...new Set([...topIds, currentUserId])] });
      const list = users?.data || users || [];
      for (const u of list) {
        nameMap[u.id] = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.emailAddresses?.[0]?.emailAddress || `Operatore ${u.id.slice(-4)}`;
      }
    } catch (e) { /* silent */ }

    const top10 = entries.slice(0, 10).map((e, i) => ({
      rank: i + 1,
      userId: e.userId,
      name: nameMap[e.userId] || `Operatore ${e.userId.slice(-4)}`,
      avg: e.avg,
      sessions: e.sessions,
      isMe: e.userId === currentUserId,
    }));

    let me;
    const myIdx = entries.findIndex((e) => e.userId === currentUserId);
    if (myIdx >= 0) {
      const myEntry = entries[myIdx];
      const percentile = Math.round(((totalQualifying - myIdx) / totalQualifying) * 100);
      me = {
        rank: myIdx + 1,
        totalOperators: totalQualifying,
        percentile,
        avg: myEntry.avg,
        sessions: myEntry.sessions,
        name: nameMap[currentUserId] || "Tu",
      };
    } else {
      const mySessions = byUser[currentUserId]?.length || 0;
      me = {
        rank: null,
        totalOperators: totalQualifying,
        percentile: null,
        avg: null,
        sessions: mySessions,
        name: nameMap[currentUserId] || "Tu",
        reason: mySessions < MIN_SESSIONS ? `Servono almeno ${MIN_SESSIONS} sessioni in questo periodo per qualificarti (hai ${mySessions})` : "Nessuna sessione in questo periodo",
      };
    }

    return Response.json({
      period,
      skill,
      top10,
      me,
      totalQualifying,
      minSessions: MIN_SESSIONS,
    });
  } catch (error) {
    console.error("Leaderboard GET error:", error);
    return Response.json({ top10: [], me: null, error: error?.message || "Errore" }, { status: 200 });
  }
}
