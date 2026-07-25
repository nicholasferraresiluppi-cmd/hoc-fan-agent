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
import { getInflowwStore, storeToList } from "@/lib/infloww-ingest";
import { normalizeName } from "@/lib/me";
import { buildDuoCoverage } from "@/lib/operator-duo-coverage";

// Copertura duo a read-time: congiunge i segnali dell'export Infloww (turni in duo)
// al profilo warehouse (solo singoli). Additivo e non-fatale: lo store è indipendente
// e potrebbe essere vuoto/errore → in quel caso duo_coverage=null, il profilo regge.
// Stessa identità operatore del resto dell'app (normalizeName di src/lib/me.js).
async function attachDuoCoverage(data) {
  if (!data || !Array.isArray(data.profiles)) return data;
  try {
    const store = await getInflowwStore();
    const summary = buildDuoCoverage(data.profiles, storeToList(store), { normalize: normalizeName });
    data.duo_coverage = { ...summary, store_updated_at: store?.updated_at || null };
  } catch {
    data.duo_coverage = null;
  }
  return data;
}

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false, profiles: [] });
  try {
    // percorso consigliato calcolato a read-time dal catalogo scenari (non in cache:
    // così resta sempre allineato al catalogo Academy corrente).
    const data = await attachDuoCoverage(attachCoachingPaths(await getOperatorSignalProfiles()));
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
    const data = await attachDuoCoverage(attachCoachingPaths(await getOperatorSignalProfiles({ force: true, ...body })));
    return Response.json({ bigquery: true, ...data });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo profili fallito" }, { status: 500 });
  }
}
