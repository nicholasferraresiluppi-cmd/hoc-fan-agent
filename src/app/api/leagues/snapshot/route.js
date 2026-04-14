import { saveSeasonSnapshot, currentSeasonKey, previousSeasonKey } from "@/lib/leagues";
import { authorize, CAPABILITIES } from "@/lib/rbac";

function isAuthorized(request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronHeader = request.headers.get("x-vercel-cron");
  if (cronHeader) return true;
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader === `Bearer ${secret}`) return true;
  return false;
}

async function authorized(request) {
  if (isAuthorized(request)) return true;
  const a = await authorize(CAPABILITIES.LEAGUES_SNAPSHOT);
  return a.ok;
}

// POST/GET: snapshot della stagione precedente (default) — chiusura mensile.
// Query ?season=YYYY-MM per forzare una stagione specifica.
export async function POST(request) {
  if (!(await authorized(request))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const url = new URL(request.url);
    const seasonKey = url.searchParams.get("season") || previousSeasonKey();
    const snap = await saveSeasonSnapshot(seasonKey);
    return Response.json({ ok: true, seasonKey, totalRanked: snap.totalRanked, saved: true });
  } catch (e) {
    console.error("League snapshot error:", e);
    return Response.json({ error: e?.message || "error" }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
