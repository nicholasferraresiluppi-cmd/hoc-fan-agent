/**
 * Auto-concatenazione dei tick cron (vincolo piano Hobby: cron al massimo
 * giornalieri → un cron al giorno innesca una catena di invocazioni, ognuna
 * fa un passo sotto i 60s e chiama la successiva).
 *
 * Il figlio eredita il path della richiesta corrente: la stessa lib serve
 * qualsiasi route sotto /api/cron/*. Auth del figlio: Bearer CRON_SECRET se
 * configurato, altrimenti l'header di transizione (vedi lib/cron-auth).
 * Best-effort by design: se la catena si spezza, il cron del giorno dopo (o
 * il trigger manuale) riprende dallo stato salvato in KV.
 */
export async function continueChain(request, chain, { maxChain = 25 } = {}) {
  if (chain >= maxChain) return { chained: false, reason: "max_chain" };
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const headers = { "x-tick-chain": String(chain + 1) };
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
  else headers["x-vercel-cron"] = "1";
  try {
    // Aspetta solo l'handshake (1.5s): al figlio basta che la richiesta ARRIVI
    // alla piattaforma — poi corre da solo mentre il padre chiude entro il
    // proprio maxDuration.
    await Promise.race([
      fetch(`${url.origin}${url.pathname}`, { method: "POST", headers }),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    return { chained: true };
  } catch {
    return { chained: false, reason: "fetch_failed" };
  }
}

/** Profondità di catena della richiesta corrente (0 = tick avviato dal cron). */
export function chainDepth(request) {
  return Number(request.headers.get("x-tick-chain") || 0);
}
