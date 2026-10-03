// Conversation Intelligence · Tier-1 — presidio chat per creator (metadata-only da BigQuery).
// Dati performance per creator → chi guida una squadra (scope team|all) vede le SUE creator
// (03/10/2026, prova d'uso: il Sales Manager con creator assegnate riceveva 403 su tutta la pagina).

import { authorizeScoped, personOf, scopeSummary } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { getConversationIntelligence, bigQueryConfigured } from "@/lib/conversation-intelligence";

export const runtime = "nodejs"; // il client BigQuery usa crypto → no Edge
export const dynamic = "force-dynamic";

// I nomi qui vengono dal warehouse, quelli assegnati dalla matrice CreatorsPro: si confrontano
// normalizzati (maiuscole, accenti, suffisso lingua). FAIL-CLOSED: un nome che non torna resta nascosto.
const norm = (s) => personOf(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export async function GET() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  if (!bigQueryConfigured()) {
    return Response.json(
      { error: "BigQuery non configurato (BIGQUERY_SA_KEY / BIGQUERY_BILLING_PROJECT mancanti)" },
      { status: 503 }
    );
  }

  try {
    const data = await getConversationIntelligence();
    const visibility = scopeSummary(az.creatorScope);
    if (az.creatorScope.all) return Response.json({ ...data, visibility });
    const mine = new Set([...az.creatorScope.creators].map(norm));
    const by_creator = (data.by_creator || []).filter((r) => mine.has(norm(r.creator)));
    // solo il conteggio di ciò che non torna, mai i nomi delle creator altrui
    const unmatched = Math.max(0, mine.size - new Set(by_creator.map((r) => norm(r.creator))).size);
    return Response.json({ by_creator, creators: by_creator.length, generated_at: data.generated_at, cached: data.cached, visibility, unmatched });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
