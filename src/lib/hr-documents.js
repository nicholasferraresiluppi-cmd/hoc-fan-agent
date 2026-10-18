/**
 * Documenti della persona (18/10/2026) — lettura e caricamento sul task ClickUp. Solo server.
 * Regole e motivo in hr-documents-core.js. Ogni apertura e ogni caricamento va nello storico
 * della scheda (dati personali: chi ha aperto il documento di chi, e quando).
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { getTask, uploadAttachment, ClickupError } from "./clickup-hr-api.js";
import { UPLOAD_TYPES, UPLOAD_MAX_BYTES_V2, newUploadPathname, isUploadPathname } from "./hr-uploads-core.js";
import { blobConfigured, readUploadBlob, deleteUploadBlob } from "./hr-blob.js";
import { collectAttachments } from "./hr-documents-core.js";
import { appendLog } from "./hr-people.js";
import { sniffFileType } from "./hr-people-core.js";

// caricamento diretto (senza Blob, es. in locale): il corpo di una funzione Vercel si ferma a ~4,5 MB
export const APP_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
// con il Blob (produzione) lo stesso tetto del modulo: 50 MB
export { UPLOAD_MAX_BYTES_V2 as BLOB_UPLOAD_MAX_BYTES, blobConfigured };
const SLOT_KEY = (pathname) => `hr:upload:adminslot:${pathname}`;
const SLOT_TTL_S = 2 * 3600;
const CLICKUP_FILE_HOST = /(^|\.)clickup(-attachments)?\.com$|(^|\.)clickupusercontent\.com$/;

/** { documents, taskUrl } o { documents: [], reason } se la scheda non ha un task. */
export async function listPersonDocuments(person) {
  if (!person?.clickupTaskId) return { documents: [], reason: "La scheda non è ancora collegata a un task ClickUp." };
  const task = await getTask(person.clickupTaskId);
  return { documents: collectAttachments(task).map((x) => x.row), taskUrl: task?.url || person.clickupUrl || null };
}

/** Apre il file: risposta in streaming (il file non passa da KV né resta sul server). */
export async function openPersonDocument(person, attachmentId, { actor } = {}) {
  if (!person?.clickupTaskId) return null;
  const task = await getTask(person.clickupTaskId);
  const hit = collectAttachments(task).find((x) => x.row.id === String(attachmentId));
  if (!hit) return null;
  const url = new URL(String(hit.raw.url || hit.raw.url_w_query || ""));
  if (!CLICKUP_FILE_HOST.test(url.hostname)) throw new ClickupError(`allegato fuori da ClickUp (${url.hostname})`, 0);
  const res = await fetch(url, { headers: { Authorization: process.env.CLICKUP_API_TOKEN || "" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok || !res.body) throw new ClickupError(`ClickUp ${res.status} aprendo il documento`, res.status);
  await appendLog(person.id, [{ at: Date.now(), by: actor || "sistema", source: "app", action: "doc_opened", field: null, from: null, to: hit.row.title }]).catch(() => {});
  return { body: res.body, contentType: res.headers.get("content-type") || hit.raw.mimetype || "application/octet-stream", length: res.headers.get("content-length"), row: hit.row };
}

/** Carica un file dalla scheda come allegato del task. Solo PDF, JPG, PNG (stessa regola del modulo). */
export async function uploadPersonDocument(person, { filename, bytes }, { actor, maxBytes = APP_UPLOAD_MAX_BYTES } = {}) {
  if (!person?.clickupTaskId) return { ok: false, status: 409, error: "La scheda non è ancora collegata a un task ClickUp." };
  if (!bytes?.length) return { ok: false, status: 400, error: "File vuoto." };
  if (bytes.length > maxBytes) return { ok: false, status: 413, error: `File oltre ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  const kind = sniffFileType(bytes);
  if (!kind) return { ok: false, status: 415, error: "Si caricano solo PDF, JPG o PNG." };
  const base = String(filename || "documento").replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 100) || "documento";
  const name = `${base}.${kind.ext}`;
  await uploadAttachment(person.clickupTaskId, { filename: name, bytes, contentType: kind.type });
  await appendLog(person.id, [{ at: Date.now(), by: actor || "sistema", source: "app", action: "upload", field: null, from: null, to: `${name} (caricato dalla scheda su ClickUp)` }]).catch(() => {});
  return { ok: true, name };
}

// ── Caricamento grande via Blob privato (stesso canale del modulo, fino a 50 MB) ──────────────
// 1) slot: il server decide un pathname casuale e lo lega a questa scheda e a chi carica;
// 2) il browser carica DIRETTO sul Blob (token generato solo per quello slot);
// 3) finish: il server legge il blob, controlla i byte veri, lo allega al task e lo cancella.
// Un blob rimasto a metà lo cancella la pulizia notturna del modulo (stessa cartella, >24 ore).

export async function requestDocumentSlot(person, { filename, contentType, size }, { actor } = {}) {
  if (!blobConfigured()) return { ok: false, status: 503, error: "Caricamento grande non attivo qui." };
  if (!person?.clickupTaskId) return { ok: false, status: 409, error: "La scheda non è ancora collegata a un task ClickUp." };
  if (!UPLOAD_TYPES[contentType]) return { ok: false, status: 415, error: "Si caricano solo PDF, JPG o PNG." };
  if (!(Number(size) > 0) || Number(size) > UPLOAD_MAX_BYTES_V2) return { ok: false, status: 413, error: "File oltre 50 MB." };
  const pathname = newUploadPathname(randomBytes(16).toString("hex"), contentType);
  await kv.set(SLOT_KEY(pathname), { personId: person.id, actor: actor || null, filename: String(filename || "").slice(0, 160), contentType }, { ex: SLOT_TTL_S });
  return { ok: true, pathname, maxBytes: UPLOAD_MAX_BYTES_V2 };
}

/** onBeforeGenerateToken: token del Blob solo per uno slot di questa scheda e di questa persona. */
export async function authorizeDocumentBlob(personId, pathname, { actor } = {}) {
  if (!isUploadPathname(pathname)) return { error: "Caricamento non valido." };
  const slot = await kv.get(SLOT_KEY(pathname));
  if (!slot || slot.personId !== personId || (slot.actor && slot.actor !== actor)) return { error: "Caricamento non autorizzato." };
  return {
    options: {
      allowedContentTypes: [slot.contentType], maximumSizeInBytes: UPLOAD_MAX_BYTES_V2,
      addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 15 * 60 * 1000,
    },
  };
}

export async function finishDocumentUpload(person, pathname, { actor } = {}) {
  if (!isUploadPathname(pathname)) return { ok: false, status: 400, error: "Caricamento non valido." };
  const slot = await kv.get(SLOT_KEY(pathname));
  if (!slot || slot.personId !== person.id) return { ok: false, status: 403, error: "Caricamento non autorizzato o scaduto." };
  let bytes;
  try { bytes = await readUploadBlob(pathname); } catch (e) { await deleteUploadBlob(pathname).catch(() => {}); return { ok: false, status: 413, error: e?.tooBig ? "File oltre 50 MB." : "File non leggibile." }; }
  if (!bytes) return { ok: false, status: 404, error: "File non arrivato: riprova." };
  try {
    const r = await uploadPersonDocument(person, { filename: slot.filename, bytes }, { actor, maxBytes: UPLOAD_MAX_BYTES_V2 });
    return r;
  } finally {
    // il documento non resta nel transito, anche se ClickUp ha rifiutato (si ricarica)
    await deleteUploadBlob(pathname).catch(() => {});
    await kv.del(SLOT_KEY(pathname)).catch(() => {});
  }
}
