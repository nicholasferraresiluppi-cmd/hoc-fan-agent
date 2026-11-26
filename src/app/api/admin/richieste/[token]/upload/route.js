/**
 * POST /api/admin/richieste/[token]/upload — riferimento o nota vocale di una ripresa, caricati
 * DIRETTAMENTE sul Blob privato dal browser della SMM (26/11/2026). Permesso social.manage.
 *  1. { type: "slot", kind: "ref"|"voce", shotId, contentType, size } → il server decide il pathname;
 *  2. il corpo di `upload()` di `@vercel/blob/client`: il token esiste solo per quello slot.
 * La conferma passa da /file, che controlla il file vero.
 */
import { handleUpload } from "@vercel/blob/client";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { requestSlot, authorizeBlobUpload, validToken } from "@/lib/richieste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, props) {
  const { token } = await props.params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida." }, { status: 400 }); }
  if (body?.type === "blob.upload-completed") return Response.json({ ok: true });
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!validToken(token)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });

  if (body?.type === "slot") {
    const r = await requestSlot(token, { kind: body.kind, shotId: String(body.shotId || ""), contentType: body.contentType, size: body.size }, "app");
    return Response.json(r.ok ? r : { error: r.error }, { status: r.ok ? 200 : r.status, headers: { "Cache-Control": "no-store" } });
  }
  if (body?.type === "blob.generate-client-token") {
    let denied = null;
    try {
      const out = await handleUpload({
        body, request,
        onBeforeGenerateToken: async (pathname) => {
          const r = await authorizeBlobUpload(token, pathname, "app");
          if (r.error) { denied = r.error; throw new Error(r.error.error); }
          return r.options;
        },
      });
      return Response.json(out);
    } catch {
      if (denied) return Response.json({ error: denied.error }, { status: denied.status });
      return Response.json({ error: "Caricamento non disponibile in questo momento." }, { status: 503 });
    }
  }
  return Response.json({ error: "Richiesta non valida." }, { status: 400 });
}
