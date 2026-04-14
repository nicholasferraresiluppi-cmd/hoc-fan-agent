import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES, getTeamMembers, getUserTeam } from "@/lib/rbac";

const DAY = 24 * 60 * 60 * 1000;

// GET — aggregated dashboard: per-operator stats, trends, alerts, skill x creator heatmap
export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    const azn = await authorize(CAPABILITIES.ANALYTICS_VIEW);
    if (!azn.ok) return Response.json({ error: azn.message }, { status: azn.status });

    // Pull last 500 records from global index (most recent first)
    const keys = (await kv.zrange("score_hist:index", 0, 499, { rev: true })) || [];
    let records = (await Promise.all(keys.map((k) => kv.get(k)))).filter(Boolean);

    // Scope filtering based on role
    if (azn.scope === "team") {
      const myTeam = await getUserTeam(azn.userId);
      if (!myTeam) {
        records = [];
      } else {
        const members = new Set(await getTeamMembers(myTeam));
        members.add(azn.userId); // include il lead stesso
        records = records.filter((r) => members.has(r.userId));
      }
    } else if (azn.scope === "own") {
      records = records.filter((r) => r.userId === azn.userId);
    }
    // "all" → no filter

    const now = Date.now();
    const cutoff7 = now - 7 * DAY;
    const cutoff30 = now - 30 * DAY;

    // Group by user
    const byUser = {};
    for (const r of records) {
      if (!byUser[r.userId]) byUser[r.userId] = [];
      byUser[r.userId].push(r);
    }

    // Fetch Clerk names in parallel (best-effort)
    const userIds = Object.keys(byUser);
    const namesById = {};
    try {
      const cc = await clerkClient();
      const users = await cc.users.getUserList({ userId: userIds });
      const list = users?.data || users || [];
      for (const u of list) {
        namesById[u.id] = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.emailAddresses?.[0]?.emailAddress || u.id.slice(-6);
      }
    } catch (e) {
      // silent — fallback to uid slice
    }

    // Helper: average of skill across records
    const avgSkill = (recs, key) => {
      const vals = recs.map((r) => r.skills?.[key]).filter((v) => typeof v === "number");
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    };

    // Per-operator summary
    const operators = userIds.map((uid) => {
      const recs = byUser[uid].sort((a, b) => a.timestamp - b.timestamp);
      const recs7 = recs.filter((r) => r.timestamp >= cutoff7);
      const recs30 = recs.filter((r) => r.timestamp >= cutoff30);
      const lastActivity = recs[recs.length - 1]?.timestamp || 0;

      const avgOverall = recs.length
        ? Math.round(recs.reduce((a, r) => a + (r.overall || 0), 0) / recs.length)
        : 0;

      // Sparkline points: daily averages over last 30 days (max 30 points)
      const daily = {};
      for (const r of recs30) {
        const day = Math.floor(r.timestamp / DAY);
        if (!daily[day]) daily[day] = [];
        daily[day].push(r.overall || 0);
      }
      const sparkline = Object.keys(daily)
        .sort()
        .map((d) => Math.round(daily[d].reduce((a, b) => a + b, 0) / daily[d].length));

      // Trend: avg last 7d vs prev 7d
      const avg7 = recs7.length ? recs7.reduce((a, r) => a + r.overall, 0) / recs7.length : null;
      const prev7recs = recs.filter((r) => r.timestamp >= cutoff7 - 7 * DAY && r.timestamp < cutoff7);
      const avgPrev7 = prev7recs.length ? prev7recs.reduce((a, r) => a + r.overall, 0) / prev7recs.length : null;
      let trend = null;
      if (avg7 !== null && avgPrev7 !== null) trend = Math.round(avg7 - avgPrev7);

      return {
        userId: uid,
        name: namesById[uid] || uid.slice(-6),
        totalSessions: recs.length,
        sessions7d: recs7.length,
        avgOverall,
        skills: {
          naturalezza: avgSkill(recs, "naturalezza"),
          esclusivita: avgSkill(recs, "esclusivita"),
          dipendenza: avgSkill(recs, "dipendenza"),
          conversione: avgSkill(recs, "conversione"),
          tono: avgSkill(recs, "tono"),
          gestione_obiezioni: avgSkill(recs, "gestione_obiezioni"),
        },
        sparkline,
        trend, // diff last 7d vs prev 7d (can be null)
        lastActivityDaysAgo: lastActivity ? Math.floor((now - lastActivity) / DAY) : null,
      };
    });

    // Cohort average (for risk threshold)
    const cohortAvg = operators.length
      ? operators.reduce((a, o) => a + o.avgOverall, 0) / operators.length
      : 0;

    // Risk alerts
    const alerts = [];
    for (const op of operators) {
      if (op.totalSessions < 3) continue; // non abbastanza dati
      if (op.avgOverall < cohortAvg - 15) {
        alerts.push({
          userId: op.userId,
          name: op.name,
          type: "sotto_media",
          severity: "high",
          message: `${op.avgOverall}/100 vs media cohort ${Math.round(cohortAvg)}/100 (-${Math.round(cohortAvg - op.avgOverall)})`,
        });
      }
      if (op.lastActivityDaysAgo !== null && op.lastActivityDaysAgo > 7) {
        alerts.push({
          userId: op.userId,
          name: op.name,
          type: "inattivo",
          severity: "medium",
          message: `Nessuna sessione da ${op.lastActivityDaysAgo} giorni`,
        });
      }
      if (op.trend !== null && op.trend <= -10) {
        alerts.push({
          userId: op.userId,
          name: op.name,
          type: "trend_negativo",
          severity: "high",
          message: `Score in calo: ${op.trend} punti negli ultimi 7g`,
        });
      }
    }

    // Heatmap skill x creator (across all operators)
    const skillNames = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];
    const heatmap = {};
    for (const r of records) {
      if (!r.creatorId || !r.skills) continue;
      if (!heatmap[r.creatorId]) {
        heatmap[r.creatorId] = { creatorName: r.creatorName, counts: {}, sums: {} };
        for (const s of skillNames) {
          heatmap[r.creatorId].counts[s] = 0;
          heatmap[r.creatorId].sums[s] = 0;
        }
      }
      for (const s of skillNames) {
        if (typeof r.skills[s] === "number") {
          heatmap[r.creatorId].counts[s] += 1;
          heatmap[r.creatorId].sums[s] += r.skills[s];
        }
      }
    }
    const heatmapArr = Object.entries(heatmap).map(([creatorId, v]) => ({
      creatorId,
      creatorName: v.creatorName,
      avg: skillNames.reduce((acc, s) => {
        acc[s] = v.counts[s] ? Math.round(v.sums[s] / v.counts[s]) : null;
        return acc;
      }, {}),
      totalSessions: Math.max(...skillNames.map((s) => v.counts[s])),
    }));

    return Response.json({
      operators: operators.sort((a, b) => b.avgOverall - a.avgOverall),
      alerts,
      heatmap: heatmapArr,
      cohortAvg: Math.round(cohortAvg),
      totalRecords: records.length,
    });
  } catch (error) {
    console.error("Admin dashboard GET error:", error);
    return Response.json(
      { operators: [], alerts: [], heatmap: [], error: error?.message || "Errore" },
      { status: 200 }
    );
  }
}
