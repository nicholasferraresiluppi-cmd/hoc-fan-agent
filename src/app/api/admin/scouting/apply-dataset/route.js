// Radar creator — applica ai profili il risultato di un run Apify già fatto (SEED).
// POST {datasetId} → aggiorna SOLO i profili presenti nel run (numeri + foto); nessuna spesa.
// Serve per i giri mirati lanciati in sessione (es. foto delle creator col profilo a pagamento).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { applyDatasetPartial, apifyConfigured } from "@/lib/scouting-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!apifyConfigured()) return Response.json({ error: "Manca la chiave Apify nelle impostazioni di HOC Pro." }, { status: 503 });
  const { datasetId } = await request.json().catch(() => ({}));
  try {
    return Response.json(await applyDatasetPartial(datasetId));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
