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
import { probeGet } from "@/lib/creatorspro-api";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const now = new Date();
  const from = new Date(now.getTime() - 3 * 3600 * 1000);
  const range = { startedAt: from.toISOString(), endedAt: now.toISOString() };
  const rangeAlt = { startDate: from.toISOString(), endDate: now.toISOString() };

  const candidates = [
    { path: "/v1/timeline", query: range },
    { path: "/v1/timeline", query: rangeAlt },
    { path: "/v1/timeline/transactions", query: range },
    { path: "/v1/timeline/events", query: range },
    { path: "/v1/timeline/sales", query: range },
    { path: "/v1/transactions", query: { ...range, page: 1, limit: 5 } },
    { path: "/v1/transactions", query: { ...rangeAlt, page: 1, limit: 5 } },
    { path: "/v1/sales", query: { ...range, page: 1, limit: 5 } },
    { path: "/v1/sellers-wage/transactions", query: range },
    { path: "/v1/sellers-wage/takes", query: range },
    { path: "/v1/creators", query: { page: 1, limit: 3 } },
    { path: "/v1/analytics/transactions", query: rangeAlt },
  ];

  const results = [];
  for (const c of candidates) {
    const r = await probeGet(c.path, { query: c.query });
    results.push({
      path: c.path,
      query_style: Object.keys(c.query).slice(0, 2).join(","),
      status: r?.status ?? null,
      ok: r?.ok ?? false,
      sample: typeof r?.sample === "string" ? r.sample.slice(0, 600) : r?.sample ?? null,
    });
  }

  return Response.json({
    now: now.toISOString(),
    range,
    results,
    hint: "Cerco endpoint con transazioni recenti + timestamp: un 200 con dati freschi = candidato feed live per il cockpit.",
  });
}
