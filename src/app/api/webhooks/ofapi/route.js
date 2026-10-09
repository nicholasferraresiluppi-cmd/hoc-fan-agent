/**
 * POST /api/webhooks/ofapi — eventi in tempo reale da OnlyFansAPI (messaggi,
 * nuovi abbonati, rinnovi, acquisti PPV, tip, transazioni, sessioni scadute…).
 *
 * Route PUBBLICA (middleware): si difende da sola con la firma HMAC del corpo
 * (`Signature`, segreto `OFAPI_WEBHOOK_SECRET`). Senza segreto configurato
 * rifiuta tutto (fail closed).
 * Il fornitore aspetta un 2xx entro 10 secondi e riprova fino a 3 volte: si
 * salva l'evento intero in `hoc-pro.ofapi.webhook_events` e si risponde. Se il
 * salvataggio fallisce si risponde 500, così l'evento torna.
 */
import { verifyOfapiSignature, webhookEventRow } from "@/lib/ofapi-webhook-core";
import { insertWebhookEvent } from "@/lib/ofapi-store";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request) {
  const secret = process.env.OFAPI_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "webhook non configurato" }, { status: 503 });

  const raw = await request.text();
  if (!verifyOfapiSignature(raw, request.headers.get("signature"), secret)) {
    return Response.json({ error: "firma non valida" }, { status: 401 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON non valido" }, { status: 400 });
  }
  try {
    await insertWebhookEvent(webhookEventRow(body, { idempotencyKey: request.headers.get("x-ofapi-idempotency-key") }));
  } catch (e) {
    console.error("ofapi webhook: salvataggio fallito", e?.message);
    return Response.json({ error: "salvataggio fallito" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
