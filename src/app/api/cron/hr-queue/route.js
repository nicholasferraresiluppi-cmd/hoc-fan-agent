// Coda Centro HR ogni 5 minuti (03/10/2026). Nato dal test di carico: 100 invii in
// un minuto → ClickUp risponde 429 (≈100 richieste/min), le schede e i documenti
// rimasti in coda si riprendevano solo con la richiesta successiva del modulo o di
// notte. Se dopo un'ondata nessuno compila, aspettavano ore. Qui si riprendono
// entro pochi minuti, a qualsiasi ora.
// Unica eccezione alla regola "un solo cron, il dispatcher": siamo su Vercel Pro
// (cron al minuto, puntuali) e un giro a vuoto costa due letture KV.
export const runtime = "nodejs";
export const maxDuration = 60;

import { kv } from "@vercel/kv";
import { isCronAuthorized } from "@/lib/cron-auth";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { hrSyncConfig } from "@/lib/hr-people";
import { drainHrBackground } from "@/lib/hr-uploads";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  if (!hrSyncConfig().enabled) return Response.json({ result: "skip:sync-off" });
  const [people, files] = await Promise.all([
    kv.scard("hr:sync:retry").catch(() => 0),
    kv.hlen("hr:upload:pending").catch(() => 0),
  ]);
  if (!people && !files) return Response.json({ result: "vuota" });
  // ClickUp ≈100 richieste/min: ~15 schede e ~15 file per giro restano sotto il tetto
  const r = await drainHrBackground({ budgetMs: 45_000, maxPeople: 15, maxItems: 15 });
  const result = { at: Date.now(), inCoda: { schede: people, documenti: files }, giro: r };
  await kv.set("cron:heartbeat:hr-queue", result, { ex: 7 * 24 * 3600 }).catch(() => {});
  return Response.json({ result });
}

export const GET = handle;
export const POST = handle;
