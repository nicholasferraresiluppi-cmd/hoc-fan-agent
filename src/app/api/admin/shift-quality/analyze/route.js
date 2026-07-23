// Qualità turni · POST analisi contenuto — job LLM a tick client-driven.
// Costa API (Anthropic) → gate SEED (admin only), come i sync che consumano risorse.
// body: { creator_id, day, action: "start" | "tick", force? }

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isHocCreator, bigQueryConfigured } from "@/lib/shift-quality";
import { startAnalysisJob, tickAnalysisJob } from "@/lib/shift-quality-llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "ANTHROPIC_API_KEY mancante" }, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body JSON mancante" }, { status: 400 });
  }
  const { creator_id, day, action, force } = body || {};
  if (!creator_id || !/^\d{4}-\d{2}-\d{2}$/.test(day || "")) {
    return Response.json({ error: "creator_id e day (YYYY-MM-DD) obbligatori" }, { status: 400 });
  }
  if (!(await isHocCreator(creator_id))) {
    return Response.json({ error: "Creator fuori dal perimetro HOC" }, { status: 403 });
  }

  try {
    if (action === "start") {
      const job = await startAnalysisJob(creator_id, day, { force: Boolean(force) });
      return Response.json({ status: job.status, done: job.done || 0, total: job.total || 0 });
    }
    if (action === "tick") {
      const st = await tickAnalysisJob(creator_id, day);
      return Response.json(st);
    }
    return Response.json({ error: "action deve essere start|tick" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
