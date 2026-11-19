/**
 * POST /api/numeri/[token]/upload — caricamento DIRETTO sul Blob privato (19/11/2026).
 * Stesso schema del modulo HR (/api/hr/modulo/[token]/upload):
 *  1. { type: "slot", step, contentType, size } → il server decide il pathname (casuale);
 *  2. il corpo di `upload()` di `@vercel/blob/client`: il token di upload nasce SOLO per
 *     uno slot di questo link, coi tipi ammessi e al massimo 15 MB.
 * La conferma («caricato») passa da /file, che controlla i byte veri.
 */
import { handleUpload } from "@vercel/blob/client";
import { requestSlot, authorizeBlobUpload } from "@/lib/creator-numeri";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";

export async function POST(request, props) {
  const { token } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }
  // la richiamata di fine caricamento non serve (la conferma è /file): non la chiediamo mai
  if (body?.type === "blob.upload-completed") return Response.json({ ok: true });

  const ip = await checkRateLimit("numeri_ip", ipOf(request));
  if (!ip.ok) return tooMany(ip.retryAfter);
  const rl = await checkRateLimit("numeri_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (body?.type === "slot") {
    const res = await requestSlot(token, { step: body.step, contentType: body.contentType, size: body.size });
    return Response.json(res, { status: res.ok ? 200 : res.status, headers: { "Cache-Control": "no-store" } });
  }

  if (body?.type === "blob.generate-client-token") {
    let denied = null;
    try {
      const out = await handleUpload({
        body, request,
        onBeforeGenerateToken: async (pathname) => {
          const r = await authorizeBlobUpload(token, pathname);
          if (r.error) { denied = r.error; throw new Error(r.error.error); }
          return r.options;
        },
      });
      return Response.json(out);
    } catch {
      if (denied) return Response.json({ ok: false, error: denied.error }, { status: denied.status });
      return Response.json({ ok: false, error: "Caricamento non disponibile in questo momento." }, { status: 503 });
    }
  }
  return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
}
