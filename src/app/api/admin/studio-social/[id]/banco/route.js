// Banco montaggi di un profilo (permesso social.manage).
//
// GET                  cartella collegata e video con il loro stato (&refresh=1 rilegge il drive)
// GET ?thumb=id        anteprima di un video della cartella
// GET ?media=id        il video a pezzi (Range), per guardarlo in pagina e per scaricarlo
// POST { action: "folder", url }            collega la cartella
// POST { action: "mark", fileId, state }    da_vedere | scelto | pronto | scartato
export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { getProfile } from "@/lib/studio-social";
import { getBanco, setBancoFolder, markFile, hasFile } from "@/lib/studio-banco";
import { driveConfigured, driveEmail, thumbnail, mediaChunk } from "@/lib/google-drive";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  if (!(await getProfile(id))) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  const sp = new URL(request.url).searchParams;

  const thumb = sp.get("thumb");
  if (thumb) {
    if (!(await hasFile(id, thumb))) return new Response(null, { status: 404 });
    try {
      const t = await thumbnail(thumb, 400);
      if (!t) return new Response(null, { status: 404 });
      return new Response(t.body, { headers: { "Content-Type": t.type, "Cache-Control": "private, max-age=86400" } });
    } catch { return new Response(null, { status: 502 }); }
  }

  const media = sp.get("media");
  if (media) {
    if (!(await hasFile(id, media))) return new Response(null, { status: 404 });
    try {
      const c = await mediaChunk(media, request.headers.get("range"));
      if (c.status === 416) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${c.size}` } });
      return new Response(c.body, { status: 206, headers: {
        "Content-Type": c.mime, "Accept-Ranges": "bytes", "Content-Length": String(c.end - c.start + 1),
        "Content-Range": `bytes ${c.start}-${c.end}/${c.size}`, "Cache-Control": "private, max-age=3600",
      } });
    } catch { return new Response(null, { status: 502 }); }
  }

  const banco = await getBanco(id, { force: sp.get("refresh") === "1" });
  return Response.json({ ...banco, drive: { configured: driveConfigured(), email: driveEmail() } }, noStore);
}

export async function POST(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  if (!(await getProfile(id))) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }

  if (body?.action === "folder") {
    const res = await setBancoFolder(id, body.url, az.userId);
    if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
    await logAuditAction({ action: "studio.banco.folder", target: id, by: az.userId, meta: { folder: res.folder.name } });
    return Response.json({ ok: true, folder: res.folder }, noStore);
  }
  if (body?.action === "mark") {
    const res = await markFile(id, String(body.fileId || ""), body.state, az.userId);
    return res.ok ? Response.json({ ok: true }, noStore) : Response.json({ error: res.error }, { status: 400 });
  }
  return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
}
