/**
 * /api/admin/hr/people/[id]/documents — documenti della persona sul task ClickUp (people.manage, 18/10/2026).
 * GET  → { documents, taskUrl } letti DAL TASK a ogni richiesta (un file aggiunto su ClickUp si vede subito)
 * POST → multipart `file`: lo carica come allegato del task (PDF/JPG/PNG, max 4 MB)
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getPerson } from "@/lib/hr-people";
import { listPersonDocuments, uploadPersonDocument } from "@/lib/hr-documents";

export const runtime = "nodejs";
export const maxDuration = 60;
const NS = { "Cache-Control": "private, no-store" };

export async function GET(request, props) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await props.params;
  const p = await getPerson(id);
  if (!p) return Response.json({ error: "Persona non trovata." }, { status: 404 });
  try {
    return Response.json(await listPersonDocuments(p), { headers: NS });
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
