import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

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
    const feedback = await Promise.all((feedbackKeys || []).map((k) => kv.get(k)));

    return Response.json({ feedback: (feedback || []).filter(Boolean) });
  } catch (error) {
    console.error("Admin sessions GET error:", error);
    return Response.json({ error: "Errore.", feedback: [] }, { status: 200 });
  }
}
