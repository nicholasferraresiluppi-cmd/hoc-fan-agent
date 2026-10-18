/**
 * Documenti della persona (18/10/2026) — lettura e caricamento sul task ClickUp. Solo server.
 * Regole e motivo in hr-documents-core.js. Ogni apertura e ogni caricamento va nello storico
 * della scheda (dati personali: chi ha aperto il documento di chi, e quando).
 */
import { getTask, uploadAttachment, ClickupError } from "./clickup-hr-api.js";
import { collectAttachments } from "./hr-documents-core.js";
import { appendLog } from "./hr-people.js";
import { sniffFileType } from "./hr-people-core.js";

// il corpo di una funzione Vercel si ferma a ~4,5 MB: oltre si carica direttamente su ClickUp
export const APP_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
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
export async function uploadPersonDocument(person, { filename, bytes }, { actor } = {}) {
  if (!person?.clickupTaskId) return { ok: false, status: 409, error: "La scheda non è ancora collegata a un task ClickUp." };
  if (!bytes?.length) return { ok: false, status: 400, error: "File vuoto." };
  if (bytes.length > APP_UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: "File oltre 4 MB: caricalo direttamente sul task ClickUp, comparirà qui da solo." };
  const kind = sniffFileType(bytes);
  if (!kind) return { ok: false, status: 415, error: "Si caricano solo PDF, JPG o PNG." };
  const base = String(filename || "documento").replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 100) || "documento";
  const name = `${base}.${kind.ext}`;
  await uploadAttachment(person.clickupTaskId, { filename: name, bytes, contentType: kind.type });
  await appendLog(person.id, [{ at: Date.now(), by: actor || "sistema", source: "app", action: "upload", field: null, from: null, to: `${name} (caricato dalla scheda su ClickUp)` }]).catch(() => {});
  return { ok: true, name };
}
