/**
 * Vercel Blob PRIVATO per gli upload del modulo HR (solo server, 03/10/2026).
 * Store in regione fra1; token `BLOB_READ_WRITE_TOKEN` (production e preview,
 * non in locale: lì il caricamento dei documenti risulta "non attivo").
 *
 * `@vercel/blob` si importa in modo dinamico: entra solo nelle funzioni che lo
 * usano. I test sostituiscono il modulo con `globalThis.__hrFakeBlob`.
 */
import { UPLOAD_MAX_BYTES_V2, UPLOAD_PREFIX } from "./hr-uploads-core.js";

const sdk = async () => globalThis.__hrFakeBlob || (await import("@vercel/blob"));

export function blobConfigured() {
  return Boolean(globalThis.__hrFakeBlob || process.env.BLOB_READ_WRITE_TOKEN);
}

/** Byte del blob privato, o null se non esiste. Lancia sopra i 20 MB. */
export async function readUploadBlob(pathname) {
  const { get } = await sdk();
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  if (Number(r.blob?.size || 0) > UPLOAD_MAX_BYTES_V2) throw Object.assign(new Error("blob troppo grande"), { tooBig: true });
  const chunks = [];
  let total = 0;
  const reader = r.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > UPLOAD_MAX_BYTES_V2) { await reader.cancel().catch(() => {}); throw Object.assign(new Error("blob troppo grande"), { tooBig: true }); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function deleteUploadBlob(pathnames) {
  const list = [].concat(pathnames || []).filter(Boolean);
  if (!list.length) return;
  const { del } = await sdk();
  await del(list);
}

/** Tutti i blob della cartella upload (paginati). */
export async function listUploadBlobs({ maxPages = 20 } = {}) {
  const { list } = await sdk();
  const out = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const r = await list({ prefix: UPLOAD_PREFIX, limit: 1000, cursor });
    out.push(...(r.blobs || []));
    if (!r.hasMore || !r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}
