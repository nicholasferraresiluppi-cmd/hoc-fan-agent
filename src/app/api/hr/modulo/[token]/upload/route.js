/**
 * POST /api/hr/modulo/[token]/upload — caricamento DIRETTO sul Blob privato (03/10/2026).
 *
 * Due richieste dal browser sulla stessa route:
 *  1. { type: "slot", kind, contentType, size } → il server decide il pathname
 *     (casuale, senza dati personali) e lo lega a questo token e a questa scheda;
 *  2. il corpo di `upload()` di `@vercel/blob/client` (handleUpload): il token di
 *     upload si genera SOLO per uno slot di questo token, entro la finestra dei file,
 *     coi tipi ammessi e al massimo 50 MB (lib/hr-uploads → authorizeBlobUpload).
 * In produzione Vercel Blob richiama questa route a upload finito
 * (`onUploadCompleted`): è solo una RETE DI SICUREZZA se il browser si chiude
 * prima di chiamare /file. Non scatta in locale ed è asincrono: il meccanismo
 * principale resta la chiamata a /file.
 *
 * Pubblica (middleware: /api/hr/modulo/(.*)) e difesa da sola: il token del modulo
 * è l'auth; il link condiviso non carica file; tetti per token e per IP.
 */
import { after } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requestUploadSlot, authorizeBlobUpload, receiveUpload, drainHrBackground } from "@/lib/hr-uploads";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";
import { internalOrigin } from "@/lib/cron-chain";

export const runtime = "nodejs";
export const maxDuration = 300; // copia di file fino a 50 MB verso ClickUp (in after()): margine ampio

const ipOf = (request) => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";

export async function POST(request, props) {
  const { token } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 }); }

  // richiamata di Vercel Blob a upload finito: firmata, verificata da handleUpload
  if (body?.type === "blob.upload-completed") {
    try {
      const out = await handleUpload({
        body, request,
        onBeforeGenerateToken: async () => { throw new Error("non previsto"); },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          const tp = JSON.parse(tokenPayload || "{}");
          if (tp.token !== token) return;
          const r = await receiveUpload(token, { kind: tp.kind, pathname: blob.pathname });
          if (!r.ok) console.warn("[hr-upload] richiamata non presa in carico:", r.status);
        },
      });
      return Response.json(out);
    } catch {
      return Response.json({ error: "Richiamata non valida." }, { status: 400 });
    }
  }

  const ip = await checkRateLimit("hr_upload_ip", ipOf(request));
  if (!ip.ok) return tooMany(ip.retryAfter);
  const rl = await checkRateLimit("hr_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);

  if (body?.type === "slot") {
    const res = await requestUploadSlot(token, { kind: body.kind, contentType: body.contentType, size: body.size });
    if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: res.status });
    return Response.json(res, { headers: { "Cache-Control": "no-store" } });
  }

  if (body?.type === "blob.generate-client-token") {
    let denied = null;
    try {
      const out = await handleUpload({
        body, request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const r = await authorizeBlobUpload(token, pathname);
          if (r.error) { denied = r.error; throw new Error(r.error.error); }
          const kind = String(clientPayload || "").slice(0, 20);
          return {
            ...r.options,
            tokenPayload: JSON.stringify({ token, kind }),
            // richiamata solo in produzione, verso il dominio pubblico (le preview sono protette)
            ...(process.env.VERCEL_ENV === "production" ? { callbackUrl: `${internalOrigin(request)}/api/hr/modulo/${token}/upload` } : {}),
          };
        },
        // senza onUploadCompleted la libreria non chiede la richiamata (preview e locale)
        ...(process.env.VERCEL_ENV === "production" ? { onUploadCompleted: async () => {} } : {}),
      });
      after(() => drainHrBackground({ budgetMs: 6000 }).catch(() => {}));
      return Response.json(out);
    } catch {
      if (denied) return Response.json({ ok: false, error: denied.error }, { status: denied.status });
      return Response.json({ ok: false, error: "Caricamento non disponibile in questo momento." }, { status: 503 });
    }
  }

  return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
}
