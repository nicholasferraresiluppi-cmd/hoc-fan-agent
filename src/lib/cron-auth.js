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
import { timingSafeEqual } from "crypto";

/** Confronto a tempo costante (niente timing attack sul secret). */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Senza CRON_SECRET si RIFIUTA (fail-closed, set 2026): l'header x-vercel-cron
// è falsificabile da chiunque su una route pubblica. In production il secret
// c'è; su preview/locale i cron semplicemente non girano.
export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization") || "", `Bearer ${secret}`);
}
