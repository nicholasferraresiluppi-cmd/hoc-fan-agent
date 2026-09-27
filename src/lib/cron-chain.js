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

/**
 * Origin a cui mandare le chiamate server→server (figli di catena, kick del
 * dispatcher). NON l'origin della richiesta: il cron Vercel chiama l'URL del
 * deployment (hoc-fan-agent-xxxx.vercel.app), che è dietro la Deployment
 * Protection di Vercel (ssoProtection all_except_custom_domains). Il cron
 * passa, ma le NOSTRE fetch verso quell'URL prendono 401 dal bordo Vercel
 * prima di arrivare al codice. Così dal 20/07 al 25/09/2026 cp-wages,
 * payout-ledger, film-refresh, sales-coaching e gli alert del lunedì non sono
 * MAI partiti, con il dispatcher che scriveva {kicked:true}. Il dominio
 * custom è l'unico non protetto → le chiamate interne vanno lì.
 */
export function internalOrigin(request) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "production") return "https://houseofcreators.app";
  return new URL(request.url).origin; // locale / preview
}

// Aspetta l'handshake (1.5s): se nel frattempo arriva una risposta la
// guardiamo — un 401/403/5xx immediato è un kick FALLITO, non "partito"
// (prima veniva ingoiato e il dispatcher dichiarava successo).
async function fireAndCheck(url, init) {
  const res = await Promise.race([
    fetch(url, init),
    new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
  if (!res) return { kicked: true, pending: true };
  if (!res.ok) return { kicked: false, ok: false, status: res.status };
  return { kicked: true, status: res.status };
}
export async function continueChain(request, chain, { maxChain = 25 } = {}) {
  if (chain >= maxChain) return { chained: false, reason: "max_chain" };
  const url = new URL(request.url);
  const origin = internalOrigin(request);
  const secret = process.env.CRON_SECRET;
  const headers = { "x-tick-chain": String(chain + 1) };
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
  else headers["x-vercel-cron"] = "1";
  try {
    // Al figlio basta che la richiesta ARRIVI alla piattaforma — poi corre da
    // solo mentre il padre chiude entro il proprio maxDuration.
    const r = await fireAndCheck(`${origin}${url.pathname}`, { method: "POST", headers });
    return r.kicked ? { chained: true } : { chained: false, reason: `http_${r.status}` };
  } catch {
    return { chained: false, reason: "fetch_failed" };
  }
}

/** Profondità di catena della richiesta corrente (0 = tick avviato dal cron). */
export function chainDepth(request) {
  return Number(request.headers.get("x-tick-chain") || 0);
}

/**
 * Accende un altro endpoint cron con le stesse credenziali (per il
 * dispatcher: il piano Hobby registra pochi cron → uno smista gli altri).
 * `awaitResponse: true` per i lavori rapidi da eseguire in sequenza (es.
 * alert run PRIMA del digest); default handshake per i tick auto-concatenanti.
 */
export async function kickEndpoint(request, path, { awaitResponse = false } = {}) {
  const origin = internalOrigin(request);
  const secret = process.env.CRON_SECRET;
  const headers = {};
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
  else headers["x-vercel-cron"] = "1";
  try {
    if (awaitResponse) {
      const res = await fetch(`${origin}${path}`, { method: "POST", headers });
      return { ok: res.ok, status: res.status };
    }
    return await fireAndCheck(`${origin}${path}`, { method: "POST", headers });
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
