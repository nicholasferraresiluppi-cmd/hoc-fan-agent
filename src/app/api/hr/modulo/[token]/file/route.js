/**
 * POST /api/hr/modulo/[token]/file?kind=document|cv — un file dal modulo pubblico.
 *
 * multipart con campo "file". PDF/JPG/PNG (tipo verificato sui primi byte, non
 * sull'estensione), massimo 10 MB, massimo 4 file per link, solo nell'ora dopo
 * l'invio del modulo. Il file va DIRETTO come allegato del task ClickUp: in KV
 * resta solo il riferimento (titolo, id allegato, data).
 *
 * Nota piattaforma: su Vercel il corpo di una funzione è limitato a ~4,5 MB;
 * sopra quella soglia la richiesta non arriva qui (413 dal bordo) e il client
 * lo spiega. Per arrivare davvero a 10 MB serve un upload diretto (fase 2).
 */
import { uploadFormFile } from "@/lib/hr-people";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";
import { UPLOAD_MAX_BYTES } from "@/lib/hr-people-core";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request, props) {
  const { token } = await props.params;
  const rl = await checkRateLimit("hr_upload", String(token || "").slice(0, 64));
  if (!rl.ok) return tooMany(rl.retryAfter);
  const kind = new URL(request.url).searchParams.get("kind");
  const len = Number(request.headers.get("content-length") || 0);
  if (len > UPLOAD_MAX_BYTES + 64 * 1024) return Response.json({ ok: false, error: "File troppo grande (massimo 10 MB)." }, { status: 413 });
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Richiesta non valida." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return Response.json({ ok: false, error: "Nessun file." }, { status: 400 });
  if (file.size > UPLOAD_MAX_BYTES) return Response.json({ ok: false, error: "File troppo grande (massimo 10 MB)." }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const res = await uploadFormFile(token, { kind, bytes, declaredType: file.type || null });
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: res.status });
  return Response.json(res);
}
