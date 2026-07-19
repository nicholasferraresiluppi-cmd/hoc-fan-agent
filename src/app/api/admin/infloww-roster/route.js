/**
 * GET /api/admin/infloww-roster — roster ufficiale operatori da Infloww.
 *
 * Lista autoritativa dei nomi Infloww + employeeId stabile (MASS-filtrata),
 * per il mapping utente→operatore ancorato all'id invece che al nome.
 * ?refresh=1 forza il refetch dall'API (bypassa la cache 6h).
 * ?email=... suggerisce il match per una email (utile per collegare un utente).
 *
 * Capability: SEED (admin only).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getRoster, rosterMatchForEmail } from "@/lib/infloww-roster";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  const email = searchParams.get("email");

  const roster = await getRoster({ refresh });
  const out = {
    count: roster.employees.length,
    from_cache: roster.from_cache,
    fetched_at: roster.fetched_at || null,
    error: roster.error || null,
    employees: roster.employees.slice(0, 500),
  };
  if (email) {
    out.suggestion = await rosterMatchForEmail(email);
  }
  return Response.json(out);
}
