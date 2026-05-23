/**
 * GET /api/leaderboard/creators/[alias]
 *
 * Drill-down per una creator specifica: lista operatori che ci lavorano +
 * fasce orarie + suggestions specifiche per questa creator.
 *
 * Path param: alias = nome creator (es. "Bianca Rossi") — URL-encoded.
 * Query: ?period_id=YYYY-MM (required)
 */
import { auth } from "@clerk/nextjs/server";
import { getCreatorDrilldown } from "@/lib/creator-aggregates";
import { hasCpDataForPeriod } from "@/lib/creatorspro-data";

export async function GET(request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Non autenticato." }, { status: 401 });

  const resolved = typeof params?.then === "function" ? await params : params;
  let alias = "";
  try { alias = decodeURIComponent(resolved.alias || ""); }
  catch { alias = resolved.alias || ""; }

  const url = new URL(request.url);
  const period_id = url.searchParams.get("period_id");
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }
  if (!alias) return Response.json({ error: "creator alias richiesto" }, { status: 400 });

  const cpAvail = await hasCpDataForPeriod(period_id);
  if (!cpAvail) {
    return Response.json({ error: "no CP data", period_id, alias }, { status: 404 });
  }

  const result = await getCreatorDrilldown(alias, period_id);
  if (result.error) {
    return Response.json({ error: result.error, alias }, { status: 404 });
  }

  return Response.json({ period_id, ...result });
}
