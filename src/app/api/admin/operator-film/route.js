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
import { attachLibrary } from "@/lib/film-library";

async function handle(request, force) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false, error: "BigQuery non configurato" }, { status: 503 });
  const url = new URL(request.url);
  // trim QUI: l'engine trimma prima di upsertare la libreria — senza trim la
  // attachLibrary leggerebbe una chiave diversa da quella scritta (giudizi muti)
  const operator = (url.searchParams.get("operator") || "").slice(0, 120).trim();
  const days = url.searchParams.get("days") || undefined;
  if (!operator) return Response.json({ error: "Parametro operator mancante" }, { status: 400 });
  try {
    // libreria attaccata a READ-TIME (anche su payload cache): giudizi sempre
    // freschi sulle card + lista completa per la sezione "tutti i momenti".
    const data = await attachLibrary(operator, await getOperatorGameFilm({ operator, days, force }));
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
