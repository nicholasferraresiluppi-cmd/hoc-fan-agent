/**
 * POST /api/ingest/infloww-csv
 *
 * Ingest headless del CSV Infloww (Employee statistics) dal bridge locale sul
 * Mac di Nicholas. Auth a SEGRETO CONDIVISO (non Clerk): la routine gira senza
 * sessione browser. Riusa la stessa logica dell'import admin → stesse chiavi KV.
 *
 * Body: { csv: string, period_type: "monthly"|"weekly"|"quarterly", period_id: "YYYY-MM" }
 * Header: x-ingest-secret: <INFLOWW_INGEST_SECRET>
 */
import { importOpsKpiCsv } from "@/lib/ops-kpi-import";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(request) {
  const secret = process.env.INFLOWW_INGEST_SECRET;
  if (!secret) return Response.json({ error: "Ingest non configurato (INFLOWW_INGEST_SECRET mancante)." }, { status: 503 });
  if (request.headers.get("x-ingest-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const { csv, period_type = "monthly", period_id } = body || {};
  const r = await importOpsKpiCsv({ csv, period_type, period_id, mode: "save" });
  return Response.json(r.body, { status: r.status });
}
