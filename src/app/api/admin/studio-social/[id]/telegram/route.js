// Studio social — canale Telegram, foto e landing di un profilo (permesso social.manage).
//
// GET  → { config, posts, photos, channels, funnel, botConfigured, blobReady }
// POST multipart { file }                          carica una foto (già ridotta dal browser)
// POST { action: "config", channelId?, ofLinkUrl?, landing? }
// POST { action: "post", post }                    crea/modifica un post (torna in bozza)
// POST { action: "approve", postId }               una persona approva → parte da solo all'ora scelta
// POST { action: "status", postId, status }        bozza | annullato
// POST { action: "deletePost", postId } | { action: "deletePhoto", photoId }
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { getProfile } from "@/lib/studio-social";
import { listChannels, botConfigured } from "@/lib/telegram-channels";
import {
  getTgConfig, saveTgConfig, listPosts, savePost, approvePost, setPostStatus, deletePost,
  listPhotos, addPhoto, removePhoto, funnelNumbers, blobReady,
} from "@/lib/studio-telegram";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate(params) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { res: Response.json({ error: az.message }, { status: az.status }) };
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return { res: Response.json({ error: "Profilo non trovato" }, { status: 404 }) };
  return { az, id, profile };
}

export async function GET(request, { params }) {
  const g = await gate(params);
  if (g.res) return g.res;
  const [config, posts, photos, channels, funnel] = await Promise.all([
    getTgConfig(g.id), listPosts(g.id), listPhotos(g.id),
    listChannels().catch(() => []),
    funnelNumbers(g.id).catch(() => ({})),
  ]);
  return Response.json({
    config, posts, photos, funnel,
    channels: channels.map((c) => ({ id: c.id, title: c.title || c.handle || c.url || "Canale", creators: c.creators || (c.creator ? [c.creator] : []), connected: !!c.chat_id, botAdmin: c.bot?.status === "admin", links: (c.links || []).filter((l) => !l.revoked).map((l) => ({ name: l.name, url: l.url, source: l.source })) })),
    botConfigured: botConfigured(), blobReady: blobReady(),
  }, noStore);
}

export async function POST(request, { params }) {
  const g = await gate(params);
  if (g.res) return g.res;
  const fail = (errors, status = 400) => Response.json({ error: (Array.isArray(errors) ? errors : [errors]).join(". ") }, { status });
  try {
    if ((request.headers.get("content-type") || "").startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function") return fail("Nessuna foto");
      const photo = await addPhoto(g.id, Buffer.from(await file.arrayBuffer()), file.type, g.az.userId);
      return Response.json({ ok: true, photo }, noStore);
    }
    const body = await request.json().catch(() => null);
    if (!body) return fail("Richiesta non valida");
    let res;
    switch (body.action) {
      case "config": res = await saveTgConfig(g.id, body, g.az.userId); break;
      case "post": res = await savePost(g.id, body.post, g.az.userId); break;
      case "approve": res = await approvePost(g.id, String(body.postId || ""), g.az.userId); break;
      case "status": res = await setPostStatus(g.id, String(body.postId || ""), body.status, g.az.userId); break;
      case "deletePost": res = await deletePost(g.id, String(body.postId || "")); break;
      case "deletePhoto": { const r = await removePhoto(g.id, String(body.photoId || "")); res = r.ok ? r : { ok: false, errors: [r.error] }; break; }
      default: return fail("Azione sconosciuta");
    }
    if (!res.ok) return fail(res.errors);
    await logAuditAction({ action: `studio.tg.${body.action}`, target: `${g.id}/${body.postId || body.photoId || body.post?.id || ""}`, by: g.az.userId }).catch(() => {});
    return Response.json({ ok: true, ...res }, noStore);
  } catch (e) {
    return fail(e.message || "Operazione fallita");
  }
}
