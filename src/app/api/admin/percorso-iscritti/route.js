/**
 * GET /api/admin/percorso-iscritti[?refresh=1] — percorso dei nuovi iscritti delle pagine dello split
 * (lib/percorso-iscritti). Denaro e fan di tutte le pagine → authorizeAll(SCORES_VIEW), come la retention.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { getJourney } from "@/lib/percorso-iscritti";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    return Response.json(await getJourney({ force }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}
