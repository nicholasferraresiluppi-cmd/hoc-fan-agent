/**
 * GET /api/admin/cp-freshness-probe[?member_id=...]
 *
 * Probe di freschezza dati CP per il Cockpit CM (Fase 2a):
 * quanto è "live" il venduto/take di un turno in corso?
 *
 * Cosa fa (sola lettura, API CP diretta — nessun KV):
 *  1. Lista i wage stub del mese corrente (pagina 1, opz. filtrati per member)
 *  2. Ordina per started_at desc e ispeziona i primi N wage in dettaglio
 *  3. Estrae i turni più recenti (in corso = ended_at nullo/futuro, o ultime 48h)
 *  4. Dei take di quei turni dumpa i campi RAW (per scoprire dove stanno i
 *     timestamp — il parser sync li scarta) e misura il lag: max timestamp
 *     trovato vs adesso.
 *
 * Output pensato per decidere il polling del cockpit (target: ~1 min).
 */
import { fetchWages, fetchWageDetail } from "@/lib/creatorspro-api";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 60;

const DETAIL_LIMIT = 8;
const SHIFTS_LIMIT = 8;
const TAKES_PER_SHIFT = 3;

function monthRangeNow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Cammina un oggetto raw e raccoglie {path, iso} per ogni campo data-like. */
function collectTimestamps(obj, path = "", out = [], depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 4) return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "string" && ISO_RE.test(v)) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) out.push({ path: p, iso: v, ms: t });
    } else if (typeof v === "number" && v > 1_500_000_000_000 && v < 4_000_000_000_000) {
      out.push({ path: p, iso: new Date(v).toISOString(), ms: v });
    } else if (v && typeof v === "object") {
      collectTimestamps(v, p, out, depth + 1);
    }
  }
  return out;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id") || undefined;

  const now = Date.now();
  const range = monthRangeNow();

  // 1. Stub del mese corrente
  const list = await fetchWages({ ...range, page: 1, limit: 25, memberId });
  const stubs = list?.data || [];
  if (stubs.length === 0) {
    return Response.json({ now: new Date(now).toISOString(), range, error: "Nessun wage nel mese corrente." }, { status: 404 });
  }

  // 2. Ordina per periodo più recente e ispeziona i primi N
  const sorted = [...stubs].sort((a, b) => {
    const sa = Date.parse(a?.info?.startedAt || 0) || 0;
    const sb = Date.parse(b?.info?.startedAt || 0) || 0;
    return sb - sa;
  });
  const toInspect = sorted.slice(0, DETAIL_LIMIT);
  const details = await Promise.all(
    toInspect.map(async (s) => {
      try {
        return await fetchWageDetail(s?.info?.id ?? s?.id);
      } catch (e) {
        return { _failed: String(e?.message || e) };
      }
    })
  );

  // 3. Turni ATTIVI ADESSO (started ≤ now < ended) o chiusi nelle ultime 48h.
  //    I turni futuri programmati sono contati a parte (utile per la Vista 1
  //    del cockpit: il calendario esiste già in CP) ma esclusi dall'analisi.
  const cutoff = now - 48 * 3600 * 1000;
  const recentShifts = [];
  const ingestDeltas = []; // take.createdAt − transaction.createdAt (secondi)
  let futureShifts = 0;
  let latestTake = null;

  for (const d of details) {
    if (!d || d._failed) continue;
    const member = d?.info?.memberName || d?.info?.memberUsername || d?.info?.memberId;
    for (const s of d.shifts || []) {
      const startMs = Date.parse(s.startedAt || 0) || 0;
      const endMs = s.endedAt ? Date.parse(s.endedAt) : null;
      if (startMs > now) { futureShifts += 1; continue; }
      const activeNow = startMs <= now && (!endMs || endMs > now);
      if (!activeNow && startMs < cutoff) continue;

      const rawTakes = Array.isArray(s.takes) ? s.takes : [];
      const takesTimed = [];
      for (const t of rawTakes) {
        const takeMs = Date.parse(t?.createdAt || 0) || null;
        const txMs = Date.parse(t?.transaction?.createdAt || 0) || null;
        if (takeMs && txMs && takeMs >= txMs) {
          ingestDeltas.push(Math.round((takeMs - txMs) / 1000));
        }
        if (takeMs) {
          takesTimed.push({
            take_created_at: t.createdAt,
            transaction_created_at: t?.transaction?.createdAt || null,
            amount: t?.transaction?.amount ?? t?.amount ?? null,
            type: t?.transaction?.type ?? t?.type ?? null,
          });
          if (!latestTake || takeMs > (latestTake.ms || 0)) {
            latestTake = { ms: takeMs, iso: t.createdAt, member, shift_started_at: s.startedAt };
          }
        }
      }
      takesTimed.sort((a, b) => (Date.parse(b.take_created_at) || 0) - (Date.parse(a.take_created_at) || 0));

      recentShifts.push({
        member,
        active_now: activeNow,
        started_at: s.startedAt,
        ended_at: s.endedAt || null,
        total_attributed: s.totalAttributed ?? null,
        takes_count: rawTakes.length,
        payment_profile: s.paymentProfile?.name ?? null,
        last_takes: takesTimed.slice(0, TAKES_PER_SHIFT),
      });
    }
  }
  // attivi prima, poi per started_at desc
  recentShifts.sort((a, b) =>
    (b.active_now - a.active_now) || ((Date.parse(b.started_at) || 0) - (Date.parse(a.started_at) || 0))
  );

  const dsorted = [...ingestDeltas].sort((a, b) => a - b);
  const pick = (p) => (dsorted.length ? dsorted[Math.min(dsorted.length - 1, Math.floor((p / 100) * dsorted.length))] : null);

  return Response.json({
    now: new Date(now).toISOString(),
    range,
    stubs_on_page: stubs.length,
    wages_inspected: toInspect.length,
    wages_failed: details.filter((d) => d?._failed).length,
    shifts: {
      analyzed: recentShifts.length,
      active_now: recentShifts.filter((s) => s.active_now).length,
      future_scheduled_seen: futureShifts,
    },
    ingestion_lag: {
      note: "delta = take.createdAt − transaction.createdAt: quanto CP impiega a far comparire l'acquisto nel wage. È il ritardo che vedrebbe il cockpit (+ intervallo di polling).",
      samples: dsorted.length,
      p50_seconds: pick(50),
      p90_seconds: pick(90),
      max_seconds: dsorted.length ? dsorted[dsorted.length - 1] : null,
      min_seconds: dsorted.length ? dsorted[0] : null,
    },
    latest_take: latestTake
      ? { iso: latestTake.iso, member: latestTake.member, age_seconds: Math.round((now - latestTake.ms) / 1000) }
      : null,
    recent_shifts: recentShifts.slice(0, SHIFTS_LIMIT),
  });
}
