// Studio social — agente qualità del video (permesso social.manage).
//
// POST { itemId, tech, frames:[{t, dataUrl}] }   tecnico misurato dal browser + fotogrammi → l'AI
//      legge, il codice scrive gli esiti sul contenuto (mai l'ok finale della Qualità: quello è di
//      una persona). ~15-20 centesimi a controllo, tetto mensile STUDIO_QC_CAP_USD.
// GET  ?item=<itemId>&i=<n>                      un fotogramma dell'ultimo controllo (la tavola)
// GET  (senza item)                              spesa del mese
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { logAuditAction } from "@/lib/audit-log";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";
import { runQualityCheck, readQcFrame, qcSpend } from "@/lib/studio-quality";

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
  const rl = await checkRateLimit("studio_qc", az.userId);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Richiesta troppo grande o non valida" }, { status: 400 }); }
  try {
    const res = await runQualityCheck(id, String(body?.itemId || ""), { tech: body?.tech || {}, frames: body?.frames }, az.userId);
    if (!res.ok) return Response.json({ error: res.error }, { status: res.status || 400 });
    await logAuditAction({ action: "studio.item.qc", target: `${id}/${body.itemId}`, by: az.userId, meta: { cost: res.item.aiReview?.cost_usd, errors: res.errors } }).catch(() => {});
    return Response.json({ ok: true, item: res.item, errors: res.errors }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Controllo non riuscito" }, { status: e.status || 500 });
  }
}
