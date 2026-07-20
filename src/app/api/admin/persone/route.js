/**
 * GET /api/admin/persone — indice del "CRM persone".
 *
 * Ritorna il roster operatori (per aprire la scheda di chiunque) + le persone
 * che hanno già una timeline nell'event-store. Admin-only (SEED): la scheda
 * espone eventi HR sensibili (dispute, azioni HR, coaching).
 * Finché il backfill non è stato lanciato / le fonti sono popolate,
 * `store_people` è vuoto ma il roster resta navigabile.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listPersonIds, getPersonState } from "@/lib/person-store";

export const maxDuration = 30;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const cache = await kv.get("infloww:roster:cache");
  const roster = (cache && Array.isArray(cache.employees) ? cache.employees : [])
    .filter((e) => e && e.employeeId != null)
    .map((e) => ({ id: String(e.employeeId), name: e.employeeName || String(e.employeeId) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ids = await listPersonIds();
  const states = ids.length ? await Promise.all(ids.map((id) => getPersonState(id))) : [];
  const store_people = states
    .map((s, i) => ({
      id: ids[i],
      level: s?.level || null,
      status: s?.status || "unknown",
      event_count: s?.event_count || 0,
      last_event_at: s?.last_event_at || null,
    }))
    .filter((p) => p.event_count > 0)
    .sort((a, b) => (b.last_event_at || 0) - (a.last_event_at || 0));

  return Response.json({
    roster,
    roster_count: roster.length,
    store_people,
    store_count: store_people.length,
  });
}
