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
import { hrSyncConfig, ensureWebhookHealthy, notifyStuckSync } from "@/lib/hr-people";
import { drainHrBackground } from "@/lib/hr-uploads";
import { flushMissingDocuments } from "@/lib/hr-form-notify";

async function handle(request) {
  if (!isCronAuthorized(request)) {
    const az = await authorize(CAPABILITIES.SEED);
    if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  }
  // battito a OGNI giro (anche a coda vuota): senza, «tutto tranquillo» e «fermo» non si distinguevano (Sede, 04/10/2026)
  await kv.set("cron:alive:hr-queue", { at: Date.now() }, { ex: 2 * 24 * 3600 }).catch(() => {});
  // moduli inviati senza documento da 45 minuti: avviso WhatsApp «documento mancante»
  await flushMissingDocuments().catch(() => 0);
  if (!hrSyncConfig().enabled) return Response.json({ result: "skip:sync-off" });
  // una volta l'ora: il webhook di ClickUp è ancora attivo? (se no si riattiva e avvisa)
  const webhook = await ensureWebhookHealthy().catch((e) => ({ error: String(e?.message || e).slice(0, 200) }));
  // schede che da più di un'ora non arrivano su ClickUp: WhatsApp (al massimo uno al giorno)
  await notifyStuckSync().catch(() => null);
  if (webhook?.reregistered || webhook?.error) await kv.set("cron:heartbeat:hr-webhook", { at: Date.now(), ...webhook }, { ex: 7 * 24 * 3600 }).catch(() => {});
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
