/**
 * POST /api/cron/squadra — ricalcolo notturno della scheda Squadra di Coaching
 * vendite (src/lib/squadra.js): KPI Infloww + calendario CP → classifica in KV.
 * Subito dopo, nella stessa funzione, la scheda Fasce (src/lib/fasce.js): legge le
 * stesse wage, già in memoria → niente banda KV in più. Poi «Due operatori» (src/lib/fasce-duo.js):
 * una query BigQuery, solo se il dato ha più di 20 ore.
 * Lanciato ogni notte dal dispatcher. Auth: Bearer CRON_SECRET o sessione SEED; GET solo cron.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { computeSquadraOnce } from "@/lib/squadra";
import { computeFasceOnce } from "@/lib/fasce";
import { warmFasceDuo } from "@/lib/fasce-duo";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  let result;
  try {
    const doc = await computeSquadraOnce();
    result = doc ? { ok: true, counts: doc.counts } : { skipped: "già in corso" };
  } catch (e) {
    result = { error: e?.message || "unknown" };
  }
  try {
    const f = await computeFasceOnce();
    result.fasce = f ? f.counts : "già in corso";
  } catch (e) {
    result.fasce = { error: e?.message || "unknown" };
  }
  try {
    result.duo = await warmFasceDuo();
  } catch (e) {
    result.duo = { error: e?.message || "unknown" };
  }
  await kv
    .set("cron:heartbeat:squadra", { at: Date.now(), via: viaCron ? "cron" : "session", result: JSON.stringify(result).slice(0, 200), ...(result.error ? { error: true } : {}) }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return POST(request);
}
