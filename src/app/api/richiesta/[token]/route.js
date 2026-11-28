/**
 * GET /api/richiesta/[token] — la richiesta vista dalla modella (pubblica, 26/11/2026).
 * Riprese con video di riferimento, cosa fare, outfit, frase, nota vocale, stato e i suoi file.
 *
 * Nessuna auth Clerk: il token (16 byte casuali) È l'auth, come /api/numeri e /api/hr/modulo.
 * Pubblica nel middleware (/api/richiesta/(.*)): difesa qui e in lib/richieste (validità,
 * scadenza) + tetto di richieste per link e per IP. I file si vedono con link firmati a scadenza.
 */
import { openForModel } from "@/lib/richieste";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";

export async function GET(request, props) {
  const { token } = await props.params;
  const b = await checkRateLimit("richiesta_ip", ipOf(request));
  if (!b.ok) return tooMany(b.retryAfter);
  const a = await checkRateLimit("richiesta_form", String(token || "").slice(0, 64));
  if (!a.ok) return tooMany(a.retryAfter);
  const out = await openForModel(token);
  if (out.link === "invalid") return Response.json({ ok: false, error: "Link non valido." }, { status: 404 });
  return Response.json({ ok: true, ...out }, { headers: { "Cache-Control": "no-store" } });
}
