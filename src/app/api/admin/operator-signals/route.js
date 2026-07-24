// Operator Signal Profile — API (SEED). GET = ultimo calcolo (cache), POST = ricalcolo.
// Diagnosi di coaching per operatore dai suoi turni singoli reali. Non entra in score/comp.
//
// GATE: SEED = admin-only tra i ruoli predefiniti (più restrittivo di authorizeAll/SM/QA),
// scelto perché questa superficie espone PII di performance del dipendente (nome operatore
// reale + revenue/ora). Stessa classe di employee-profiles/dashboard. NB governance
// (review lug 2026): la capability SEED ha label "seed dati demo" nell'editor ruoli custom,
// fuorviante per ~55 endpoint admin PII/denaro che gatea — rietichettarla è un pass separato.

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getOperatorSignalProfiles, bigQueryConfigured } from "@/lib/operator-signals";
import { attachCoachingPaths } from "@/lib/coaching-paths";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false, profiles: [] });
  try {
    // percorso consigliato calcolato a read-time dal catalogo scenari (non in cache:
    // così resta sempre allineato al catalogo Academy corrente).
    const data = attachCoachingPaths(await getOperatorSignalProfiles());
    return Response.json({ bigquery: true, ...data });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo profili fallito" }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* body opzionale */
  }
  try {
    const data = attachCoachingPaths(await getOperatorSignalProfiles({ force: true, ...body }));
    return Response.json({ bigquery: true, ...data });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo profili fallito" }, { status: 500 });
  }
}
