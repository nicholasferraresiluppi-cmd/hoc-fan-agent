/**
 * POST /api/cron/warehouse-backup — copia di sicurezza giornaliera del warehouse
 * HOC nel progetto di Nicholas (vedi src/lib/warehouse-backup.js).
 * Lanciata dal dispatcher ogni notte; i job BigQuery girano in asincrono e
 * l'esito si legge al giro successivo (heartbeat + KV warehouse:backup:state).
 * Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron (CSRF).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { runWarehouseBackup } from "@/lib/warehouse-backup";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  let summary;
  try {
    if (!bigQueryConfigured()) {
      result = { skip: "no-bq" };
      summary = "skip:no-bq";
    } else {
      result = await runWarehouseBackup();
      const prev = result.previous;
      const problems = (prev?.errors?.length || 0) + result.skipped.length + result.submitErrors.length;
      summary = `${problems ? "err" : "ok"}: lanciati ${result.submitted}` +
        (prev ? `, giro prima ${prev.ok} ok / ${prev.errors.length} errori / ${prev.running} in corso` : "") +
        (result.skipped.length ? `, saltate ${result.skipped.length} (calo righe)` : "");
    }
  } catch (e) {
    result = { error: e?.message || "unknown" };
    summary = "err:" + result.error;
  }
  await kv
    .set(
      "cron:heartbeat:warehouse-backup",
      { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(summary.startsWith("err") ? { error: true } : {}) },
      { ex: 40 * 24 * 3600 }
    )
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
