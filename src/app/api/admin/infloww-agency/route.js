/**
 * GET /api/admin/infloww-agency?days=N   (default 7, max 31)
 *
 * Vista PORTFOLIO: il ledger esteso a tutte le creator connesse, live.
 * Fan-out concorrente a lotti (rispetta 20 QPS/key) con cap di pagine per
 * creator e guardia di tempo (< 60s Vercel). Per ogni creator aggrega il
 * netto del periodo; poi somma a livello agenzia (totali, mix per tipo, trend)
 * e restituisce le creator ordinate per netto.
 *
 * NB: finestra breve di default (7gg) per non troncare le creator ad alto
 * volume. Su 30gg le "big" possono troncare (flag `truncated`): per il totale
 * esatto di una singola creator usa la pagina Revenue live per-creator.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { inflowwPaged, centsToUsd } from "@/lib/infloww-api";
import { readAgency } from "@/lib/infloww-sync-job";

export const maxDuration = 60;
const r2 = (x) => Math.round(x * 100) / 100;
const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const romeDay = (ms) => { const n = Number(ms); return Number.isFinite(n) ? romeDayFmt.format(new Date(n)) : "?"; };

async function creatorAgg(creator, startTime, endTime) {
  const { items, truncated } = await inflowwPaged("/v1/transactions", {
    query: { creatorId: creator.id, startTime, endTime, platformCode: "OnlyFans" },
    limit: 100, maxPages: 6, timeoutMs: 12000,
  });
  let net = 0, gross = 0, fee = 0;
  const byType = {}, byDay = {};
  for (const t of items) {
    const n = centsToUsd(t.net);
    net += n; gross += centsToUsd(t.amount); fee += centsToUsd(t.fee);
    const ty = t.type || "?";
    byType[ty] = (byType[ty] || 0) + n;
    const d = romeDay(t.createdTime);
    byDay[d] = (byDay[d] || 0) + n;
  }
  let topType = null, topN = -1;
  for (const [k, v] of Object.entries(byType)) if (v > topN) { topN = v; topType = k; }
  return { id: creator.id, name: creator.name, userName: creator.userName, net: r2(net), gross: r2(gross), fee: r2(fee), tx: items.length, truncated, topType, byType, byDay };
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!process.env.INFLOWW_API_KEY || !process.env.INFLOWW_OID) {
    return Response.json({ error: "Env Infloww mancanti (INFLOWW_API_KEY / INFLOWW_OID)." }, { status: 428 });
  }

  const url = new URL(request.url);
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const source = url.searchParams.get("source") || "kv";

  // Default: aggregati KV (esatto, istantaneo). Se mai sincronizzato → needs_sync.
  if (source === "kv") {
    const kvRes = await readAgency(days);
    return Response.json(kvRes);
  }

  // source=live: read-through on-demand (tronca le big creator, ma è "adesso")
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - days * 86400000).toISOString();

  const { items: creators } = await inflowwPaged("/v1/creators", { query: { platformCode: "OnlyFans" }, limit: 100, maxPages: 5 });

  const start = Date.now();
  const CONC = 8;
  const rows = [];
  let skipped = 0;
  for (let i = 0; i < creators.length; i += CONC) {
    if (Date.now() - start > 45000) { skipped = creators.length - i; break; }
    const batch = creators.slice(i, i + CONC);
    const res = await Promise.all(batch.map((c) =>
      creatorAgg(c, startTime, endTime).catch(() => ({
        id: c.id, name: c.name, userName: c.userName, net: 0, gross: 0, fee: 0, tx: 0, truncated: false, topType: null, byType: {}, byDay: {}, error: true,
      }))
    ));
    rows.push(...res);
  }

  let net = 0, gross = 0, fee = 0, tx = 0;
  const byType = {}, byDay = {};
  for (const r of rows) {
    net += r.net; gross += r.gross; fee += r.fee; tx += r.tx;
    for (const [k, v] of Object.entries(r.byType)) byType[k] = (byType[k] || 0) + v;
    for (const [d, v] of Object.entries(r.byDay)) byDay[d] = (byDay[d] || 0) + v;
  }
  for (const k of Object.keys(byType)) byType[k] = r2(byType[k]);
  const trend = Object.entries(byDay).map(([date, v]) => ({ date, net_usd: r2(v) })).sort((a, b) => a.date.localeCompare(b.date));
  const creatorRows = rows
    .map(({ byType, byDay, ...rest }) => rest)
    .sort((a, b) => b.net - a.net);

  return Response.json({
    source: "live",
    exact: false,
    window_days: days,
    loaded: rows.length,
    total_creators: creators.length,
    skipped,
    totals: { net_usd: r2(net), gross_usd: r2(gross), fee_usd: r2(fee), tx_count: tx },
    by_type: byType,
    trend,
    creators: creatorRows,
    truncated_any: rows.some((r) => r.truncated),
  });
}
