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

  // 3. Turni recenti (in corso o ultime 48h), ordinati per started_at desc
  const cutoff = now - 48 * 3600 * 1000;
  const recentShifts = [];
  const allTimestampPaths = new Map(); // path → max ms
  let latestTake = null;

  for (const d of details) {
    if (!d || d._failed) continue;
    const member = d?.info?.memberName || d?.info?.memberUsername || d?.info?.memberId;
    for (const s of d.shifts || []) {
      const startMs = Date.parse(s.startedAt || 0) || 0;
      const endMs = s.endedAt ? Date.parse(s.endedAt) : null;
      const inProgress = !endMs || endMs > now;
      if (!inProgress && startMs < cutoff) continue;

      const rawTakes = Array.isArray(s.takes) ? s.takes : [];
      const lastTakesRaw = rawTakes.slice(-TAKES_PER_SHIFT);
      for (const t of rawTakes) {
        for (const ts of collectTimestamps(t)) {
          const prev = allTimestampPaths.get(ts.path) || 0;
          if (ts.ms > prev) allTimestampPaths.set(ts.path, ts.ms);
          if (ts.ms <= now + 60_000 && (!latestTake || ts.ms > latestTake.ms)) {
            latestTake = { ...ts, member, shift_started_at: s.startedAt };
          }
        }
      }

      recentShifts.push({
        member,
        shift_id: s.id,
        started_at: s.startedAt,
        ended_at: s.endedAt || null,
        in_progress: inProgress,
        worked_hours: s.workedHours ?? null,
        total_attributed: s.totalAttributed ?? null,
        takes_count: rawTakes.length,
        payment_profile: s.paymentProfile?.name ?? null,
        last_takes_raw: lastTakesRaw,
      });
    }
  }
  recentShifts.sort((a, b) => (Date.parse(b.started_at) || 0) - (Date.parse(a.started_at) || 0));

  return Response.json({
    now: new Date(now).toISOString(),
    range,
    stubs_on_page: stubs.length,
    wages_inspected: toInspect.length,
    wages_failed: details.filter((d) => d?._failed).length,
    recent_shifts_found: recentShifts.length,
    freshness: {
      latest_take: latestTake
        ? { ...latestTake, lag_seconds: Math.round((now - latestTake.ms) / 1000) }
        : null,
      timestamp_fields_seen: [...allTimestampPaths.entries()]
        .map(([path, ms]) => ({ path, latest: new Date(ms).toISOString() }))
        .sort((a, b) => (a.path < b.path ? -1 : 1)),
      note: "lag_seconds è un TETTO: misura distanza dall'ultimo take trovato, che dipende anche dal ritmo vendite. Rilanciare più volte durante un turno attivo per stimare il ritardo reale.",
    },
    recent_shifts: recentShifts.slice(0, SHIFTS_LIMIT),
  });
}
