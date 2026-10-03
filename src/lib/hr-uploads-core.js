/**
 * Centro HR — upload dei documenti dal modulo pubblico, logica PURA (03/10/2026).
 *
 * Flusso: il browser chiede uno "slot" (pathname casuale deciso dal server) →
 * carica il file DIRETTO sul Blob privato di Vercel (niente limite ~4,5 MB delle
 * funzioni) → chiede alla route /file di copiarlo come allegato del task ClickUp
 * → il blob si cancella subito. Se ClickUp non risponde, il file resta nel Blob
 * e un elemento va in coda (hr:upload:pending), riprovato con attese crescenti.
 *
 * Qui niente KV, niente rete: solo regole, testabili in node.
 */

import { UPLOAD_MAX_BYTES } from "./hr-fields.js";

export const UPLOAD_MAX_BYTES_V2 = UPLOAD_MAX_BYTES; // 20 MB, stesso valore nel browser e lato server
export const UPLOAD_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export const UPLOAD_PREFIX = "hr-upload/";
export const UPLOAD_SLOT_TTL_S = 2 * 3600;     // uno slot vale 2 ore (la finestra file è 1 ora)
export const MAX_SLOTS_PER_TOKEN = 8;          // slot chiesti (anche upload ripetuti dopo errori)
export const MAX_FILES_PER_TOKEN = 4;          // file arrivati davvero (come prima)
export const ORPHAN_MAX_AGE_MS = 24 * 3600 * 1000;
export const QUEUE_MAX_ATTEMPTS = 12;          // con le attese crescenti ≈ un giorno e mezzo
export const QUEUE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/** Pathname deciso dal server: casuale, senza dati personali. */
export function newUploadPathname(randomHex, contentType) {
  const ext = UPLOAD_TYPES[contentType];
  if (!ext || !/^[a-f0-9]{32}$/.test(String(randomHex || ""))) return null;
  return `${UPLOAD_PREFIX}${randomHex}.${ext}`;
}

export function isUploadPathname(p) {
  return typeof p === "string" && /^hr-upload\/[a-f0-9]{32}\.(pdf|jpg|png)$/.test(p);
}

/**
 * Controlli della richiesta di slot (oltre allo stato del token, fatto da chi chiama).
 * @returns {null | {status, error}}
 */
export function checkUploadRequest({ kind, contentType, size }, kinds) {
  if (!kinds[kind]) return { status: 400, error: "Tipo di documento non previsto." };
  if (!UPLOAD_TYPES[contentType]) return { status: 415, error: "Formato non ammesso: solo PDF, JPG o PNG." };
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { status: 400, error: "File vuoto." };
  if (n > UPLOAD_MAX_BYTES_V2) return { status: 413, error: "File troppo grande (massimo 20 MB)." };
  return null;
}

/** Attesa prima del prossimo tentativo: 1, 2, 4 … minuti, al massimo 6 ore. */
export function nextAttemptDelayMs(attempts) {
  const min = Math.min(360, 2 ** Math.max(0, attempts - 1));
  return min * 60 * 1000;
}

/** Errore di ClickUp da riprovare più tardi (rete, 429, 5xx, token/permessi che si possono sistemare). */
export function isRetryableUploadError(e) {
  const s = Number(e?.status ?? 0);
  return s === 0 || s === 429 || s >= 500 || s === 401 || s === 403;
}

/** Elemento in coda da abbandonare (troppi tentativi o troppo vecchio)? */
export function shouldGiveUp(item, now) {
  if ((item.attempts || 0) >= QUEUE_MAX_ATTEMPTS) return true;
  return now - Number(item.firstAt || now) > QUEUE_MAX_AGE_MS;
}

/** Elementi in coda pronti per un tentativo, i più vecchi prima. */
export function dueItems(items, now) {
  return items.filter((it) => it && Number(it.nextAt || 0) <= now).sort((a, b) => (a.firstAt || 0) - (b.firstAt || 0));
}

/**
 * Blob da cancellare nella pulizia notturna: nella cartella degli upload, più
 * vecchi di 24 ore e NON in coda (upload abbandonati o rimasti per errore).
 */
export function orphanBlobs(blobs, queuedPathnames, now, maxAgeMs = ORPHAN_MAX_AGE_MS) {
  const queued = new Set(queuedPathnames || []);
  return (blobs || [])
    .filter((b) => b?.pathname?.startsWith(UPLOAD_PREFIX) && !queued.has(b.pathname))
    .filter((b) => now - new Date(b.uploadedAt).getTime() > maxAgeMs)
    .map((b) => b.pathname);
}
