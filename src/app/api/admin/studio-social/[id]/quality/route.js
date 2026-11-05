// Studio social — agente qualità del video (permesso social.manage).
//
// POST { action:"frames", itemId, runId, frames:[{t, dataUrl}] }  fotogrammi a pacchetti (< ~4 MB l'uno)
// POST { action:"run", itemId, runId, tech }                      l'AI legge a gruppi, il codice scrive gli
//      esiti sul contenuto (mai l'ok finale della Qualità: quello è di una persona). ~30-60 centesimi a
//      reel (più per video lunghi con parti AI), tetto mensile STUDIO_QC_CAP_USD.
// GET  ?item=<itemId>&i=<n>                      un fotogramma dell'ultimo controllo (la tavola)
// GET  (senza item)                              spesa del mese
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";
import { addFrames, runQualityCheck, readQcFrame, qcSpend } from "@/lib/studio-quality";

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return new Response(null, { status: az.status });
  const { id } = await params;
  const u = new URL(request.url);
  const item = u.searchParams.get("item");
  if (!item) return Response.json(await qcSpend(), { headers: { "Cache-Control": "no-store" } });
  const f = await readQcFrame(id, item, u.searchParams.get("i"));
  if (!f) return new Response(null, { status: 404 });
  return new Response(f.stream, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}

export async function POST(request, { params }) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta troppo grande o non valida" }, { status: 400 }); }
  const itemId = String(body?.itemId || "");
  try {
    if (body?.action === "frames") {
      const res = await addFrames(id, itemId, String(body.runId || ""), body.frames, az.userId);
      return Response.json(res.ok ? res : { error: res.error }, { status: res.ok ? 200 : res.status || 400 });
    }
    if (body?.action !== "run") return Response.json({ error: "Azione sconosciuta" }, { status: 400 });
    const rl = await checkRateLimit("studio_qc", az.userId);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const res = await runQualityCheck(id, itemId, { runId: String(body.runId || ""), tech: body?.tech || {} }, az.userId);
    if (!res.ok) return Response.json({ error: res.error }, { status: res.status || 400 });
    await logAuditAction({ action: "studio.item.qc", target: `${id}/${itemId}`, by: az.userId, meta: { cost: res.item.aiReview?.cost_usd, frames: res.item.aiReview?.frames?.length, errors: res.errors } }).catch(() => {});
    return Response.json({ ok: true, item: res.item, errors: res.errors }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Controllo non riuscito" }, { status: e.status || 500 });
  }
}
