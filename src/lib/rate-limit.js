/**
 * Tetto d'uso per le route che costano (LLM Anthropic, query BigQuery).
 *
 * PERCHÉ (audit set 2026): qualsiasi utente loggato — o un account operatore
 * compromesso, o uno script con un token candidato trapelato — poteva chiamare
 * /api/chat in loop e far salire i costi senza limite. Finestre fisse su KV
 * (INCR + EXPIRE): semplice, condiviso tra istanze serverless, costo = 1-2
 * comandi per richiesta. Le soglie sono larghe per l'uso umano (un operatore
 * che si allena davvero non le tocca) e strette per un loop automatico.
 *
 * Fail-open: se KV non risponde si lascia passare — un tetto anti-abuso non
 * deve spegnere il simulatore.
 */
import { kv } from "@vercel/kv";

// name → [{ window: secondi, max }]
export const LIMITS = {
  llm_chat:      [{ window: 60, max: 30 },  { window: 86400, max: 1500 }],  // un messaggio del fan simulato
  llm_eval:      [{ window: 3600, max: 40 }, { window: 86400, max: 200 }],  // valutazioni / coach / drill
  bq_user:       [{ window: 3600, max: 30 }, { window: 86400, max: 150 }],  // query warehouse lato operatore
  candidate_chat:[{ window: 60, max: 20 },  { window: 86400, max: 400 }],
  candidate_eval:[{ window: 3600, max: 20 }],
  feedback:      [{ window: 86400, max: 30 }],
};

/**
 * @returns {Promise<{ok: true} | {ok: false, retryAfter: number}>}
 */
export async function checkRateLimit(name, subject) {
  const rules = LIMITS[name];
  if (!rules || !subject) return { ok: true };
  try {
    const now = Math.floor(Date.now() / 1000);
    for (const { window, max } of rules) {
      const bucket = Math.floor(now / window);
      const key = `rl:${name}:${window}:${subject}:${bucket}`;
      const n = await kv.incr(key);
      if (n === 1) await kv.expire(key, window + 5);
      if (n > max) return { ok: false, retryAfter: (bucket + 1) * window - now };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/** Response 429 standard, in italiano. */
export function tooMany(retryAfter) {
  const min = Math.max(1, Math.ceil(retryAfter / 60));
  return Response.json(
    { error: `Troppe richieste in poco tempo. Riprova tra ${min} minut${min === 1 ? "o" : "i"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
