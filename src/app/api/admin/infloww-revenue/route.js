/**
 * GET /api/admin/infloww-revenue
 *
 * Ledger revenue fan-by-fan da Infloww API, LIVE (read-through, niente storage).
 *
 *  - senza `creatorId` → { creators: [...] }  (roster per il selettore)
 *  - con `creatorId` (+ `days`, default 30) → aggrega le transazioni del
 *    periodo per una singola creator:
 *      totals   : netto/lordo/fee ($, post-OF 20%), n. transazioni, n. fan
 *      by_type  : Messages / Tips / Subscription / … con quota sul netto
 *      trend    : netto per giorno (fuso Europe/Rome)
 *      top_fans : classifica spendaccioni (whale) + concentrazione top-10
 *      refunds  : chargeback del periodo → netto meno rimborsi
 *
 * NB unità: transactions amount/fee/net = centesimi (centsToUsd);
 * refunds paymentAmount = dollari. Chiave SEMPRE su creatorId (i profili
 * ITA/ENG/ESP di una stessa creator sono creator distinti su Infloww: mai fondere).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { inflowwGet, inflowwPaged, centsToUsd } from "@/lib/infloww-api";

export const maxDuration = 60;

const round2 = (x) => Math.round(x * 100) / 100;

// unix ms (string|number) → "YYYY-MM-DD" nel fuso di Roma
const romeDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
function romeDay(ms) {
  const n = Number(ms);
  return Number.isFinite(n) ? romeDayFmt.format(new Date(n)) : "?";
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  if (!process.env.INFLOWW_API_KEY || !process.env.INFLOWW_OID) {
    return Response.json({ error: "Env Infloww mancanti (INFLOWW_API_KEY / INFLOWW_OID)." }, { status: 428 });
  }

  const url = new URL(request.url);
  const creatorId = url.searchParams.get("creatorId");
  const days = Math.min(120, Math.max(1, Number(url.searchParams.get("days")) || 30));

  // ── Modalità roster ────────────────────────────────────────────────
  if (!creatorId) {
    const { items } = await inflowwPaged("/v1/creators", { query: { platformCode: "OnlyFans" }, limit: 100, maxPages: 5 });
    const creators = items
      .map((c) => ({ id: c.id, name: c.name || c.userName || String(c.id), userName: c.userName || "" }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "it", { sensitivity: "base" }));
    return Response.json({ creators });
  }

  // ── Modalità ledger per-creator ────────────────────────────────────
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - days * 86400000).toISOString();

  let txRes;
  try {
    txRes = await inflowwPaged("/v1/transactions", {
      query: { creatorId, startTime, endTime, platformCode: "OnlyFans" },
      limit: 100, maxPages: 25,
    });
  } catch (e) {
    return Response.json({ error: `Transazioni non recuperabili: ${String(e?.message || e)}` }, { status: 502 });
  }
  const txs = txRes.items;

  let net = 0, gross = 0, fee = 0, loadingCount = 0;
  const byType = {};
  const byDay = {};
  const byFan = new Map();
  for (const t of txs) {
    const n = centsToUsd(t.net), g = centsToUsd(t.amount), f = centsToUsd(t.fee);
    net += n; gross += g; fee += f;
    if (t.status === "loading") loadingCount++;

    const ty = t.type || "?";
    if (!byType[ty]) byType[ty] = { count: 0, net_usd: 0 };
    byType[ty].count++; byType[ty].net_usd += n;

    const day = romeDay(t.createdTime);
    byDay[day] = (byDay[day] || 0) + n;

    const fid = t.fanId || "?";
    const cur = byFan.get(fid) || { fanId: fid, fanName: t.fanName || "—", net_usd: 0, count: 0 };
    cur.net_usd += n; cur.count++;
    if (t.fanName) cur.fanName = t.fanName;
    byFan.set(fid, cur);
  }
  for (const k of Object.keys(byType)) byType[k].net_usd = round2(byType[k].net_usd);

  const topFans = [...byFan.values()]
    .map((f) => ({ ...f, net_usd: round2(f.net_usd) }))
    .sort((a, b) => b.net_usd - a.net_usd)
    .slice(0, 20);
  const top10Net = topFans.slice(0, 10).reduce((s, f) => s + f.net_usd, 0);

  const trend = Object.entries(byDay)
    .map(([date, v]) => ({ date, net_usd: round2(v) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Refunds (paymentAmount già in $) ───────────────────────────────
  let refundCount = 0, refundUsd = 0;
  try {
    const rf = await inflowwGet("/v1/refunds", { query: { creatorId, startTime, endTime, limit: 100 } });
    const list = rf?.data?.list || [];
    refundCount = list.length;
    refundUsd = round2(list.reduce((s, r) => s + (Number(r.paymentAmount) || 0), 0));
  } catch { /* refunds best-effort: se fallisce, mostriamo 0 senza rompere il ledger */ }

  return Response.json({
    creatorId,
    window_days: days,
    totals: {
      net_usd: round2(net),
      gross_usd: round2(gross),
      fee_usd: round2(fee),
      tx_count: txs.length,
      truncated: txRes.truncated,
      loading_count: loadingCount,
      fan_count: byFan.size,
      top10_share_pct: net > 0 ? round2((top10Net / net) * 100) : 0,
    },
    by_type: byType,
    trend,
    top_fans: topFans,
    refunds: {
      count: refundCount,
      total_usd: refundUsd,
      net_after_refund_usd: round2(net - refundUsd),
    },
  });
}
