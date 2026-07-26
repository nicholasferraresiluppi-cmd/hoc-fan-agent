// Game film operatore — API (SEED). GET = film (cache 6h), POST = ricalcolo.
//
// GATE: SEED come operator-signals, ma qui il payload porta anche i TRANSCRIPT
// (testo fan pseudonimizzato) → superficie admin/coach e basta. Il wiring
// operatore-facing richiederebbe la curatela con gate PII dei game tape
// (extract → review → publish): non costruito in v1, deliberato.

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getOperatorGameFilm, bigQueryConfigured } from "@/lib/operator-game-film";

async function handle(request, force) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false, error: "BigQuery non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const operator = (url.searchParams.get("operator") || "").slice(0, 120);
  const days = url.searchParams.get("days") || undefined;
  if (!operator.trim()) return Response.json({ error: "Parametro operator mancante" }, { status: 400 });
  try {
    const data = await getOperatorGameFilm({ operator, days, force });
    return Response.json({ bigquery: true, ...data });
  } catch (e) {
    return Response.json({ error: e.message || "Estrazione film fallita" }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request, false);
}

export async function POST(request) {
  return handle(request, true);
}
