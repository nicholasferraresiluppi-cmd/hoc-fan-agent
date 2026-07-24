// Game tape Academy — superficie admin (SEED): estrazione, lista completa, curatela.
// La lettura operatore (solo pubblicati, senza user_id) sta in /api/academy/tapes.

export const runtime = "nodejs"; // bigquery-api usa crypto nativo: niente Edge

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { extractTapes, listTapes, curateTape, lastExtract } from "@/lib/academy-tapes";
import { bigQueryConfigured } from "@/lib/bigquery-api";
import { getCreators } from "@/lib/priority-queue";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const bq = bigQueryConfigured();
  const [tapes, last, creators] = await Promise.all([
    listTapes({ limit: 100 }),
    lastExtract(),
    bq ? getCreators().catch(() => []) : Promise.resolve([]),
  ]);
  return Response.json({ tapes, creators, last_extract: last, bigquery: bq });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) {
    return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON mancante" }, { status: 400 });
  }
  try {
    const out = await extractTapes(body || {});
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e.message || "Estrazione fallita" }, { status: 500 });
  }
}

export async function PATCH(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON mancante" }, { status: 400 });
  }
  const { id, ...patch } = body || {};
  if (!id) return Response.json({ error: "id mancante" }, { status: 400 });
  try {
    const tape = await curateTape(id, patch);
    return Response.json({ tape });
  } catch (e) {
    return Response.json({ error: e.message || "Curatela fallita" }, { status: 500 });
  }
}
