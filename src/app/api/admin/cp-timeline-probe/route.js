/**
 * GET /api/admin/cp-timeline-probe
 *
 * Discovery endpoint CP per un feed transazioni più fresco del wage
 * (ingestione take = batch, mediana ~18 min — cfr cp-freshness-probe).
 * Ipotesi di Nicholas: la timeline CP si aggiorna ~ogni minuto.
 *
 * Prova una rosa di path candidati via probeGet (mai lancia, ritorna
 * {status, ok, sample}) con range = ultime 3 ore. Stesso pattern usato
 * per scoprire /v1/payment-profiles (lug 2026).
 */
import { probeGet, fetchWages, fetchWageDetail } from "@/lib/creatorspro-api";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 60;

function monthRangeNow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const now = new Date();
  const from = new Date(now.getTime() - 3 * 3600 * 1000);
  const range = { startedAt: from.toISOString(), endedAt: now.toISOString() };
  const rangeAlt = { startDate: from.toISOString(), endDate: now.toISOString() };

  // 1. Recupera un creatorId reale dai take recenti (v1: /v1/timeline/events
  //    risponde 400 "creatorId must be a string" → esiste, serve l'id).
  let creatorId = null, creatorAlias = null;
  const list = await fetchWages({ ...monthRangeNow(), page: 1, limit: 10 });
  for (const stub of list?.data || []) {
    if (creatorId) break;
    try {
      const d = await fetchWageDetail(stub?.info?.id ?? stub?.id);
      for (const s of d?.shifts || []) {
        for (const t of s?.takes || []) {
          const id = t?.transaction?.creator?.id || t?.creator?.id;
          if (id) {
            creatorId = String(id);
            creatorAlias = t?.transaction?.creator?.alias || t?.creator?.alias || null;
            break;
          }
        }
        if (creatorId) break;
      }
    } catch { /* stub illeggibile: prova il prossimo */ }
  }

  if (!creatorId) {
    return Response.json({ now: now.toISOString(), error: "Nessun creatorId trovato nei take recenti." }, { status: 404 });
  }

  // 2. /v1/timeline/events con varianti di parametri data
  const candidates = [
    { path: "/v1/timeline/events", query: { creatorId, ...range } },
    { path: "/v1/timeline/events", query: { creatorId, ...rangeAlt } },
    { path: "/v1/timeline/events", query: { creatorId, from: range.startedAt, to: range.endedAt } },
    { path: "/v1/timeline/events", query: { creatorId } },
  ];

  const results = [];
  for (const c of candidates) {
    const r = await probeGet(c.path, { query: c.query });
    const sample = typeof r?.sample === "string" ? r.sample.slice(0, 1800) : r?.sample ?? null;
    results.push({
      path: c.path,
      query_keys: Object.keys(c.query).join(","),
      status: r?.status ?? null,
      ok: r?.ok ?? false,
      sample,
    });
    if (r?.ok) break; // trovata la forma giusta: basta così
  }

  return Response.json({
    now: now.toISOString(),
    creator_used: { id: creatorId, alias: creatorAlias },
    range,
    results,
    hint: "Se un 200 contiene eventi/transazioni con timestamp vicini a `now`, la timeline è il feed live del cockpit.",
  });
}
