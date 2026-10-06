/**
 * Quando avvisare Nicholas su WhatsApp di un modulo HR (05/10/2026).
 *
 * Prima l'avviso partiva all'invio dei dati, ma il modulo ha un ultimo passo (il documento
 * d'identità): arrivava «ha compilato» mentre la persona doveva ancora caricarlo. Ora:
 *   - con i caricamenti attivi, l'invio dei dati mette la scheda in attesa (ZSET);
 *   - documento ricevuto → «ha completato il modulo (documento caricato)»;
 *   - dopo DOC_WAIT_MS senza documento (giro della coda HR ogni 5 minuti) →
 *     «ha inviato i dati ma NON ha caricato il documento».
 * Un avviso per scheda: chi toglie per primo l'id dallo ZSET manda il messaggio.
 */
import { kv } from "@vercel/kv";
import { getPerson } from "./hr-people.js";
import { notifyWhatsApp, newFormMessage } from "./whatsapp-notify.js";

const PENDING = "hr:notify:pending";
export const DOC_WAIT_MS = 45 * 60 * 1000;

async function send(personId, doc) {
  const p = await getPerson(personId).catch(() => null);
  if (p) await notifyWhatsApp(newFormMessage(p, undefined, { doc })).catch(() => {});
}

/** Dati del modulo inviati. Senza passo documenti l'avviso parte subito. */
export async function formSubmitted(personId, { waitForDocument, now = Date.now() } = {}) {
  if (!personId) return;
  if (!waitForDocument) return send(personId, null);
  await kv.zadd(PENDING, { score: now, member: personId });
}

/**
 * Una parte del documento d'identità presa in carico. L'avviso parte solo a documento
 * COMPLETO: passaporto, oppure fronte E retro della carta (part null = file unico vecchio stile).
 */
export async function documentReceived(personId, part = null) {
  if (!personId) return;
  const key = `hr:notify:parts:${personId}`;
  await kv.sadd(key, part || "intero");
  await kv.expire(key, 3 * 24 * 3600);
  const parts = new Set((await kv.smembers(key).catch(() => [])) || []);
  const complete = parts.has("intero") || parts.has("passaporto") || (parts.has("fronte") && parts.has("retro"));
  if (!complete) return;
  await kv.zrem(PENDING, personId).catch(() => 0);
  // un avviso «documento caricato» per scheda, anche se arriva dopo quello «manca» (si può caricare per 48 ore)
  const first = await kv.set(`hr:notify:docdone:${personId}`, 1, { nx: true, ex: 7 * 24 * 3600 }).catch(() => "OK");
  if (first) await send(personId, "caricato");
}

/** Schede in attesa da troppo: avviso «documento mancante». */
export async function flushMissingDocuments({ now = Date.now(), max = 10 } = {}) {
  const ids = await kv.zrange(PENDING, 0, now - DOC_WAIT_MS, { byScore: true, offset: 0, count: max }).catch(() => []);
  let sent = 0;
  for (const id of ids || []) {
    const removed = await kv.zrem(PENDING, id).catch(() => 0);
    if (removed) { await send(id, "manca"); sent++; }
  }
  return sent;
}
