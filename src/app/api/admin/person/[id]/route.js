/**
 * GET /api/admin/person/[id] — scheda persona 360 (timeline lifecycle).
 *
 * `id` = employeeId Infloww (personId, ADR §4). Ritorna lo stato corrente
 * (proiezione), la timeline completa degli eventi e il nome per il link alla
 * scheda performance esistente (`/leaderboard/operational/[name]`).
 * Admin-only (SEED): la timeline contiene eventi HR sensibili.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { readPersonEvents, getPersonState } from "@/lib/person-store";
import { deriveState } from "@/lib/person-events";

export const maxDuration = 30;

export async function GET(request, { params }) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const id = String(params?.id || "").trim();
  if (!id) return Response.json({ error: "id richiesto" }, { status: 400 });

  const [events, cache] = await Promise.all([readPersonEvents(id), kv.get("infloww:roster:cache")]);
  const roster = cache && Array.isArray(cache.employees) ? cache.employees : [];
  const rosterEntry = roster.find((e) => String(e.employeeId) === id);
  const name = rosterEntry?.employeeName || id;

  // Stato dalla proiezione fresca (coerente con gli eventi, non dalla cache).
  const state = events.length ? deriveState(events) : await getPersonState(id);

  return Response.json({
    person_id: id,
    name,
    in_roster: !!rosterEntry,
    state: { ...state, person_id: id },
    events: [...events].sort((a, b) => Number(b.at) - Number(a.at)), // più recenti prima
  });
}
