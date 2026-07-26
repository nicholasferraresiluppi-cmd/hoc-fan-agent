// Refresh notturno delle librerie film (chiamato dal dispatch, mai cron proprio
// in vercel.json — regola: i cron nuovi vanno nel dispatcher). Rinfresca le 2
// librerie più stantie (>20h) per giro: gli ESEMPI FRESCHI arrivano da soli,
// senza che un coach debba aprire la pagina. Budget BQ contenuto by design.
// Difesa propria via cron-auth (path pubblico /api/cron/*), + SEED da sessione.

export const runtime = "nodejs";
export const maxDuration = 120;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { staleLibraries, touchLibrary } from "@/lib/film-library";
import { getOperatorGameFilm, bigQueryConfigured } from "@/lib/operator-game-film";

async function handle(request) {
  const viaCron = isCronAuthorized(request);
  if (!viaCron) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  if (!bigQueryConfigured()) return Response.json({ refreshed: [], skipped: "bigquery non configurato" });

  const ops = await staleLibraries(2);
  const refreshed = [];
  const failed = [];
  for (const op of ops) {
    try {
      // force=true: ricalcola e (dentro il motore) fa upsert nella libreria,
      // preservando i giudizi. Aggiorna anche la cache 6h del film.
      await getOperatorGameFilm({ operator: op, force: true });
      refreshed.push(op);
    } catch (e) {
      failed.push({ op, error: e?.message || String(e) });
      // il fallimento CONSUMA il turno: senza touch, un film che fallisce
      // deterministicamente monopolizzerebbe i 2 slot ogni notte per sempre
      await touchLibrary(op).catch(() => {});
    }
  }
  await kv
    .set("cron:heartbeat:film-refresh", { at: Date.now(), refreshed, failed, via: viaCron ? "cron" : "session" }, { ex: 40 * 24 * 3600 })
    .catch(() => {});
  return Response.json({ refreshed, failed });
}

export async function POST(request) {
  return handle(request);
}
export async function GET(request) {
  return handle(request);
}
