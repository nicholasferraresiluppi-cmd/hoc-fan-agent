/**
 * POST /api/cron/ofapi-pilot — pilota OnlyFansAPI (vedi src/lib/ofapi-pilot.js):
 * stato degli account collegati + confronto delle transazioni del giorno prima
 * con il warehouse. Lanciata dal dispatcher ogni notte; `?day=YYYY-MM-DD` per
 * rifare un giorno a mano (solo sessione SEED o cron).
 * GET (sessione SEED): ultimi esiti da KV, senza chiamare OnlyFansAPI.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { isCronAuthorized } from "@/lib/cron-auth";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { ofapiConfigured } from "@/lib/ofapi-client";
import { runOfapiPilot } from "@/lib/ofapi-pilot";
import { chainDepth, continueChain } from "@/lib/cron-chain";

const KV_CURSOR = "ofapi:pilot:cursor";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  const sp = new URL(request.url).searchParams;
  const day = sp.get("day");
  // budget della tappa (ms), solo per prove manuali: tra 10 s e 200 s
  const budgetMs = Math.min(200000, Math.max(10000, Number(sp.get("budgetMs")) || 200000));
  let result;
  let summary;
  try {
    if (!ofapiConfigured() || !bigQueryConfigured()) {
      result = { skip: "non configurato" };
      summary = "skip:non-configurato";
    } else {
      // tappa successiva di una catena: giorno e account da cui ripartire stanno in KV
      const chain = chainDepth(request);
      const cursor = chain > 0 ? await kv.get(KV_CURSOR) : null;
      const opts = cursor ? { day: cursor.day, start: cursor.start } : /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? { day } : {};
      result = await runOfapiPilot({ ...opts, budgetMs });
      if (result.nextStart !== null) {
        await kv.set(KV_CURSOR, { day: result.day, start: result.nextStart }, { ex: 3600 });
        result.chain = await continueChain(request, chain);
      } else {
        await kv.del(KV_CURSOR).catch(() => {});
      }
      const bad = result.results.filter((r) => r.verdict !== "ok" || r.storeError);
      summary = `${bad.length ? "err" : "ok"}: ${result.day} · ` +
        result.results.map((r) => `${r.username} ${r.verdict}${r.comparison ? ` ${r.comparison.matched}/${Math.max(r.comparison.api.n, r.comparison.wh.n)}` : ""}${r.storeError ? " archivio-ko" : ""}`).join(", ") +
        ` · ${result.credits} crediti`;
    }
  } catch (e) {
    result = { error: e?.message || "unknown" };
    summary = "err:" + result.error;
  }
  await kv
    .set(
      "cron:heartbeat:ofapi-pilot",
      { at: Date.now(), via: viaCron ? "cron" : "session", result: summary.slice(0, 200), ...(summary.startsWith("err") ? { error: true } : {}) },
      { ex: 40 * 24 * 3600 }
    )
    .catch(() => {});
  return Response.json(result, { status: result.error ? 500 : 200 });
}

export async function GET(request) {
  if (isCronAuthorized(request)) return POST(request);
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ history: (await kv.get("ofapi:pilot:history")) || [] });
}
