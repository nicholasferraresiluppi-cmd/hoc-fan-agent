/**
 * /api/hr/modulo/[token] — modulo pubblico "i miei dati" (Centro HR, 29/09/2026).
 *
 * GET  → contesto per /hr/modulo/[token]: stato del link, valori già noti
 *        (MAI il codice fiscale: solo "già inserito sì/no"), opzioni.
 * POST → invio del modulo { data, consent: true }. Monouso: dopo l'invio il
 *        link resta aperto solo per caricare i file (1 ora), poi si chiude.
 *
 * Nessuna auth Clerk: il token (24 byte casuali, 14 giorni) È l'auth, come
 * /api/candidate/[token]. Difesa qui e in lib/hr-people (validità, scadenza,
 * stato); tetto di richieste per token e per IP (lib/rate-limit).
 */
import { getFormContext, submitForm } from "@/lib/hr-people";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function ipOf(request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";
}

async function limited(request, token) {
  const a = await checkRateLimit("hr_form", String(token || "").slice(0, 64));
  if (!a.ok) return tooMany(a.retryAfter);
  const b = await checkRateLimit("hr_form_ip", ipOf(request));
  if (!b.ok) return tooMany(b.retryAfter);
  return null;
}

export async function GET(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  const ctx = await getFormContext(token);
  if (!ctx.ok) return Response.json({ ok: false, error: ctx.error }, { status: ctx.status });
  return Response.json(ctx, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
  }
  const res = await submitForm(token, body || {});
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: res.status });
  return Response.json(res);
}
