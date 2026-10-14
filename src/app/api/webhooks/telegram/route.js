/**
 * POST /api/webhooks/telegram — update del bot HOC dai canali delle creator (entrate, uscite, bot
 * aggiunto o tolto). Vedi lib/telegram-channels.
 *
 * Route PUBBLICA (middleware): si difende da sola con l'header X-Telegram-Bot-Api-Secret-Token, che
 * Telegram manda con il segreto registrato in setWebhook (TELEGRAM_WEBHOOK_SECRET). Senza segreto
 * configurato rifiuta tutto (fail closed). Confronto a tempo costante.
 * Se il salvataggio fallisce si risponde 500 e Telegram riprova; i doppioni li scarta handleUpdate.
 */
import crypto from "crypto";
import { handleUpdate } from "@/lib/telegram-channels";

export const runtime = "nodejs";
export const maxDuration = 10;

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export async function POST(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "webhook non configurato" }, { status: 503 });
  if (!sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return Response.json({ error: "segreto non valido" }, { status: 401 });
  }
  let update;
  try {
    update = await request.json();
  } catch {
    return Response.json({ error: "JSON non valido" }, { status: 400 });
  }
  try {
    const result = await handleUpdate(update);
    return Response.json({ ok: true, result });
  } catch (e) {
    console.error("telegram webhook:", e?.message);
    return Response.json({ error: "salvataggio fallito" }, { status: 500 });
  }
}
