/**
 * Infloww Sync Job — driver endpoint.
 *
 * GET                         → { job, progress }         (stato corrente)
 * POST { action:"start", days } → avvia il job (roster + reset cursore)
 * POST { action:"step" }        → esegue un chunk (<60s) e avanza  → { has_more, progress }
 *
 * Il client (pagina Revenue agency) chiama start poi step in loop finché
 * has_more è false. Lo stato vive in KV: sopravvive al reload della pagina.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getJob, startJob, stepJob, jobProgress } from "@/lib/infloww-sync-job";

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
  if (!process.env.INFLOWW_API_KEY || !process.env.INFLOWW_OID) {
    return Response.json({ error: "Env Infloww mancanti (INFLOWW_API_KEY / INFLOWW_OID)." }, { status: 428 });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const action = body?.action;

  if (action === "start") {
    const job = await startJob(body?.days);
    return Response.json({ ok: true, has_more: true, progress: jobProgress(job) });
  }
  if (action === "step") {
    const { has_more, job, error, retry } = await stepJob();
    return Response.json({ ok: true, has_more, retry: retry || false, error: error || null, progress: jobProgress(job) });
  }
  return Response.json({ error: "action non valida (start|step)" }, { status: 400 });
}
