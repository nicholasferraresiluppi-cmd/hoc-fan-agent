// Logica pura del ricevitore webhook di OnlyFansAPI (vedi app/api/webhooks/ofapi).
// Testata in tests/ofapi-webhook.mjs.
//
// Firma (docs.onlyfansapi.com/webhooks/protecting-your-webhooks): header
// `Signature` = HMAC SHA256 esadecimale del corpo GREZZO, chiave = signing secret.
// Si verifica sul testo così come arriva: riserializzare il JSON cambierebbe i byte.

import crypto from "crypto";

export function verifyOfapiSignature(rawBody, signature, secret) {
  if (!secret || !signature || typeof rawBody !== "string") return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = String(signature).trim().toLowerCase();
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/**
 * Riga per `ofapi.webhook_events`. L'evento si salva intero (payload come testo):
 * le viste per messaggi, abbonati e acquisti si costruiscono dopo, in SQL, senza
 * perdere niente di ciò che il fornitore ha mandato.
 */
export function webhookEventRow(body, { idempotencyKey, receivedAt = new Date() } = {}) {
  return {
    received_at: receivedAt.toISOString(),
    event: String(body?.event || "unknown"),
    account_id: body?.account_id ? String(body.account_id) : null,
    idempotency_key: idempotencyKey || null,
    payload: JSON.stringify(body?.payload ?? null),
  };
}
