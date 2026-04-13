import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";

const DAY = 24 * 60 * 60 * 1000;
const SKILLS = ["naturalezza", "esclusivita", "dipendenza", "conversione", "tono", "gestione_obiezioni"];

// ISO week helper (YYYY-W##) — uses Thursday-anchored week
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d - firstThursday) / DAY;
  const week = 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7) + 3) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isAuthorized(request) {
  // Vercel Cron header OR explicit CRON_SECRET
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-vercel-cron");
  if (cronHeader) return true;
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader === `Bearer ${secret}`) return true;
  return false;
}

async function isAdmin() {
  try {
    const { userId } = await auth();
    if (!userId) return false;
    const admins = (process.env.HOC_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    return admins.includes(userId);
  } catch { return false; }
}

async function buildSnapshot({ weekCutoffMs, weekEndMs }) {
  // Read all records from last 14d to be safe, then filter into [start, end)
  const keys = (await kv.zrange("score_hist:index", 0, 999, { rev: true })) || [];
  const records = (await Promise.all(keys.map((k) => kv.get(k)))).filter(Boolean);
  const inWeek = records.filter((r) => r.timestamp >= weekCutoffMs && r.timestamp < weekEndMs);

  const byUser = {};
  for (const r of inWeek) {
    if (!byUser[r.userId]) byUser[r.userId] = { sessions: 0, overall: [], skills: Object.fromEntries(SKILLS.map((s) => [s, []])) };
    byUser[r.userId].sessions += 1;
    if (typeof r.overall === "number") byUser[r.userId].overall.push(r.overall);
    for (const s of SKILLS) {
      if (typeof r.skills?.[s] === "number") byUser[r.userId].skills[s].push(r.skills[s]);
    }
  }

  const MIN = 2;
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const entries = Object.entries(byUser)
    .filter(([, v]) => v.sessions >= MIN && v.overall.length > 0)
    .map(([uid, v]) => ({
      userId: uid,
      sessions: v.sessions,
      overall: avg(v.overall),
      skills: Object.fromEntries(SKILLS.map((s) => [s, avg(v.skills[s])])),
    }))
    .sort((a, b) => (b.overall || 0) - (a.overall || 0));

  // Name resolution (top 10 only)
  const top = entries.slice(0, 10);
  const nameMap = {};
  try {
    const cc = await clerkClient();
    const users = await cc.users.getUserList({ userId: top.map((e) => e.userId) });
    const list = users?.data || users || [];
    for (const u of list) {
      nameMap[u.id] = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.emailAddresses?.[0]?.emailAddress || `Operatore ${u.id.slice(-4)}`;
    }
  } catch { /* silent */ }

  const top10 = top.map((e, i) => ({
    rank: i + 1,
    userId: e.userId,
    name: nameMap[e.userId] || `Operatore ${e.userId.slice(-4)}`,
    overall: e.overall,
    sessions: e.sessions,
    skills: e.skills,
  }));

  // Per-skill champions
  const skillChampions = {};
  for (const s of SKILLS) {
    const ranked = [...entries]
      .filter((e) => typeof e.skills[s] === "number")
      .sort((a, b) => b.skills[s] - a.skills[s]);
    if (ranked.length) {
      const w = ranked[0];
      skillChampions[s] = {
        userId: w.userId,
        name: nameMap[w.userId] || `Operatore ${w.userId.slice(-4)}`,
        value: w.skills[s],
      };
    }
  }

  return {
    top10,
    skillChampions,
    totalQualifying: entries.length,
    totalSessions: inWeek.length,
  };
}

export async function POST(request) {
  const authorized = isAuthorized(request) || (await isAdmin());
  if (!authorized) return Response.json({ error: "Non autorizzato." }, { status: 401 });

  try {
    const now = Date.now();
    // Snapshot the week that just ended: last 7 days up to "now"
    const weekEndMs = now;
    const weekCutoffMs = now - 7 * DAY;
    const weekKey = isoWeekKey(new Date(weekEndMs - DAY)); // the week being closed

    const snap = await buildSnapshot({ weekCutoffMs, weekEndMs });

    const payload = {
      weekKey,
      createdAt: now,
      periodStart: weekCutoffMs,
      periodEnd: weekEndMs,
      ...snap,
    };

    await kv.set(`lb_snapshot:${weekKey}`, payload);
    await kv.zadd("lb_snapshot:index", { score: now, member: weekKey });

    return Response.json({ ok: true, weekKey, top10Count: snap.top10.length, totalQualifying: snap.totalQualifying });
  } catch (error) {
    console.error("Snapshot error:", error);
    return Response.json({ error: error?.message || "Errore" }, { status: 500 });
  }
}

// GET for cron (Vercel cron uses GET)
export async function GET(request) {
  return POST(request);
}
