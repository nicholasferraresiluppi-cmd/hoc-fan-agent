/**
 * GET /api/admin/andamento-orario/ora?from=YYYY-MM-DD&to=YYYY-MM-DD&creators=1,2&h=19&refresh=1
 *
 * Dentro un'ora: da cosa è fatto l'incasso dell'ora h (ora italiana) nei giorni del periodo — voci, fan più
 * grandi con i prezzi in sequenza, clienti vecchi o nuovi (lib/andamento-ora-core). Stesso accesso della
 * pagina Andamento per ora: ANALYTICS_VIEW con creator-scope, solo le creator visibili all'utente.
 */
import { CAPABILITIES } from "@/lib/rbac";
import { authorizeScoped } from "@/lib/creator-scope";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { visibleCreators } from "@/lib/analisi-vendite";
import { getInsideHour } from "@/lib/andamento-orario";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeScoped(CAPABILITIES.ANALYTICS_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });

  const sp = new URL(request.url).searchParams;
  try {
    const creators = await visibleCreators(az.creatorScope);
    const visible = new Set(creators.map((c) => c.id));
    if (!visible.size) return Response.json({ error: "Non hai creator assegnate" }, { status: 403 });
    const asked = (sp.get("creators") || "").split(",").map(Number).filter(Boolean);
    const ids = asked.length ? asked.filter((id) => visible.has(id)) : [...visible];
    if (!ids.length) return Response.json({ error: "Nessuna delle creator scelte è visibile per te" }, { status: 403 });
    const data = await getInsideHour(ids, { from: sp.get("from"), to: sp.get("to") }, sp.get("h"), { force: sp.get("refresh") === "1" });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo fallito" }, { status: /Ora non valida/.test(e.message) ? 400 : 500 });
  }
}
