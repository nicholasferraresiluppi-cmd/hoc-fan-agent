/**
 * POST /api/cron/battito — il battito degli uffici che lavorano FUORI dall'app
 * (task programmati sul Mac di Nicholas: controllo del mattino, pannello tester).
 * Senza, nella Sede risultavano "senza prova": il controllo del mattino non girava
 * dal 28/09 e nessuno lo vedeva (scoperto il 4/10/2026).
 *
 * Body: { office: "controllo-mattutino" | "pannello-tester", result?: string }
 * Auth: SOLO Bearer CRON_SECRET (path pubblico nel middleware come tutti i /api/cron).
 * Scrive cron:heartbeat:{office} — nient'altro.
 */
import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";

const ALLOWED = new Set(["controllo-mattutino", "pannello-tester"]);

export async function POST(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!ALLOWED.has(body?.office)) return Response.json({ error: "ufficio non valido" }, { status: 400 });
  const rec = { at: Date.now(), via: "task", result: String(body.result || "").slice(0, 200) };
  await kv.set(`cron:heartbeat:${body.office}`, rec, { ex: 40 * 86400 });
  return Response.json({ ok: true });
}
