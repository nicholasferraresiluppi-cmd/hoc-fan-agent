/**
 * POST /api/hr/modulo/[token]/file — "ho caricato il file" (03/10/2026).
 *
 * Corpo JSON { kind: "document"|"cv", pathname }: il riferimento al blob appena
 * caricato sul Blob privato (vedi …/upload), MAI i byte (prima passavano di qui e
 * sopra ~4,5 MB Vercel rispondeva 413). Il server legge il blob, verifica il tipo
 * vero sui primi byte, lo allega al task ClickUp e cancella subito il blob. In
 * app resta solo il riferimento. Se ClickUp non risponde (429/5xx) o il task non
 * esiste ancora: il blob resta, un elemento va in coda e alla persona si dice
 * "ricevuto" (lib/hr-uploads). La coda riparte dopo la risposta (`after()`).
 *
 * Pubblica (middleware) e difesa da sola: lo slot del blob è legato al token.
 */
import { after } from "next/server";
import { receiveUpload, transferDeferred, drainHrBackground } from "@/lib/hr-uploads";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300; // copia di file fino a 50 MB verso ClickUp (in after()): margine ampio

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";

export async function POST(request, props) {
  const { token } = await props.params;
  const ip = await checkRateLimit("hr_upload_ip", ipOf(request));
  if (!ip.ok) return tooMany(ip.retryAfter);
  const rl = await checkRateLimit("hr_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }
  const res = await receiveUpload(token, { kind: body?.kind, pathname: body?.pathname }, { defer: true });
  after(async () => {
    if (res.deferred) await transferDeferred(res.deferred).catch(() => {});
    await drainHrBackground({ budgetMs: 6000 }).catch(() => {});
  });
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: res.status });
  return Response.json({ ok: true, received: true });
}
