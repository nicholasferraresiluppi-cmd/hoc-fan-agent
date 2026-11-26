/**
 * Richieste alla modella — caricamento dal BROWSER (26/11/2026). Lo usano la pagina della modella
 * (riprese) e quella dell'app (riferimento, nota vocale). Tre passi, come /numeri e il modulo HR:
 *   1. «slot»: il server decide dove va il file (pathname casuale legato alla richiesta);
 *   2. il file va DIRETTO sul Blob privato (`@vercel/blob/client`, importato solo adesso), a pezzi
 *      sopra i 20 MB: un video dal telefono non passa mai dal nostro server;
 *   3. «caricato»: il server controlla il file vero e lo registra.
 */
import { guessType, checkUploadRequest } from "./richieste-core.js";

async function postJson(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false || j?.error) throw new Error(j?.error || `Qualcosa non ha funzionato (${r.status}).`);
  return j;
}

/**
 * base: "/api/richiesta/<token>" (modella) o "/api/admin/richieste/<token>" (app)
 * kind: "take" | "ref" | "voce"
 */
export async function uploadMedia({ base, kind, shotId, file, onProgress }) {
  const contentType = guessType(file?.name, file?.type);
  const bad = checkUploadRequest({ kind, contentType, size: file?.size });
  if (bad) throw new Error(bad.error);
  const slot = await postJson(`${base}/upload`, { type: "slot", kind, shotId, contentType, size: file.size });
  const { upload } = await import("@vercel/blob/client");
  try {
    await upload(slot.pathname, file, {
      access: "private",
      handleUploadUrl: `${base}/upload`,
      contentType,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (e) => onProgress?.(Math.round(e?.percentage || 0)),
    });
  } catch (e) {
    const msg = String(e?.message || "");
    if (/too large|maximumSize/i.test(msg)) throw new Error("File troppo grande.");
    if (/content type/i.test(msg)) throw new Error("Formato del file non accettato.");
    throw new Error("Caricamento interrotto. Controlla la connessione e riprova.");
  }
  return postJson(`${base}/file`, { pathname: slot.pathname });
}

/** Tiene lo schermo acceso durante un caricamento lungo (dove il telefono lo permette). */
export async function keepAwake() {
  try {
    if (typeof navigator !== "undefined" && navigator.wakeLock?.request) {
      const lock = await navigator.wakeLock.request("screen");
      return () => lock.release().catch(() => {});
    }
  } catch { /* non supportato o negato: si carica lo stesso */ }
  return () => {};
}
