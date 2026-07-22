// Smoke test del connettore BigQuery: legge un piccolo slice reale e lo cacha.
// Serve a validare il cablaggio (auth SA + billing project + accesso ai dati) end-to-end.
// Sostituire/affiancare con le viste vere (es. hoc.laura_chat_monitor) una volta verificato.

import { kv } from "@vercel/kv";
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { bqQuery, bigQueryConfigured } from "@/lib/bigquery-api";

export const runtime = "nodejs"; // il client BigQuery usa crypto → no Edge
export const dynamic = "force-dynamic";

const CACHE_KEY = "bq:ping";
const CACHE_TTL = 3600; // 1h — non interroghiamo BigQuery a ogni richiesta

export async function GET() {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  if (!bigQueryConfigured()) {
    return Response.json(
      { error: "BigQuery non configurato: mancano BIGQUERY_SA_KEY / BIGQUERY_BILLING_PROJECT" },
      { status: 503 }
    );
  }

  const cached = await kv.get(CACHE_KEY);
  if (cached) return Response.json({ ...cached, cached: true });

  const dataProject = process.env.BIGQUERY_DATA_PROJECT || "house-of-creators-358213";
  const sql = `
    SELECT creator_name, total, calendar_date
    FROM \`${dataProject}.onlyfans.reach\`
    WHERE calendar_date = DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY)
    ORDER BY total DESC
    LIMIT 20`;

  try {
    const { rows, totalBytesProcessed } = await bqQuery(sql);
    const payload = {
      rows,
      row_count: rows.length,
      bytes_processed: totalBytesProcessed,
      generated_at: new Date().toISOString(),
    };
    await kv.set(CACHE_KEY, payload, { ex: CACHE_TTL });
    return Response.json({ ...payload, cached: false });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
