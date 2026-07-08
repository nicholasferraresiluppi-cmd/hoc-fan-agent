/**
 * GET /api/admin/infloww-msg-probe?creator=<substr>&days=<n>
 *
 * DIAGNOSTICO throwaway per l'anomalia "messaggi inviati ma revenue 0".
 * Per una creator, tira giù automated-messages + priority-mass-messages e
 * confronta due letture del fatturato:
 *   - top-level : totalRevenue / totalNumberOfPurchases
 *   - collections: somma dei message[].revenue / numberOfPurchases dentro le collection
 * Più: istogramma degli status, breakdown per employee, e 2 record grezzi
 * (contenuto messaggio troncato) per capire la struttura reale.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { inflowwGet, inflowwPaged, centsToUsd } from "@/lib/infloww-api";

export const maxDuration = 60;
const r2 = (x) => Math.round(x * 100) / 100;

// Normalizza collections (automated: array) vs collection (priority: object)
function collectionsOf(rec) {
  if (Array.isArray(rec.collections)) return rec.collections;
  if (rec.collection && typeof rec.collection === "object") return [rec.collection];
  return [];
}

function analyze(records) {
  let sent = 0, revTop = 0, purchTop = 0, revColl = 0, purchColl = 0;
  const status = {};
  const byEmp = {};
  for (const rec of records) {
    sent += Number(rec.totalNumberOfTimeSent) || 0;
    revTop += centsToUsd(rec.totalRevenue);
    purchTop += Number(rec.totalNumberOfPurchases) || 0;
    const st = rec.status || "?";
    status[st] = (status[st] || 0) + 1;
    for (const col of collectionsOf(rec)) {
      for (const m of col.message || []) {
        revColl += centsToUsd(m.revenue);
        purchColl += Number(m.numberOfPurchases) || 0;
      }
    }
    const e = rec.employeeId ?? "?";
    if (!byEmp[e]) byEmp[e] = { sent: 0, purch_top: 0, rev_top_usd: 0 };
    byEmp[e].sent += Number(rec.totalNumberOfTimeSent) || 0;
    byEmp[e].purch_top += Number(rec.totalNumberOfPurchases) || 0;
    byEmp[e].rev_top_usd += centsToUsd(rec.totalRevenue);
  }
  for (const e of Object.keys(byEmp)) byEmp[e].rev_top_usd = r2(byEmp[e].rev_top_usd);
  return {
    count: records.length,
    sent_total: sent,
    revenue_toplevel_usd: r2(revTop),
    purchases_toplevel: purchTop,
    revenue_collections_usd: r2(revColl),
    purchases_collections: purchColl,
    status_histogram: status,
    by_employee: byEmp,
  };
}

function sampleRecord(rec) {
  const trim = (s) => (typeof s === "string" ? s.slice(0, 60) : s);
  const cols = collectionsOf(rec).map((c) => ({
    collectionNo: c.collectionNo,
    revenue: c.revenue,
    numberOfTimesSent: c.numberOfTimesSent,
    numberOfPurchases: c.numberOfPurchases,
    messages: (c.message || []).map((m) => ({ messageContent: trim(m.messageContent), price: m.price, numberOfTimesSent: m.numberOfTimesSent, numberOfPurchases: m.numberOfPurchases, revenue: m.revenue })),
  }));
  return {
    id: rec.automatedMessageId ?? rec.priorityMassMessageId,
    employeeId: rec.employeeId,
    status: rec.status,
    totalNumberOfTimeSent: rec.totalNumberOfTimeSent,
    totalNumberOfPurchases: rec.totalNumberOfPurchases,
    totalRevenue: rec.totalRevenue,
    unsentType: rec.unsentType,
    failReason: rec.failReason,
    sentTime: rec.sentTime,
    collections: cols,
  };
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!process.env.INFLOWW_API_KEY || !process.env.INFLOWW_OID) {
    return Response.json({ error: "Env Infloww mancanti." }, { status: 428 });
  }

  const url = new URL(request.url);
  const creatorQ = (url.searchParams.get("creator") || "").trim().toLowerCase();
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days")) || 90));
  const endTime = new Date().toISOString();
  const startTime = new Date(Date.now() - days * 86400000).toISOString();

  const { items: creators } = await inflowwPaged("/v1/creators", { query: { platformCode: "OnlyFans" }, limit: 100, maxPages: 5 });
  let picked = creatorQ
    ? creators.find((c) => [c.name, c.userName, c.nickName, c.tagName].some((f) => String(f || "").toLowerCase().includes(creatorQ)))
    : null;
  if (!picked) picked = creators[0];
  if (!picked) return Response.json({ error: "Nessun creator." }, { status: 404 });
  const creatorId = picked.id;

  const auto = await inflowwPaged("/v1/automated-messages", { query: { creatorId, startTime, endTime, platformCode: "OnlyFans" }, limit: 100, maxPages: 3 });
  const prio = await inflowwPaged("/v1/priority-mass-messages", { query: { creatorId, startTime, endTime, platformCode: "OnlyFans" }, limit: 100, maxPages: 3 });

  return Response.json({
    picked: { creatorId, name: picked.name, userName: picked.userName },
    window_days: days,
    automated_messages: { ...analyze(auto.items), samples: auto.items.slice(0, 2).map(sampleRecord) },
    priority_mass_messages: { ...analyze(prio.items), samples: prio.items.slice(0, 2).map(sampleRecord) },
  });
}
