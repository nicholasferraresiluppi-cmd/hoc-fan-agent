/**
 * GET /api/admin/wage-audit?last_n=12
 *
 * Per ogni mese degli ultimi N: confronta il conteggio wages in KV
 * (cp:wages:{period}) con il conteggio LIVE da CP API. Restituisce delta
 * + lista di mesi con gap (cioè wages perse nel sync iniziale).
 *
 * Strategia: fetchWages con limit=1 → leggi pagination.dataCount.
 * Veloce (~1s per mese), no payload pesante.
 *
 * Capability: SEED (admin-only).
 *
 * POST { period_id, action: "recover_missing" }
 *   → ri-fetcha TUTTE le pagine del mese (con retry) e fa upsert dedup
 *     in cp:wages:{period}. Operazione "completa": può recuperare anche
 *     wage che il sync iniziale ha proprio saltato.
 *
 * NB: il POST recupera SOLO gli stubs + ricostruzione minima. Per i
 * wage detail completi serve poi rilanciare il sync normale o usare
 * wage-recheck per i singoli employee mancanti. Questo è il primo passo:
 * sapere QUANTI mancano per ogni mese.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { fetchWages, fetchAllWageStubs, fetchWageDetailBatch } from "@/lib/creatorspro-api";
import { logAuditAction } from "@/lib/audit-log";

export const maxDuration = 60;

function monthBoundsIso(periodId) {
  const [y, m] = periodId.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

function lastMonthIds(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const lastN = Math.max(1, Math.min(24, parseInt(url.searchParams.get("last_n") || "12", 10)));
  const periodIds = lastMonthIds(lastN);

  // KV counts — letture difensive (allSettled: un kv.get lento/KO non fa
  // crashare l'intero endpoint con risposta non-JSON)
  const kvSettled = await Promise.allSettled(periodIds.map((pid) => kv.get(`cp:wages:${pid}`)));
  const kvWages = kvSettled.map((r) => (r.status === "fulfilled" ? r.value : null));

  // CP API live counts (1 call per period, parallele, timeout CORTO 8s: una
  // chiamata CP lenta non deve trascinare l'endpoint verso il limite 60s)
  const liveCounts = await Promise.all(periodIds.map(async (pid) => {
    try {
      const { startedAt, endedAt } = monthBoundsIso(pid);
      const r = await fetchWages({ startedAt, endedAt, page: 1, limit: 1, timeoutMs: 8000 });
      const dataCount = r?.pagination?.dataCount ?? null;
      return { ok: true, dataCount };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }));

  const months = periodIds.map((pid, i) => {
    const kvList = Array.isArray(kvWages[i]) ? kvWages[i] : [];
    const kvCount = kvList.length;
    const live = liveCounts[i];
    const liveCount = live.ok ? live.dataCount : null;
    const gap = (liveCount != null && kvCount != null) ? Math.max(0, liveCount - kvCount) : null;
    return {
      period_id: pid,
      kv_count: kvCount,
      live_count: liveCount,
      live_error: live.ok ? null : live.error,
      gap,
      status: liveCount == null ? "live_failed"
        : kvCount === 0 ? "not_synced"
        : gap === 0 ? "ok"
        : "missing",
    };
  });

  const total_missing = months.reduce((s, m) => s + (m.gap || 0), 0);
  const months_with_gap = months.filter((m) => m.status === "missing").length;

  return Response.json({
    months,
    total_missing,
    months_with_gap,
    looked_back: lastN,
  });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid JSON" }, { status: 400 }); }
  const { period_id, action } = body || {};

  // BULK: recover_all_gaps → loop su tutti i mesi con gap (last_n max 24)
  if (action === "recover_all_gaps") {
    const lastN = Math.max(1, Math.min(24, Number(body?.last_n) || 12));
    const periodIds = lastMonthIds(lastN);
    const kvWages = await Promise.all(periodIds.map((pid) => kv.get(`cp:wages:${pid}`)));
    const liveCounts = await Promise.all(periodIds.map(async (pid) => {
      try {
        const { startedAt, endedAt } = monthBoundsIso(pid);
        const r = await fetchWages({ startedAt, endedAt, page: 1, limit: 1 });
        return r?.pagination?.dataCount ?? null;
      } catch { return null; }
    }));
    const targets = periodIds
      .map((pid, i) => ({ pid, kv: (Array.isArray(kvWages[i]) ? kvWages[i].length : 0), live: liveCounts[i] }))
      .filter((x) => x.live != null && x.kv > 0 && x.live > x.kv);

    if (targets.length === 0) {
      return Response.json({ ok: true, message: "Nessun mese con gap da recuperare.", processed: 0 });
    }
    // Processa SEQUENZIALMENTE per non saturare CP API rate limit
    const results = [];
    for (const t of targets) {
      try {
        const r = await recoverSingleMonth(t.pid, az.userId);
        results.push({ period_id: t.pid, ...r });
      } catch (e) {
        results.push({ period_id: t.pid, ok: false, error: String(e?.message || e) });
      }
    }
    const totalRecovered = results.reduce((s, r) => s + (r.recovered || 0), 0);
    return Response.json({
      ok: true,
      message: `Processati ${results.length} mesi, recuperate ${totalRecovered} wage totali.`,
      processed: results.length,
      total_recovered: totalRecovered,
      results,
    });
  }

  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) return Response.json({ error: "period_id YYYY-MM required" }, { status: 400 });
  if (action !== "recover_missing") return Response.json({ error: "action must be 'recover_missing' or 'recover_all_gaps'" }, { status: 400 });

  const result = await recoverSingleMonth(period_id, az.userId);
  return Response.json({ ok: true, period_id, ...result });
}

// Helper riutilizzabile per recovery di un singolo mese
async function recoverSingleMonth(period_id, actorUserId) {
  const { startedAt, endedAt } = monthBoundsIso(period_id);
  const { stubs, totalCount, pageCount, failedPages } = await fetchAllWageStubs({ startedAt, endedAt });

  const existing = (await kv.get(`cp:wages:${period_id}`)) || [];
  const existingIds = new Set(existing.map((w) => w.id).filter(Boolean));

  const missingIds = stubs.filter((s) => s.id && !existingIds.has(s.id)).map((s) => s.id);
  if (missingIds.length === 0) {
    return {
      message: "Nessuna wage mancante. KV allineato con CP live.",
      stubs_total: stubs.length,
      kv_total: existing.length,
      failed_pages: failedPages.length,
      recovered: 0,
    };
  }

  const details = await fetchWageDetailBatch(missingIds);
  const goodDetails = details.filter((d) => d && !d._failed && d.id);

  const { normalizeWage } = await import("@/lib/creatorspro-sync");
  const normalized = [];
  for (const d of goodDetails) {
    try {
      const n = normalizeWage(d);
      if (n) normalized.push(n);
    } catch {}
  }
  const merged = [...existing, ...normalized];
  await kv.set(`cp:wages:${period_id}`, merged);

  await logAuditAction({
    actor: actorUserId,
    action: "wage-audit.recover_missing",
    target: period_id,
    meta: {
      stubs_total: stubs.length,
      kv_before: existing.length,
      missing_ids: missingIds.length,
      recovered: normalized.length,
      failed_pages: failedPages.length,
    },
  }).catch(() => {});

  return {
    stubs_total: stubs.length,
    kv_before: existing.length,
    kv_after: merged.length,
    missing_ids: missingIds.length,
    recovered: normalized.length,
    failed_details: missingIds.length - normalized.length,
    failed_pages: failedPages.length,
    message: `Recuperate ${normalized.length}/${missingIds.length} wage mancanti.`,
  };
}
