/**
 * POST /api/richiesta/[token]/upload — una ripresa della modella, caricata DIRETTAMENTE sul Blob
 * privato dal telefono (26/11/2026). Stesso schema di /api/numeri/[token]/upload:
 *  1. { type: "slot", shotId, contentType, size } → il server decide il pathname (casuale);
 *  2. il corpo di `upload()` di `@vercel/blob/client`: il token di upload nasce SOLO per uno slot
 *     di questo link, col tipo dichiarato e il tetto di peso (a pezzi, fino a 4 GB).
 * La conferma («caricato») passa da /file, che controlla il file vero.
 */
import { handleUpload } from "@vercel/blob/client";
import { requestSlot, authorizeBlobUpload } from "@/lib/richieste";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";

export async function POST(request, props) {
  const { token } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }
  if (body?.type === "blob.upload-completed") return Response.json({ ok: true });

  const ip = await checkRateLimit("richiesta_ip", ipOf(request));
  if (!ip.ok) return tooMany(ip.retryAfter);
  const rl = await checkRateLimit("richiesta_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (body?.type === "slot") {
    const r = await requestSlot(token, { kind: "take", shotId: String(body.shotId || ""), contentType: body.contentType, size: body.size }, "modella");
    return Response.json(r, { status: r.ok ? 200 : r.status, headers: { "Cache-Control": "no-store" } });
  }
  if (body?.type === "blob.generate-client-token") {
    let denied = null;
    try {
      const out = await handleUpload({
        body, request,
        onBeforeGenerateToken: async (pathname) => {
          const r = await authorizeBlobUpload(token, pathname, "modella");
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
