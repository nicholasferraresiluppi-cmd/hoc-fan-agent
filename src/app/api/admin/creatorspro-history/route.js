/**
 * GET /api/admin/creatorspro-history?last_n=24
 *
 * Ritorna lo stato di sync (presenza/conteggi wages) per gli ultimi N mesi.
 * Usato dalla pagina /admin/wage-audit per disegnare la lista
 * mesi con badge "synced/never".
 *
 * Capability: SEED (admin-only).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

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
  const lastN = Math.max(1, Math.min(36, parseInt(url.searchParams.get("last_n") || "24", 10)));
  const periodIds = lastMonthIds(lastN);

  const [meta, ...rest] = await Promise.all([
    kv.get("cp:_meta"),
    ...periodIds.map((pid) => kv.get(`cp:wages:${pid}`)),
    ...periodIds.map((pid) => kv.get(`cp:sync:gap:${pid}`)),
  ]);
  const wagesArr = rest.slice(0, periodIds.length);
  const gapArr = rest.slice(periodIds.length);

  const months = periodIds.map((pid, i) => {
    const wages = wagesArr[i];
    const wagesList = Array.isArray(wages) ? wages : [];
    const synced = wagesList.length > 0;
    const shifts = wagesList.reduce((s, w) => s + (w.shifts?.length || 0), 0);
    // Se questo è l'ultimo periodo syncato, usa il timestamp da meta
    const isLastSync = meta?.last_sync_period === pid;
    // Completezza per-mese: gap-check salvato in finalize (cp:sync:gap:{pid}).
    // Tolleranza 5 per il rumore noto dataCount-vs-normalizzato.
    const gap = gapArr[i] || null;
    const cpLive = gap?.cp_live_count ?? null;
    const incomplete = cpLive != null && wagesList.length > 0 && (cpLive - wagesList.length) > 5;
    return {
      period_id: pid,
      synced,
      wages_count: wagesList.length,
      shifts_count: shifts,
      last_sync_at: isLastSync ? meta?.last_sync_at : null,
      is_last_sync: isLastSync,
      cp_live_count: cpLive,
      gap: cpLive != null ? Math.max(0, cpLive - wagesList.length) : null,
      incomplete,
    };
  });

  return Response.json({
    last_n: lastN,
    months,
    global_meta: meta || null,
  });
}
