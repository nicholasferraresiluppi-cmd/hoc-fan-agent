/**
 * GET /api/admin/analisi-vendite?view=recap|conversioni|rapporto|meta-mese|transazioni
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD&creators=1,2,3&refresh=1
 *
 * I report Looker dell'altra parte, in HOC Pro (lib/analisi-vendite). Accesso: capability
 * ANALYTICS_VIEW con visibilità di squadra o totale (sales manager, team lead, admin);
 * si vedono SOLO le creator degli split assegnate all'utente (creator-scope).
 * Dati denaro: mai senza filtro creator.
 */
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped, scopeSummary } from "@/lib/creator-scope";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { getAnalisi, visibleCreators } from "@/lib/analisi-vendite";
import { VIEWS } from "@/lib/analisi-vendite-sql";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });

  const sp = new URL(request.url).searchParams;
  const view = sp.get("view") || "recap";
  if (!VIEWS.includes(view)) return Response.json({ error: "Vista sconosciuta" }, { status: 400 });

  try {
    const creators = await visibleCreators(az.creatorScope);
    const scope = scopeSummary(az.creatorScope);
    if (!creators.length) {
      return Response.json({ view, creators: [], scope, empty: true, message: "Non hai creator assegnate: chiedi a un admin di assegnartele in Membri." });
    }
    const asked = (sp.get("creators") || "").split(",").map(Number).filter(Boolean);
    const visibleIds = new Set(creators.map((c) => c.id));
    const ids = asked.length ? asked.filter((id) => visibleIds.has(id)) : [...visibleIds];
    if (!ids.length) return Response.json({ error: "Nessuna delle creator scelte è visibile per te", creators, scope }, { status: 403 });

    const data = await getAnalisi(view, ids, { from: sp.get("from"), to: sp.get("to"), q: sp.get("q") }, { force: sp.get("refresh") === "1" });
    return Response.json({ ...data, creators, selected: ids, scope });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: 500 });
  }
}
