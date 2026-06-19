/**
 * /api/admin/cp-sync-job — worker del sync server-side (Fase 1).
 *
 * GET                      → stato job corrente (per resume/polling)
 * POST { action: "start", months: [...] }  → avvia job
 * POST { action: "step" }  → esegue UN chunk e avanza (≤60s)
 * POST { action: "cancel" }→ ferma il job
 *
 * Il driver (client wage-audit ora, QStash in Fase 2) chiama "step" in loop
 * finché has_more=false. Lo stato vive in KV → al reload la pagina riprende.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { startJob, stepJob, getJob, cancelJob, jobProgress } from "@/lib/cp-sync-job";

export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const job = await getJob();
  return Response.json({ job, progress: jobProgress(job) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = body?.action;

  try {
    if (action === "start") {
      const job = await startJob(body.months || []);
      return Response.json({ ok: true, has_more: true, progress: jobProgress(job) });
    }
    if (action === "step") {
      const r = await stepJob();
      return Response.json({ ok: true, has_more: r.has_more, retry: r.retry || false, error: r.error || null, progress: jobProgress(r.job) });
    }
    if (action === "cancel") {
      await cancelJob();
      return Response.json({ ok: true });
    }
    return Response.json({ error: "action: start|step|cancel" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
