import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES, getTeamMembers, getUserTeam } from "@/lib/rbac";

// GET — list recent evaluation feedback + sessions for SM review
export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    const _az = await authorize(CAPABILITIES.REVIEW);
    if (!_az.ok) return Response.json({ error: _az.message }, { status: _az.status });

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    // Recent feedback
    const feedbackKeys = await kv.zrange("eval_feedback:index", 0, limit - 1, { rev: true });
    let feedback = (await Promise.all((feedbackKeys || []).map((k) => kv.get(k)))).filter(Boolean);

    // Scope filter
    if (_az.scope === "team") {
      const myTeam = await getUserTeam(_az.userId);
      if (!myTeam) {
        feedback = [];
      } else {
        const members = new Set(await getTeamMembers(myTeam));
        members.add(_az.userId);
        feedback = feedback.filter((f) => members.has(f.userId));
      }
    } else if (_az.scope === "own") {
      feedback = feedback.filter((f) => f.userId === _az.userId);
    }

    return Response.json({ feedback });
  } catch (error) {
    console.error("Admin sessions GET error:", error);
    return Response.json({ error: "Errore.", feedback: [] }, { status: 200 });
  }
}
