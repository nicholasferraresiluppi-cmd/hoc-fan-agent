/**
 * Modulo HR — caricamento dei documenti dal BROWSER (03/10/2026).
 *
 * 1. Le foto (JPG/PNG) si riducono qui: lato lungo al massimo 2000 px, JPEG
 *    qualità 0,85, orientamento EXIF rispettato. Se la riduzione fallisce o il
 *    risultato pesa di più, si tiene l'originale. I PDF passano così come sono.
 * 2. Il file va DIRETTO sul Blob privato (`@vercel/blob/client`, importato solo
 *    al momento del caricamento): il pathname lo decide il server (slot).
 * 3. Il server lo copia su ClickUp e lo cancella dal Blob (route /file).
 * Limite 20 MB per file, controllato qui e lato server.
 */
import { UPLOAD_MAX_BYTES } from "./hr-fields.js";

export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.85;
const IMAGE_TYPES = ["image/jpeg", "image/png"];
export const ALLOWED_TYPES = ["application/pdf", ...IMAGE_TYPES];
const MAX_DECODE_BYTES = 60 * 1024 * 1024; // oltre, non proviamo nemmeno a decodificare

/** Dimensioni ridotte mantenendo le proporzioni (pura, testabile). */
export function fitWithin(w, h, max = MAX_SIDE) {
  if (!(w > 0 && h > 0)) return null;
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* opzione non supportata */ }
    try { return await createImageBitmap(file); } catch { /* formato non decodificabile così */ }
  }
  // ripiego: <img> (i browser attuali applicano l'orientamento EXIF da soli)
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Foto ridotta (File JPEG) oppure l'originale. Mai lancia. */
export async function shrinkImage(file) {
  if (!IMAGE_TYPES.includes(file?.type) || file.size > MAX_DECODE_BYTES) return file;
  try {
    const src = await decode(file);
    const w = src.width || src.naturalWidth;
    const h = src.height || src.naturalHeight;
    const size = fitWithin(w, h);
    if (!size) return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // PNG trasparente → sfondo bianco, non nero
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(src, 0, 0, size.width, size.height);
    if (typeof src.close === "function") src.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || "foto").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function postJson(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (r.status === 429) throw new Error(j?.error || "Troppe richieste in poco tempo. Riprova tra qualche minuto.");
  if (!r.ok || !j?.ok) throw new Error(j?.error || `Caricamento non riuscito (${r.status}).`);
  return j;
}

/**
 * Carica un documento. `onStage("riduco"|"carico"|"salvo")`, `onProgress(0-100)`.
 * @returns {Promise<{ok: true}>} o lancia un Error col messaggio per la persona
 */
export async function uploadHrFile(token, kind, original, { onStage, onProgress } = {}) {
  if (!ALLOWED_TYPES.includes(original?.type)) throw new Error("Formato non ammesso: solo PDF, JPG o PNG.");
  onStage?.("riduco");
  const file = await shrinkImage(original);
  if (file.size > UPLOAD_MAX_BYTES) throw new Error("File troppo grande: massimo 20 MB.");
  const base = `/api/hr/modulo/${encodeURIComponent(token)}`;
  const slot = await postJson(`${base}/upload`, { type: "slot", kind, contentType: file.type, size: file.size });
  onStage?.("carico");
  const { upload } = await import("@vercel/blob/client");
  try {
    await upload(slot.pathname, file, {
      access: "private",
      handleUploadUrl: `${base}/upload`,
      clientPayload: kind,
      contentType: file.type,
      onUploadProgress: (e) => onProgress?.(Math.round(e?.percentage || 0)),
    });
  } catch (e) {
    const m = String(e?.message || "");
    if (/too large|size/i.test(m)) throw new Error("File troppo grande: massimo 20 MB.");
    if (/content type|contentType/i.test(m)) throw new Error("Formato non ammesso: solo PDF, JPG o PNG.");
    throw new Error("Caricamento interrotto. Controlla la connessione e riprova.");
  }
  onStage?.("salvo");
  await postJson(`${base}/file`, { kind, pathname: slot.pathname });
  return { ok: true };
}
