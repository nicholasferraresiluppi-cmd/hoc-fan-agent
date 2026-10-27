/**
 * GET /api/admin/publisher-x/fans?month=YYYY-MM&publisher=Nome — i fan portati da UN publisher
 * nel mese, NOMINATI, con la spesa dei primi 30 giorni (lib/publisher-x getPublisherFans).
 * Dati fan identificati → SEED + ogni apertura nel registro azioni.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { logAuditAction } from "@/lib/audit-log";
import { getPublisherFans } from "@/lib/publisher-x";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "Warehouse non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || "";
  const publisher = (url.searchParams.get("publisher") || "").trim();
  if (!publisher) return Response.json({ error: "publisher mancante" }, { status: 400 });
  try {
    const data = await getPublisherFans(month, publisher);
    await logAuditAction({ action: "publisher-x.fans.view", target: publisher, by: az.userId, meta: { month, fans: data.publisher.fans.length } }).catch(() => {});
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e.message || "Lettura non riuscita" }, { status: /mese|Nessun link/.test(e.message || "") ? 400 : 500 });
  }
}
