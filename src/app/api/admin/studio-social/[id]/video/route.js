// Studio social — il video montato, caricato DIRETTO dal browser nello spazio privato (permesso social.manage).
// È lo stesso file che passa dall'agente qualità e che poi esce su Instagram: niente scambi di file.
//
// POST (corpo di upload() di @vercel/blob/client)   token di caricamento solo per studio/{pid}/video/{itemId}/…
// POST { action: "attach", itemId, path, name, size, contentType }   il file caricato diventa il video del contenuto
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { handleUpload } from "@vercel/blob/client";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProfile } from "@/lib/studio-social";
import { attachVideo } from "@/lib/studio-postiz";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_BYTES = 500 * 1024 * 1024;

export async function POST(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  if (!(await getProfile(id))) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }

  if (body?.action === "attach") {
    const res = await attachVideo(id, String(body.itemId || ""), { path: body.path, name: body.name, size: body.size, contentType: body.contentType }, az.userId);
    return Response.json(res.ok ? res : { error: res.error }, { status: res.ok ? 200 : 400 });
  }

  if (body?.type === "blob.generate-client-token") {
    try {
      const out = await handleUpload({
        body, request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const itemId = String(clientPayload || "");
          if (!/^[A-Za-z0-9-]{4,40}$/.test(itemId) || !pathname.startsWith(`studio/${id}/video/${itemId}/`)) throw new Error("Percorso non valido");
          return { allowedContentTypes: VIDEO_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
        },
      });
      return Response.json(out);
    } catch (e) {
      return Response.json({ error: e.message || "Caricamento non disponibile" }, { status: 400 });
    }
  }
  return Response.json({ error: "Richiesta non valida" }, { status: 400 });
}
