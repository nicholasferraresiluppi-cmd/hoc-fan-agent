import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { isUserIdAdmin } from "@/lib/admin";

export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

    const { scenarioId, rating, comment, scoreSnapshot, messages } = await request.json();

    if (!scenarioId || !rating) {
      return Response.json({ error: "Dati mancanti." }, { status: 400 });
    }

    const timestamp = Date.now();
    const key = `eval_feedback:${timestamp}:${userId}`;
    const record = {
      userId,
      scenarioId,
      rating, // "up" | "down"
      comment: comment || "",
      scoreSnapshot: scoreSnapshot || null,
      messages: messages || [],
      timestamp,
      reviewed: false,
    };

    await kv.set(key, record);
    await kv.zadd("eval_feedback:index", { score: timestamp, member: key });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Feedback API error:", error);
    return Response.json({ error: "Errore nel salvataggio feedback." }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

    if (!(await isUserIdAdmin(userId))) {
      return Response.json({ error: "Non autorizzato." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const keys = await kv.zrange("eval_feedback:index", 0, limit - 1, { rev: true });
    const records = await Promise.all(keys.map((k) => kv.get(k)));
    return Response.json({ feedback: records.filter(Boolean) });
  } catch (error) {
    console.error("Feedback GET error:", error);
    return Response.json({ error: "Errore." }, { status: 500 });
  }
}
