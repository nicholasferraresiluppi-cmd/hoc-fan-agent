// Editoriale Instagram — API (permesso social.manage: admin e ruoli Social / SMM).
//
// GET                         creator con profili Instagram + cartelle collegate
// GET ?creator=Nome           tutto della creator: cartella, file del drive (con chi li usa), contenuti, profili
//                             (+ &refresh=1 rilegge il drive subito)
// GET ?creator=Nome&thumb=id  anteprima di un file (solo file della cartella di quella creator)
// GET ?creator=Nome&log=1     storico
// POST {action:"folder",  creator, url}              collega la cartella del drive
// POST {action:"save",    creator, item}             nuovo contenuto o modifica (foto, ordine, testi)
// POST {action:"delete",  creator, id}               smonta: i file tornano liberi
// POST {action:"ready",   creator, id, on}           pronto / di nuovo in preparazione
// POST {action:"schedule",creator, id, slot|null}    in calendario {profileId, date, time}
// POST {action:"publish", creator, id, on, today, profileId}
export const runtime = "nodejs";
export const maxDuration = 60;

import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { driveConfigured, driveEmail, thumbnail } from "@/lib/google-drive";
import {
  creatorsWithProfiles, allConfigs, getConfig, setFolder, getFiles, listItems, saveItem, deleteItem, stepItem, getLog,
} from "@/lib/editoriale-store";
import { creatorKey, usageMap } from "@/lib/editoriale-core";
import { kv } from "@vercel/kv";

const noStore = { headers: { "Cache-Control": "no-store" } };

async function gate() {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return { err: Response.json({ error: az.message }, { status: az.status }) };
  let name = az.userId;
  try { const u = await currentUser(); name = u?.fullName || u?.firstName || u?.primaryEmailAddress?.emailAddress || az.userId; } catch {}
  return { by: { userId: az.userId, name } };
}

export async function GET(request) {
  const g = await gate();
  if (g.err) return g.err;
  const sp = new URL(request.url).searchParams;
  const creator = sp.get("creator");
  const drive = { configured: driveConfigured(), email: driveEmail() };
  if (!creator) {
    const [creators, cfgs] = await Promise.all([creatorsWithProfiles(), allConfigs()]);
    return Response.json({ creators: creators.map((c) => ({ ...c, folder: cfgs[c.ck] || null })), drive }, noStore);
  }
  const ck = creatorKey(creator);
  if (sp.get("thumb")) {
    // solo file che stanno nella cartella di questa creator: l'anteprima non apre il resto del drive
    const id = sp.get("thumb");
    const doc = await kv.get(`edit:files:${ck}`);
    const used = await kv.hget(`edit:used:${ck}`, id);
    if (!doc?.files?.some((f) => f.id === id) && !used) return new Response(null, { status: 404 });
    try {
      const t = await thumbnail(id, Number(sp.get("s")) === 1200 ? 1200 : 400);
      if (!t) return new Response(null, { status: 404 });
      return new Response(t.body, { headers: { "Content-Type": t.type, "Cache-Control": "private, max-age=86400" } });
    } catch { return new Response(null, { status: 502 }); }
  }
  if (sp.get("log")) return Response.json({ log: await getLog(ck) }, noStore);
  const [creators, cfg] = await Promise.all([creatorsWithProfiles(), getConfig(ck)]);
  const c = creators.find((x) => x.ck === ck);
  if (!c) return Response.json({ error: "Creator senza profili Instagram in Account social" }, { status: 404 });
  const [files, items] = await Promise.all([cfg ? getFiles(ck, { force: sp.get("refresh") === "1" }) : null, listItems(ck)]);
  const used = usageMap(items);
  const list = (files?.files || []).map((f) => ({ ...f, usedBy: used.get(f.id) || null }));
  return Response.json({
    creator: c.creator, ck, profiles: c.profiles, folder: cfg, drive,
    files: list, filesAt: files?.at || null, filesError: files?.error || null, truncated: Boolean(files?.truncated),
    items: items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
  }, noStore);
}

export async function POST(request) {
  const g = await gate();
  if (g.err) return g.err;
  const body = await request.json().catch(() => ({}));
  const ck = creatorKey(body.creator);
  if (!ck) return Response.json({ error: "Manca la creator" }, { status: 400 });
  const fail = (r) => Response.json({ error: (r.errors || ["Errore"]).join("; ") }, { status: r.status || 400 });
  try {
    let r;
    if (body.action === "folder") r = await setFolder(String(body.creator), body.url, g.by);
    else if (body.action === "save") r = await saveItem(ck, body.item || {}, g.by);
    else if (body.action === "delete") r = await deleteItem(ck, String(body.id || ""), g.by);
    else if (["ready", "schedule", "publish"].includes(body.action)) r = await stepItem(ck, String(body.id || ""), body.action, body, g.by);
    else return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    return r.ok ? Response.json(r) : fail(r);
  } catch (e) {
    return Response.json({ error: e.message || "Errore" }, { status: 500 });
  }
}
