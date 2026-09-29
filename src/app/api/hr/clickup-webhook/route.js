/**
 * POST /api/hr/clickup-webhook — eventi ClickUp della lista HR (Centro HR, 29/09/2026).
 *
 * Route PUBBLICA (ClickUp non ha una sessione Clerk): è nel matcher pubblico
 * del middleware e si difende DA SOLA, come i cron con lib/cron-auth:
 *   1. firma HMAC-SHA256 dell'header `X-Signature` sul corpo GREZZO, col
 *      secret restituito da ClickUp alla registrazione (in KV `hr:webhook`,
 *      mai in env né in risposta) — confronto a tempo costante;
 *   2. `webhook_id` del payload = quello registrato;
 *   3. il task viene RILETTO via API (il payload non è mai la fonte dei valori)
 *      e deve stare nella lista configurata.
 * Anti-loop e conflitti per campo: lib/hr-people (ingestTask).
 * Risposte: 401 firma, 200 per gli eventi ignorati (ClickUp non deve
 * ritentare), 500 sugli errori transitori (ClickUp ritenta).
 */
import { verifyClickupSignature } from "@/lib/hr-people-core";
import { getWebhookRecord, handleWebhookEvent } from "@/lib/hr-people";
import { checkRateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "n/d";
  const rl = await checkRateLimit("hr_webhook", ip);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const raw = await request.text();
  const wh = await getWebhookRecord();
  if (!wh?.secret) return Response.json({ error: "webhook non registrato" }, { status: 401 });
  if (!verifyClickupSignature(raw, request.headers.get("x-signature"), wh.secret)) {
    return Response.json({ error: "firma non valida" }, { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (String(payload?.webhook_id || "") !== String(wh.id)) {
    return Response.json({ error: "webhook sconosciuto" }, { status: 401 });
  }
  try {
    const out = await handleWebhookEvent(payload);
    return Response.json({ ok: true, ...out });
  } catch (e) {
    return Response.json({ error: "errore temporaneo" }, { status: 500 });
  }
}
