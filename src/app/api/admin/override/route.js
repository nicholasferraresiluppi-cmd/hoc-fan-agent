import { auth } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";

function isAdmin(userId) {
  const ids = (process.env.HOC_ADMIN_USER_IDS || "").split(",").map((s) => s.trim());
  return ids.includes(userId);
}

// POST — SM overrides a score with corrected evaluation + comment
export async function POST(request) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });
    if (!isAdmin(userId)) return Response.json({ error: "Non autorizzato." }, { status: 403 });

    const { feedbackKey, correctedScore, smComment, outcome } = await request.json();

    if (!feedbackKey) {
      return Response.json({ error: "feedbackKey mancante." }, { status: 400 });
    }

    const existing = await kv.get(feedbackKey);
    if (!existing) {
      return Response.json({ error: "Record non trovato." }, { status: 404 });
    }

    const updated = {
      ...existing,
      reviewed: true,
      reviewedBy: userId,
      reviewedAt: Date.now(),
      correctedScore: correctedScore || null,
      smComment: smComment || "",
      outcome: outcome || null, // "success" | "failure"
    };

    await kv.set(feedbackKey, updated);

    // If outcome is marked, it could be promoted to golden examples manually by reviewing
    if (outcome) {
      const promoKey = `promotable:${Date.now()}:${userId}`;
      await kv.set(promoKey, {
        fromFeedbackKey: feedbackKey,
        outcome,
        messages: existing.messages,
        scenarioId: existing.scenarioId,
        timestamp: Date.now(),
      });
      await kv.zadd("promotable:index", { score: Date.now(), member: promoKey });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Override POST error:", error);
    return Response.json({ error: "Errore." }, { status: 500 });
  }
}
