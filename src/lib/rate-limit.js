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
  llm_chat:      [{ window: 60, max: 30 },  { window: 86400, max: 250 }],   // un messaggio del fan simulato (27/09: da 1500 → ~25 sessioni al giorno)
  llm_eval:      [{ window: 3600, max: 40 }, { window: 86400, max: 60 }],   // valutazioni / coach / drill (27/09: da 200)
  bq_user:       [{ window: 3600, max: 30 }, { window: 86400, max: 150 }],  // query warehouse lato operatore
  candidate_chat:[{ window: 60, max: 20 },  { window: 86400, max: 400 }],
  candidate_eval:[{ window: 3600, max: 20 }],
  feedback:      [{ window: 86400, max: 30 }],
  thanks:        [{ window: 86400, max: 20 }],  // "grazie" tra colleghi
  // Centro HR (29/09/2026): modulo pubblico da link, upload documenti, webhook ClickUp.
  // Rivisti il 03/10/2026 per 300 persone, anche tutte insieme (link mandato a tutti):
  //  - per IP: in ufficio molte persone escono dallo STESSO IP. Una persona fa ~3-5
  //    richieste al modulo in pochi minuti; 300 al minuto = ~60-100 persone nello
  //    stesso minuto dallo stesso IP. Il giorno: 300 persone × ~10 + errori = 5000.
  //    La vera difesa anti-abuso non è l'IP ma il tetto di INVII e i token monouso.
  //  - upload per token: ogni file = 3 richieste (slot, token Blob, copia su ClickUp),
  //    2 file + qualche ripetizione dopo un errore → 30 all'ora per token figlio.
  //    È per token (cioè per persona), quindi l'IP condiviso non conta.
  hr_form:       [{ window: 60, max: 20 },  { window: 86400, max: 200 }],  // per token personale
  hr_form_ip:    [{ window: 60, max: 300 }, { window: 86400, max: 5000 }], // per IP (uffici: IP condiviso)
  hr_upload:     [{ window: 3600, max: 30 }],                             // per token (persona)
  hr_upload_ip:  [{ window: 60, max: 300 }],                              // per IP, solo freno ai loop
  // Link condiviso (03/10/2026): un solo link per tutti → il tetto per token di hr_form
  // diventerebbe un tetto per l'intera azienda. Richieste larghe, INVII contati.
  // Invii: 2000 al giorno (300 persone + reinvii dopo errori + margine ampio), con un
  // freno al minuto (150) che regge il picco vero (50-100 invii nello stesso minuto)
  // ma ferma uno script che crea schede in loop. Le schede spazzatura finiscono
  // comunque nella vista "Da ripulire".
  hr_form_shared:        [{ window: 60, max: 600 }, { window: 86400, max: 20000 }], // richieste per token condiviso
  hr_form_shared_submit: [{ window: 60, max: 150 }, { window: 86400, max: 2000 }],  // invii dal link condiviso
  hr_webhook:    [{ window: 60, max: 300 }],                              // per IP (ClickUp)
  // Radar creator (10/10/2026): ogni segnalazione nuova costa ~3 centesimi di Apify.
  // Un turno di scouting vero ne fa qualche decina al giorno per persona.
  scouting_signal: [{ window: 60, max: 12 }, { window: 86400, max: 300 }],  // per persona (o token)
  scouting_reels:  [{ window: 3600, max: 60 }],                             // carica reel, per persona
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
