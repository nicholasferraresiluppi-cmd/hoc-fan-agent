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

  // 1. Colleziona i creator con transazioni più FRESCHE dai take recenti
  //    (v2: /v1/timeline/events risponde 200 con creatorId+startedAt/endedAt,
  //    ma data:[] per un creator senza vendite in finestra → serve creator caldo).
  const creators = new Map(); // id → { alias, latest_tx_ms }
  const list = await fetchWages({ ...monthRangeNow(), page: 1, limit: 12 });
  for (const stub of (list?.data || []).slice(0, 12)) {
    try {
      const d = await fetchWageDetail(stub?.info?.id ?? stub?.id);
      for (const s of d?.shifts || []) {
        for (const t of s?.takes || []) {
          const id = t?.transaction?.creator?.id || t?.creator?.id;
          if (!id) continue;
          const txMs = Date.parse(t?.transaction?.createdAt || t?.createdAt || 0) || 0;
          const cur = creators.get(String(id));
          if (!cur || txMs > cur.latest_tx_ms) {
            creators.set(String(id), {
              alias: t?.transaction?.creator?.alias || t?.creator?.alias || null,
              latest_tx_ms: txMs,
            });
          }
        }
      }
    } catch { /* stub illeggibile: prova il prossimo */ }
  }

  const hot = [...creators.entries()]
    .map(([id, c]) => ({ id, alias: c.alias, latest_tx: new Date(c.latest_tx_ms).toISOString() }))
    .sort((a, b) => (b.latest_tx < a.latest_tx ? -1 : 1))
    .slice(0, 3);

  if (hot.length === 0) {
    return Response.json({ now: now.toISOString(), error: "Nessun creator trovato nei take recenti." }, { status: 404 });
  }

  // 2. Timeline events per i creator caldi, finestra 6h; dump del primo evento
  //    per scoprire schema e timestamp.
  const from6 = new Date(now.getTime() - 6 * 3600 * 1000).toISOString();
  const results = [];
  for (const c of hot) {
    const r = await probeGet("/v1/timeline/events", {
      query: { creatorId: c.id, startedAt: from6, endedAt: now.toISOString() },
    });
    const data = r?.sample?.data;
    const events = Array.isArray(data) ? data : [];
    // timestamp più recente trovato negli eventi (scan superficiale)
    let latestMs = 0;
    for (const ev of events) {
      for (const v of Object.values(ev || {})) {
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
          const ms = Date.parse(v);
          if (ms && ms > latestMs && ms <= now.getTime() + 60_000) latestMs = ms;
        }
      }
    }
    results.push({
      creator: c,
      status: r?.status ?? null,
      events_count: events.length,
      latest_event_ts: latestMs ? new Date(latestMs).toISOString() : null,
      latest_event_age_seconds: latestMs ? Math.round((now.getTime() - latestMs) / 1000) : null,
      first_event_sample: events[0] ?? null,
      last_event_sample: events.length > 1 ? events[events.length - 1] : null,
    });
  }

  return Response.json({
    now: now.toISOString(),
    window_hours: 6,
    hot_creators: hot,
    results,
    hint: "latest_event_age_seconds basso (~minuti) = la timeline è il feed live del cockpit. Confrontare con lag ingestione wage (mediana ~18 min).",
  });
}
