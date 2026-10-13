// S4S — kit promo di una pagina (13/10/2026, punto 2).
// Lettura: chiunque abbia accesso al calendario S4S (deve pubblicare il kit del partner).
// Modifica: solo chi segue quella pagina (creator assegnate) o chi vede tutte le creator.
//
// GET  ?c=<creatorId>                                   il kit
// POST multipart/form-data { c, file }                  aggiunge una foto (già ridotta dal browser)
// POST {action:"text", c, text_post, text_mass}         testi
// POST {action:"use", c, id, use}                       per cosa va la foto: both | post | mass
// POST {action:"remove", c, id}                         toglie la foto (anche dallo spazio privato)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { getNames, listSplits } from "@/lib/s4s";
import { getKit, addPhoto, saveKitText, setPhotoUse, removePhoto } from "@/lib/s4s-kit";

async function gate(cid, write) {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return { res: Response.json({ error: az.message }, { status: az.status }) };
  const id = Number(cid);
  // solo pagine che stanno in uno split S4S: niente kit di pagine a caso
  const inSplit = (await listSplits()).some((s) => s.creator_ids.map(Number).includes(id));
  if (!Number.isInteger(id) || !inSplit) return { res: Response.json({ error: "Pagina non trovata" }, { status: 404 }) };
  if (write && !az.creatorScope.all) {
    const names = await getNames();
    if (!allowsCreator(az.creatorScope, names[String(id)])) return { res: Response.json({ error: "Questa pagina non è tra quelle che segui" }, { status: 403 }) };
  }
  return { az, id };
}

export async function GET(request) {
  const g = await gate(new URL(request.url).searchParams.get("c"), false);
  if (g.res) return g.res;
  const k = await getKit(g.id);
  return Response.json({ kit: { ...k, photos: (k.photos || []).map(({ path, ...p }) => p) } }); // eslint-disable-line no-unused-vars
}

export async function POST(request) {
  const type = request.headers.get("content-type") || "";
  try {
    if (type.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const g = await gate(form.get("c"), true);
      if (g.res) return g.res;
      const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function") return Response.json({ error: "Nessuna foto" }, { status: 400 });
      await addPhoto(g.id, Buffer.from(await file.arrayBuffer()), file.type, g.az.userId);
      return Response.json({ ok: true });
    }
    const body = await request.json().catch(() => ({}));
    const g = await gate(body.c, true);
    if (g.res) return g.res;
    if (body.action === "text") await saveKitText(g.id, body, g.az.userId);
    else if (body.action === "use") await setPhotoUse(g.id, String(body.id || ""), body.use, g.az.userId);
    else if (body.action === "remove") await removePhoto(g.id, String(body.id || ""), g.az.userId);
    else return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || "Operazione fallita" }, { status: 400 });
  }
}
