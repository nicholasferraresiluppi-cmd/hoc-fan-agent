// Creator Difficulty — API (SEED). GET = ultimo profilo (cache), POST = ricalcolo forzato.
// Profilo di difficoltà del pubblico per creator: il CONTESTO per leggere i numeri
// di un operatore senza scambiarli per bravura/colpa. Non entra in score/comp.
//
// GATE: SEED = admin-only tra i ruoli predefiniti — la superficie espone economics
// per creator (revenue, LTV, conversion), stessa classe di operator-signals.
//
// Cache-miss (review 30/07): il calcolo inline passa dal single-flight
// (computeCreatorDifficultyOnce, lock KV): N richieste concorrenti = 1 sola query
// BigQuery; le altre ricevono { computing: true } e la pagina mostra lo stato.

export const runtime = "nodejs";
export const maxDuration = 60;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import {
  getCachedCreatorDifficulty,
  computeCreatorDifficultyOnce,
  bigQueryConfigured,
  STALE_AFTER_H,
  isStale,
} from "@/lib/creator-difficulty";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ bigquery: false, profiles: [] });
  try {
    const cached = await getCachedCreatorDifficulty();
    if (cached) {
      return Response.json({
        ...cached,
        cached: true,
        stale: isStale(cached.generated_at, Date.now(), STALE_AFTER_H),
      });
    }
    // Nessuna cache (primo giro, o cron fermo oltre il TTL): calcola inline ma
    // in single-flight — se un altro calcolo è già in volo, dillo e basta.
    const fresh = await computeCreatorDifficultyOnce();
    if (!fresh) return Response.json({ computing: true, profiles: [] });
    return Response.json({ ...fresh, cached: false, stale: false });
  } catch (e) {
    return Response.json({ error: e?.message || "Calcolo fallito." }, { status: 500 });
  }
}

export async function POST() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato." }, { status: 503 });
  try {
    const fresh = await computeCreatorDifficultyOnce();
    if (!fresh) return Response.json({ error: "Un ricalcolo è già in corso — riprova tra un minuto." }, { status: 409 });
    return Response.json({ ...fresh, cached: false, stale: false });
  } catch (e) {
    return Response.json({ error: e?.message || "Ricalcolo fallito." }, { status: 500 });
  }
}
