// Academy Signals — API (SEED). GET = ultimo calcolo (cache 12h), POST = ricalcolo.
// Dato analitico aggregato (nessun PII, nessun revenue per-operatore): quali
// comportamenti correlano col revenue, per informare il coaching.

export const runtime = "nodejs"; // bigquery-api usa crypto nativo: niente Edge
export const maxDuration = 60; // il calcolo a freddo (cache miss) è una query analitica: budget ampio

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getAcademySignals, bigQueryConfigured } from "@/lib/academy-signals";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false, signals: [] });
  try {
    const data = await getAcademySignals();
    return Response.json({ bigquery: true, ...data });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo signals fallito" }, { status: 500 });
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
    const data = await getAcademySignals({ force: true, ...body });
    return Response.json({ bigquery: true, ...data });
  } catch (e) {
    return Response.json({ error: e.message || "Calcolo signals fallito" }, { status: 500 });
  }
}
