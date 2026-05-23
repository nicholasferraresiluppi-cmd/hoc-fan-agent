/**
 * GET /api/admin/creatorspro-history?last_n=24
 *
 * Ritorna lo stato di sync (presenza/conteggi wages) per gli ultimi N mesi.
 * Usato dalla pagina /admin/creatorspro-sync-history per disegnare la lista
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

  const [meta, ...wagesArr] = await Promise.all([
    kv.get("cp:_meta"),
    ...periodIds.map((pid) => kv.get(`cp:wages:${pid}`)),
  ]);

  const months = periodIds.map((pid, i) => {
    const wages = wagesArr[i];
    const wagesList = Array.isArray(wages) ? wages : [];
    const synced = wagesList.length > 0;
    const shifts = wagesList.reduce((s, w) => s + (w.shifts?.length || 0), 0);
    // Se questo è l'ultimo periodo syncato, usa il timestamp da meta
    const isLastSync = meta?.last_sync_period === pid;
    return {
      period_id: pid,
      synced,
      wages_count: wagesList.length,
      shifts_count: shifts,
      last_sync_at: isLastSync ? meta?.last_sync_at : null,
      is_last_sync: isLastSync,
    };
  });

  return Response.json({
    last_n: lastN,
    months,
    global_meta: meta || null,
  });
}
