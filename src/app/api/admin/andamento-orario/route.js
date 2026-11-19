/**
 * GET /api/admin/andamento-orario?from=YYYY-MM-DD&to=YYYY-MM-DD&creators=1,2,3&refresh=1
 *
 * Andamento per ora del giorno (ora italiana) di tutte le pagine visibili o di una scelta (lib/andamento-orario).
 * Accesso come Analisi vendite: capability ANALYTICS_VIEW con visibilità di squadra o totale; si vedono SOLO
 * le creator degli split assegnate all'utente (creator-scope). Dati denaro: mai senza filtro creator.
 */
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped, scopeSummary } from "@/lib/creator-scope";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { visibleCreators } from "@/lib/analisi-vendite";
import { getAndamento, personsOf, MAX_DAYS } from "@/lib/andamento-orario";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });

  const sp = new URL(request.url).searchParams;
  try {
    const creators = await visibleCreators(az.creatorScope);
    const scope = scopeSummary(az.creatorScope);
    const persons = personsOf(creators);
    if (!creators.length) {
      return Response.json({ persons: [], scope, empty: true, message: "Non hai creator assegnate: chiedi a un admin di assegnartele in Membri." });
    }
    const visible = new Set(creators.map((c) => c.id));
    const asked = (sp.get("creators") || "").split(",").map(Number).filter(Boolean);
    const ids = asked.length ? asked.filter((id) => visible.has(id)) : [...visible];
    if (!ids.length) return Response.json({ error: "Nessuna delle creator scelte è visibile per te", persons, scope }, { status: 403 });

    const data = await getAndamento(ids, { from: sp.get("from"), to: sp.get("to") }, { force: sp.get("refresh") === "1" });
    return Response.json({ ...data, persons, selected: ids, all: ids.length === visible.size, scope, max_days: MAX_DAYS });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}
