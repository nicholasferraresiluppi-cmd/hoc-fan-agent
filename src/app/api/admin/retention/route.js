/**
 * GET /api/admin/retention[?refresh=1] — retention delle creator dello split (lib/retention-split).
 * Denaro e fan di tutte le creator → authorizeAll(SCORES_VIEW), come P&L e payout tree.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { getRetention } from "@/lib/retention-split";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    return Response.json(await getRetention({ force }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: 500 });
  }
}
