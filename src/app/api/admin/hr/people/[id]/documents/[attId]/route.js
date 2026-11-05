/**
 * GET /api/admin/hr/people/[id]/documents/[attId] — apre un documento del task ClickUp (people.manage, 18/10/2026).
 * Passa in streaming dal server (i link ClickUp vogliono il token); l'apertura resta nello storico della scheda.
 * ?download=1 → lo scarica invece di aprirlo.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson } from "@/lib/hr-people";
import { openPersonDocument } from "@/lib/hr-documents";
import { safeFilename } from "@/lib/hr-documents-core";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id, attId } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  let doc;
  try { doc = await openPersonDocument(p, decodeURIComponent(attId), { actor: az.userId }); }
  catch (e) { return Response.json({ error: `ClickUp non risponde: ${e?.message || "errore"}` }, { status: 502 }); }
  if (!doc) return Response.json({ error: "Documento non trovato sul task (forse è stato tolto da ClickUp)." }, { status: 404 });
  // in pagina solo PDF e immagini: un file HTML/SVG caricato su ClickUp non deve girare sul nostro dominio
  const ct = String(doc.contentType).split(";")[0].trim().toLowerCase();
  const viewable = ct === "application/pdf" || /^image\/(png|jpe?g|gif|webp|heic|heif)$/.test(ct);
  const download = !viewable || new URL(request.url).searchParams.get("download") === "1";
  const headers = {
    "Content-Type": viewable ? ct : "application/octet-stream",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFilename(doc.row.title)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (doc.length) headers["Content-Length"] = doc.length;
  return new Response(doc.body, { headers });
}
