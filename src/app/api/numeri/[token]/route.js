/**
 * /api/numeri/[token] — scheda numeri della creator (pubblica, 19/11/2026).
 *
 * GET  → stato del link, risposte già salvate, screenshot già caricati.
 * POST → { type: "save", answers } salvataggio automatico mentre compila;
 *        { type: "submit", answers } invio (poi la scheda è in sola lettura).
 *
 * Nessuna auth Clerk: il token (16 byte casuali) È l'auth, come /api/hr/modulo.
 * Pubblica nel middleware (/api/numeri/(.*)): difesa qui e in lib/creator-numeri
 * (validità, scadenza, stato) + tetto di richieste per link e per IP.
 */
import { after } from "next/server";
import { openForCreator, saveAnswers, submit, getRecord } from "@/lib/creator-numeri";
import { notifyWhatsApp } from "@/lib/whatsapp-notify";
import { internalOrigin } from "@/lib/cron-chain";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";

async function limited(request, token) {
  const b = await checkRateLimit("numeri_ip", ipOf(request));
  if (!b.ok) return tooMany(b.retryAfter);
  const a = await checkRateLimit("numeri_form", String(token || "").slice(0, 64));
  if (!a.ok) return tooMany(a.retryAfter);
  return null;
}

export async function GET(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  const out = await openForCreator(token);
  if (out.state === "invalid") return Response.json({ ok: false, error: "Link non valido." }, { status: 404 });
  return Response.json({ ok: true, ...out }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request, props) {
  const { token } = await props.params;
  const stop = await limited(request, token);
  if (stop) return stop;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }
  if (body?.type === "save") {
    const r = await saveAnswers(token, body.answers);
    return Response.json(r, { status: r.ok ? 200 : r.status });
  }
  if (body?.type === "submit") {
    const r = await submit(token, body.answers);
    if (!r.ok) return Response.json(r, { status: r.status });
    after(async () => {
      const rec = await getRecord(token).catch(() => null);
      const who = rec?.answers?.stageName || rec?.name || "Una creator";
      // solo il nome d'arte e il link interno: nessun altro dato passa a CallMeBot
      await notifyWhatsApp(`${who} ha inviato la scheda numeri.\n${internalOrigin(request)}/admin/schede-numeri?t=${token}`).catch(() => {});
    });
    return Response.json({ ok: true });
  }
  return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
}
