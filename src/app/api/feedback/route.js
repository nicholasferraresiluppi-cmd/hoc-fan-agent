// Invio di una segnalazione/suggerimento (qualsiasi utente loggato).
import { auth, currentUser } from "@clerk/nextjs/server";
import { addFeedback } from "@/lib/feedback";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato" }, { status: 401 });
  const rl = await checkRateLimit("feedback", userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = await request.json().catch(() => ({}));
  const u = await currentUser().catch(() => null);
  const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.emailAddresses?.[0]?.emailAddress || null;
  try {
    await addFeedback({ userId, name, page: body.page, kind: body.kind, text: body.text });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
