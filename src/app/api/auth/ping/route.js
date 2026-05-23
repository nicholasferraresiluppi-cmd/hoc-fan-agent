/**
 * GET /api/auth/ping
 *
 * Endpoint leggero per mantenere viva la sessione Clerk durante operazioni
 * batch lunghe (es. sync storico di N mesi). Usato dal client con setInterval
 * ogni ~4 min: la chiamata fa transitare il cookie dal middleware Clerk,
 * che lo rinfresca se prossimo a scadere.
 *
 * Auth: qualsiasi utente loggato.
 */
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ ok: false, reason: "no-session" }, { status: 401 });
  return Response.json({ ok: true, ts: Date.now() });
}
