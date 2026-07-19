/**
 * Auth condivisa degli endpoint cron (schedulazioni Vercel, vedi vercel.json).
 *
 * CONTESTO (bug scoperto 20 lug 2026): i path cron NON erano tra le route
 * pubbliche del middleware Clerk → la chiamata schedulata di Vercel arrivava
 * senza sessione e prendeva 401 PRIMA di raggiungere il codice: nessun cron
 * è mai scattato in produzione (stessa classe del bug ingest, lug 2026).
 * Il fix li rende pubblici nel middleware, e QUESTO helper diventa il loro
 * unico cancello — per questo è più severo delle vecchie copie locali:
 *
 *  - Se `CRON_SECRET` è configurato (Vercel lo allega da solo alle chiamate
 *    cron come `Authorization: Bearer <secret>`): si accetta SOLO quello.
 *    L'header `x-vercel-cron` da solo non basta — su una route pubblica lo
 *    può scrivere chiunque, non è una prova.
 *  - Se `CRON_SECRET` NON è configurato (transizione): si accetta
 *    `x-vercel-cron`, così i cron partono comunque. Da chiudere impostando
 *    il secret nelle env Vercel.
 *
 * Le route mantengono il loro fallback a sessione (capability SEED) per il
 * trigger manuale dalla UI.
 */
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  if (secret) return authHeader === `Bearer ${secret}`;
  return Boolean(request.headers.get("x-vercel-cron"));
}
