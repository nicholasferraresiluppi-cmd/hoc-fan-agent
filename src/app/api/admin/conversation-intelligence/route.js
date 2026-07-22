// Conversation Intelligence · Tier-1 — presidio chat per creator (metadata-only da BigQuery).
// Dati denaro/performance → gate scope "all".

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { getConversationIntelligence, bigQueryConfigured } from "@/lib/conversation-intelligence";

export const runtime = "nodejs"; // il client BigQuery usa crypto → no Edge
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  if (!bigQueryConfigured()) {
    return Response.json(
      { error: "BigQuery non configurato (BIGQUERY_SA_KEY / BIGQUERY_BILLING_PROJECT mancanti)" },
      { status: 503 }
    );
  }

  try {
    const data = await getConversationIntelligence();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
