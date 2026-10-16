/**
 * GET /api/admin/retention/fans?creator=ID[&refresh=1] — fan di valore in pausa di UNA pagina
 * dello split, NOMINATI, da far riprendere ai chatter (lib/retention-split getPausedFans).
 * Dati fan identificati → authorizeAll(SCORES_VIEW) + ogni apertura nel registro azioni.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { logAuditAction } from "@/lib/audit-log";
import { getPausedFans } from "@/lib/retention-split";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const creator = Number(url.searchParams.get("creator"));
  if (!Number.isInteger(creator) || creator <= 0) return Response.json({ error: "creator mancante" }, { status: 400 });
  try {
    const data = await getPausedFans(creator, { force: url.searchParams.get("refresh") === "1" });
    await logAuditAction({ action: "retention.fans.view", target: String(creator), by: az.userId, meta: { fans: data.fans.length } }).catch(() => {});
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: /split/.test(e.message || "") ? 404 : 500 });
  }
}
