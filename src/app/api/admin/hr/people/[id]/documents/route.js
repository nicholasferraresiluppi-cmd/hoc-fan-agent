/**
 * /api/admin/hr/people/[id]/documents — documenti della persona sul task ClickUp (people.manage, 18/10/2026).
 * GET  → { documents, taskUrl } letti DAL TASK a ogni richiesta (un file aggiunto su ClickUp si vede subito)
 * POST → caricamento come allegato del task, PDF/JPG/PNG:
 *        JSON { type: "slot" | "blob.generate-client-token" | "finish" } = via Blob privato, fino a 50 MB
 *        (stesso canale del modulo); multipart `file` = diretto, fino a 4 MB (dove il Blob non c'è, es. in locale)
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson } from "@/lib/hr-people";
import { listPersonDocuments, uploadPersonDocument, requestDocumentSlot, authorizeDocumentBlob, finishDocumentUpload, blobConfigured } from "@/lib/hr-documents";

export const runtime = "nodejs";
export const maxDuration = 300; // copia verso ClickUp di file fino a 50 MB
const NS = { "Cache-Control": "private, no-store" };

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  try {
    return Response.json({ ...(await listPersonDocuments(p)), bigUpload: blobConfigured() }, { headers: NS });
  } catch (e) {
    return Response.json({ error: `ClickUp non risponde: ${e?.message || "errore"}` }, { status: 502, headers: NS });
  }
}

export async function POST(request, props) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  if (p.archived) return Response.json({ error: "Scheda archiviata: prima si ripristina." }, { status: 409 });
  if ((request.headers.get("content-type") || "").includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    try {
      if (body?.type === "slot") {
        const r = await requestDocumentSlot(p, { filename: body.filename, contentType: body.contentType, size: body.size }, { actor: az.userId });
        return Response.json(r, { status: r.ok ? 200 : r.status, headers: NS });
      }
      if (body?.type === "blob.generate-client-token") {
        const { handleUpload } = await import("@vercel/blob/client");
        let denied = null;
        try {
          const out = await handleUpload({
            body, request,
            onBeforeGenerateToken: async (pathname) => {
              const r = await authorizeDocumentBlob(id, pathname, { actor: az.userId });
              if (r.error) { denied = r.error; throw new Error(r.error); }
              return r.options;
            },
          });
          return Response.json(out, { headers: NS });
        } catch (e) {
          return Response.json({ error: denied || "Caricamento non autorizzato." }, { status: 403 });
        }
      }
      if (body?.type === "finish") {
        const r = await finishDocumentUpload(p, String(body.pathname || ""), { actor: az.userId });
        if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
        return Response.json({ ok: true, name: r.name, ...(await listPersonDocuments(p).catch(() => ({}))) }, { headers: NS });
      }
    } catch (e) {
      return Response.json({ error: `Caricamento su ClickUp non riuscito: ${e?.message || "errore"}` }, { status: 502 });
    }
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  let file;
  try { file = (await request.formData()).get("file"); } catch { return Response.json({ error: "File oltre 4 MB o non leggibile: caricalo direttamente su ClickUp." }, { status: 413 }); }
  if (!file || typeof file.arrayBuffer !== "function") return Response.json({ error: "Nessun file." }, { status: 400 });
  try {
    const r = await uploadPersonDocument(p, { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, { actor: az.userId });
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ ok: true, name: r.name, ...(await listPersonDocuments(p).catch(() => ({}))) }, { headers: NS });
  } catch (e) {
    return Response.json({ error: `Caricamento su ClickUp non riuscito: ${e?.message || "errore"}` }, { status: 502 });
  }
}
