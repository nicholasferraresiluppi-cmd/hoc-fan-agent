// Studio social — un profilo: identità, coda contenuti, lista del giorno (permesso social.manage).
//
// GET  → { profile, items, checklist, today }
// POST { action: "item", item }                 crea/modifica un contenuto (programmato solo con i revisori passati)
// POST { action: "deleteItem", itemId }
// POST { action: "check", index, done, day? }   spunta una voce della lista del giorno
// POST { action: "publishIg", itemId, publishAtLocal }   manda a Postiz il video controllato (Instagram)
// POST { action: "arc", arc } | { action: "deleteArc", arcId }   storie della settimana (Editoriale)
export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { getProfile, listItems, saveItem, removeItem, getChecklist, toggleCheck, listArcs, saveArc, removeArc } from "@/lib/studio-social";
import { dailyChecklist, romeToday } from "@/lib/studio-social-core";
import { publishToInstagram, unpublishFromInstagram, postizConfigured } from "@/lib/studio-postiz";

const noStore = { headers: { "Cache-Control": "no-store" } };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  const today = romeToday();
  const [items, saved, arcs] = await Promise.all([listItems(id), getChecklist(id, today), listArcs(id)]);
  return Response.json({ profile, items, arcs, checklist: dailyChecklist(profile, saved), today, postiz: postizConfigured() }, noStore);
}

export async function POST(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) return Response.json({ error: "Profilo non trovato" }, { status: 404 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta non valida" }, { status: 400 }); }

  if (body?.action === "item") {
    const prevItem = body.item?.id ? (await listItems(id)).find((x) => x.id === body.item.id) : null;
    const res = await saveItem(id, body.item, az.userId);
    // tornato indietro dalla coda: il post programmato su Instagram si toglie
    if (res.ok && prevItem?.postiz?.postId && !["programmato", "pubblicato"].includes(res.item.status)) {
      await unpublishFromInstagram(id, res.item.id).catch(() => {});
    }
    if (!res.ok) return Response.json({ error: res.errors.join(". ") }, { status: 400 });
    await logAuditAction({ action: body.item?.id ? "studio.item.update" : "studio.item.add", target: `${id}/${res.item.id}`, by: az.userId, meta: { title: res.item.title, status: res.item.status } });
    return Response.json({ ok: true, item: res.item }, noStore);
  }
  if (body?.action === "deleteItem") {
    const ok = await removeItem(id, String(body.itemId || ""));
    if (!ok) return Response.json({ error: "Contenuto non trovato" }, { status: 404 });
    await logAuditAction({ action: "studio.item.remove", target: `${id}/${body.itemId}`, by: az.userId });
    return Response.json({ ok: true }, noStore);
  }
  if (body?.action === "check") {
    const day = isDay(body.day) ? body.day : romeToday();
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index > 20) return Response.json({ error: "Voce non valida" }, { status: 400 });
    const saved = await toggleCheck(id, day, index, !!body.done, az.userId);
    return Response.json({ ok: true, checklist: dailyChecklist(profile, saved) }, noStore);
  }
  if (body?.action === "publishIg") {
    const res = await publishToInstagram(id, profile, String(body.itemId || ""), { publishAtLocal: body.publishAtLocal }, az.userId);
    await logAuditAction({ action: "studio.item.instagram", target: `${id}/${body.itemId}`, by: az.userId, meta: { ok: res.ok, when: body.publishAtLocal, error: res.error || null } });
    if (!res.ok) return Response.json({ error: res.error, item: res.item }, { status: res.status || 400 });
    return Response.json({ ok: true, item: res.item }, noStore);
  }
  if (body?.action === "arc") {
    const res = await saveArc(id, body.arc, az.userId);
    if (!res.ok) return Response.json({ error: res.errors.join(". ") }, { status: 400 });
    await logAuditAction({ action: body.arc?.id ? "studio.arc.update" : "studio.arc.add", target: `${id}/${res.arc.id}`, by: az.userId, meta: { title: res.arc.title, week: res.arc.weekStart } });
    return Response.json({ ok: true, arc: res.arc }, noStore);
  }
  if (body?.action === "deleteArc") {
    const ok = await removeArc(id, String(body.arcId || ""));
    if (!ok) return Response.json({ error: "Storia non trovata" }, { status: 404 });
    await logAuditAction({ action: "studio.arc.remove", target: `${id}/${body.arcId}`, by: az.userId });
    return Response.json({ ok: true }, noStore);
  }
  return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
}
