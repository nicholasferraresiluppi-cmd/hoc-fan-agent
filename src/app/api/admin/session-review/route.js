/**
 * GET /api/admin/session-review
 *
 * Lista sessioni complete (record `session:{id}` da KV) per la review da
 * parte di trainer/coach. Filtrate per scope RBAC del chiamante.
 *
 * Note: nominata "session-review" e NON "sessions" perché in
 * /api/admin/sessions/ esiste già una rotta diversa che ritorna feedback
 * di valutazione (eval_feedback:index) — non vogliamo collidere.
 *
 * Capability richiesta: REVIEW.
 *  - admin / sales_manager / qa_reviewer (scope "all") → tutte le sessioni
 *  - team_lead (scope "team")                          → sessioni del team
 *  - operator (no REVIEW)                              → 403
 *
 * Query params:
 *   ?limit=50          (default 50, max 200)
 *   ?operator=NAME     (opzionale, filtra per operatorName)
 */
import { kv } from "@vercel/kv";
import {
  authorize,
  getUserTeam,
  getTeamMembers,
  CAPABILITIES,
} from "@/lib/rbac";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.REVIEW);
  if (!az.ok) {
    return Response.json({ error: az.message }, { status: az.status });
  }

  const { userId, scope, role } = az;
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
  const operatorFilter = url.searchParams.get("operator");

  const overFetch = limit * 5;
  const sessionIds = (await kv.lrange("sessions:all", 0, overFetch - 1)) || [];

  if (sessionIds.length === 0) {
    return Response.json({ sessions: [], scope, role });
  }

  const records = await Promise.all(
    sessionIds.map((id) => kv.get(`session:${id}`).catch(() => null))
  );
  let sessions = records.filter(Boolean);

  if (scope === "team") {
    const myTeam = await getUserTeam(userId);
    if (!myTeam) {
      sessions = [];
    } else {
      const teamMembers = new Set(await getTeamMembers(myTeam));
      teamMembers.add(userId);
      sessions = sessions.filter((s) => teamMembers.has(s.userId));
    }
  } else if (scope === "own") {
    sessions = sessions.filter((s) => s.userId === userId);
  }

  if (operatorFilter) {
    sessions = sessions.filter(
      (s) => (s.operatorName || "").toLowerCase() === operatorFilter.toLowerCase()
    );
  }

  const summary = sessions.slice(0, limit).map((s) => ({
    id: s.id,
    userId: s.userId,
    operatorName: s.operatorName || null,
    fanName: s.fanName || null,
    fanProfileId: s.fanProfileId || null,
    mode: s.mode || null,
    timestamp: s.timestamp || null,
    messageCount: s.messageCount || (s.messages?.length ?? 0),
    duration: s.duration || 0,
    score: s.score
      ? {
          overall: s.score.overall ?? null,
          stars: s.score.stars ?? null,
          xp: s.score.xp ?? null,
          goal_achieved: s.score.goal_achieved ?? null,
        }
      : null,
  }));

  return Response.json({ sessions: summary, scope, role });
}
