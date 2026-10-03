/**
 * Centro HR — documenti dal modulo pubblico via Vercel Blob privato (03/10/2026).
 *
 * Perché: il corpo di una funzione Vercel è limitato a ~4,5 MB (413 sopra) e il
 * modulo deve reggere 300 persone, anche tutte insieme. Il file va dal browser
 * DIRETTO al Blob privato (regione fra1), poi il server lo copia come allegato del
 * task ClickUp e lo CANCELLA subito. In app resta solo il riferimento.
 *
 * KV:
 *   hr:upload:slot:{pathname}   slot concesso (token, scheda, tipo), 2 ore
 *   hr:upload:done:{pathname}   file già preso in carico (idempotenza), 2 ore
 *   hr:upload:slots:{token}     contatore slot per token · hr:upload:files:{token} file arrivati
 *   hr:upload:pending           HASH pathname → elemento in coda (ClickUp giù o task non ancora creato)
 *   hr:upload:failed            LIST dei file abbandonati (cap 100), avviso in /admin/hr/sync
 *   hr:drain:lock               una sola ripresa in background alla volta
 *
 * Regole:
 *  - il link condiviso NON carica file (solo il token figlio o un link personale già inviato);
 *  - il pathname lo decide il server: casuale, nessun dato personale (il nome della
 *    persona compare solo nel nome dell'allegato su ClickUp, come prima);
 *  - ClickUp 429/5xx o task non ancora creato → il blob NON si cancella, va in coda,
 *    alla persona si dice "ricevuto". La coda si svuota con `after()` alla fine delle
 *    richieste del modulo e nella riconciliazione notturna;
 *  - dopo QUEUE_MAX_ATTEMPTS tentativi o 7 giorni il file si abbandona: storico della
 *    scheda + avviso; il blob si cancella (un documento d'identità non resta nel transito);
 *  - di notte si cancellano i blob più vecchi di 24 ore che non sono in coda.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { sniffFileType } from "./hr-people-core.js";
import {
  UPLOAD_MAX_BYTES_V2, UPLOAD_SLOT_TTL_S, MAX_SLOTS_PER_TOKEN, MAX_FILES_PER_TOKEN,
  newUploadPathname, isUploadPathname, checkUploadRequest, nextAttemptDelayMs, isRetryableUploadError,
  shouldGiveUp, dueItems, orphanBlobs,
} from "./hr-uploads-core.js";
import { blobConfigured, readUploadBlob, deleteUploadBlob, listUploadBlobs } from "./hr-blob.js";
import {
  getFormRecord, getPerson, appendLog, pushPersonSafe, listSyncRetry, markSyncRetry, setPersonFileRef,
  attachmentName, uploadsEnabled, UPLOAD_KIND, hrSyncConfig,
} from "./hr-people.js";
import { formTokenState } from "./hr-people-core.js";
import { uploadAttachment, isTaskGone } from "./clickup-hr-api.js";

const K = {
  slot: (p) => `hr:upload:slot:${p}`,
  done: (p) => `hr:upload:done:${p}`,
  slots: (t) => `hr:upload:slots:${t}`,
  files: (t) => `hr:upload:files:${t}`,
  queue: "hr:upload:pending",
  failed: "hr:upload:failed",
  drainLock: "hr:drain:lock",
  itemLock: (p) => `hr:upload:lock:${p}`,
};
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const parseItem = (v) => (typeof v === "string" ? safeJson(v) : v && typeof v === "object" ? v : null);

// ── Token del modulo ────────────────────────────────────────────────────────
async function uploadableRecord(token, now) {
  const rec = await getFormRecord(token);
  // il link condiviso non porta a nessuna scheda: i file passano solo dal token figlio
  if (rec?.shared) return { error: { status: 403, error: "Con questo link i documenti si caricano subito dopo l'invio del modulo." } };
  const state = formTokenState(rec, now);
  if (state === "invalid") return { error: { status: 404, error: "Link non valido." } };
  if (state !== "submitted") return { error: { status: state === "open" ? 409 : 410, error: state === "open" ? "Prima invia il modulo, poi i file." : "Il tempo per caricare i file è scaduto." } };
  if (!rec.personId) return { error: { status: 404, error: "Scheda non trovata." } };
  return { rec };
}

/**
 * Passo 1: il browser chiede dove caricare. Il server decide il pathname (casuale)
 * e lo lega a questo token, a questa scheda e a questo tipo di documento.
 */
export async function requestUploadSlot(token, { kind, contentType, size } = {}, { now = Date.now() } = {}) {
  const bad = checkUploadRequest({ kind, contentType, size }, UPLOAD_KIND);
  if (bad) return { ok: false, ...bad };
  const { rec, error } = await uploadableRecord(token, now);
  if (error) return { ok: false, ...error };
  if (!uploadsEnabled()) return { ok: false, status: 503, error: "Il caricamento dei documenti non è attivo in questo momento." };
  const files = Number((await kv.get(K.files(token))) || 0);
  if (files >= MAX_FILES_PER_TOKEN) return { ok: false, status: 429, error: "Hai già caricato il numero massimo di file." };
  const n = await kv.incr(K.slots(token));
  if (n === 1) await kv.expire(K.slots(token), UPLOAD_SLOT_TTL_S);
  if (n > MAX_SLOTS_PER_TOKEN) return { ok: false, status: 429, error: "Troppi tentativi di caricamento. Scrivi a chi ti ha mandato il link." };
  const pathname = newUploadPathname(randomBytes(16).toString("hex"), contentType);
  await kv.set(K.slot(pathname), { token, personId: rec.personId, kind, contentType, size: Number(size), at: now }, { ex: UPLOAD_SLOT_TTL_S });
  return { ok: true, pathname, maxBytes: UPLOAD_MAX_BYTES_V2 };
}

/**
 * Passo 2 (onBeforeGenerateToken di handleUpload): il token di upload del Blob si
 * genera SOLO per uno slot di questo token, entro la finestra dei file.
 * @returns opzioni per il token, o { error }
 */
export async function authorizeBlobUpload(token, pathname, { now = Date.now() } = {}) {
  if (!isUploadPathname(pathname)) return { error: { status: 400, error: "Caricamento non valido." } };
  const { error } = await uploadableRecord(token, now);
  if (error) return { error };
  const slot = await kv.get(K.slot(pathname));
  if (!slot || slot.token !== token) return { error: { status: 403, error: "Caricamento non autorizzato." } };
  if (await kv.get(K.done(pathname))) return { error: { status: 409, error: "File già caricato." } };
  return {
    options: {
      allowedContentTypes: [slot.contentType],
      maximumSizeInBytes: UPLOAD_MAX_BYTES_V2,
      addRandomSuffix: false,  // il pathname è già casuale e deciso dal server
      allowOverwrite: false,
      validUntil: now + 15 * 60 * 1000,
    },
  };
}

// ── Passo 3: dal Blob a ClickUp ─────────────────────────────────────────────
/**
 * Il browser dice "ho caricato". Il server legge il blob, verifica i byte veri,
 * lo allega al task e cancella il blob. Se ClickUp non c'è → coda, "ricevuto".
 */
export async function receiveUpload(token, { kind, pathname } = {}, { now = Date.now(), defer = false } = {}) {
  if (!UPLOAD_KIND[kind] || !isUploadPathname(pathname)) return { ok: false, status: 400, error: "Richiesta non valida." };
  const rec = await getFormRecord(token);
  if (rec?.shared) return { ok: false, status: 403, error: "Con questo link i documenti si caricano subito dopo l'invio del modulo." };
  // la finestra si è controllata al momento dello slot: qui basta lo slot di questo token
  const slot = await kv.get(K.slot(pathname));
  if (!slot || slot.token !== token || slot.kind !== kind) return { ok: false, status: 404, error: "Caricamento non trovato: riprova." };
  if (await kv.get(K.done(pathname))) return { ok: true, received: true };
  let bytes;
  try {
    bytes = await readUploadBlob(pathname);
  } catch (e) {
    if (e?.tooBig) { await deleteUploadBlob(pathname).catch(() => {}); return { ok: false, status: 413, error: "File troppo grande (massimo 50 MB)." }; }
    return { ok: false, status: 502, error: "Non riesco a leggere il file appena caricato. Riprova tra poco." };
  }
  if (!bytes?.length) return { ok: false, status: 404, error: "Il file non è arrivato: riprova a caricarlo." };
  const sniff = sniffFileType(bytes);
  if (!sniff) {
    await deleteUploadBlob(pathname).catch(() => {});
    return { ok: false, status: 415, error: "Formato non ammesso: solo PDF, JPG o PNG." };
  }
  // presa in carico una volta sola (doppio clic, rete che ripete la richiesta)
  const claimed = await kv.set(K.done(pathname), now, { nx: true, ex: UPLOAD_SLOT_TTL_S });
  if (!claimed) return { ok: true, received: true };
  const files = await kv.incr(K.files(token));
  if (files === 1) await kv.expire(K.files(token), UPLOAD_SLOT_TTL_S);
  if (files > MAX_FILES_PER_TOKEN) {
    await deleteUploadBlob(pathname).catch(() => {});
    return { ok: false, status: 429, error: "Hai già caricato il numero massimo di file." };
  }
  const item = { pathname, personId: slot.personId, kind, ext: sniff.ext, contentType: sniff.type, size: bytes.length, attempts: 0, firstAt: now, nextAt: now };
  if (defer) {
    // la route risponde subito "ricevuto" e copia dopo la risposta (after): l'elemento è
    // già in coda, quindi se il giro dopo la risposta non avviene lo riprende la coda
    await kv.hset(K.queue, { [pathname]: JSON.stringify(item) });
    return { ok: true, received: true, deferred: { item, bytes } };
  }
  const outcome = await withItemLock(pathname, () => transferItem(item, bytes, { now }));
  return { ok: true, received: true, queued: outcome !== "done" };
}

/** Copia su ClickUp di un file appena preso in carico (dopo la risposta, `after()`). */
export async function transferDeferred(deferred) {
  if (!deferred?.item) return null;
  return withItemLock(deferred.item.pathname, async () => {
    const still = parseItem(await kv.hget(K.queue, deferred.item.pathname));
    if (!still) return "done"; // già fatto da un altro giro
    return transferItem(still, deferred.bytes, { now: Date.now() });
  });
}

/** Un solo giro alla volta per lo stesso file (copia dopo la risposta, coda, notte). */
async function withItemLock(pathname, fn) {
  const got = await kv.set(K.itemLock(pathname), Date.now(), { nx: true, ex: 120 }).catch(() => "OK");
  if (!got) return "busy";
  try { return await fn(); } finally { await kv.del(K.itemLock(pathname)).catch(() => {}); }
}

/** Un tentativo verso ClickUp. → "done" | "queued" | "failed" */
async function transferItem(item, bytes, { now = Date.now() } = {}) {
  const person = await getPerson(item.personId);
  if (!person) return giveUp(item, "scheda non trovata", { now, log: false });
  if (person.archived) return giveUp(item, "scheda archiviata", { now });
  if (!hrSyncConfig().enabled) return requeue(item, "sincronizzazione ClickUp spenta", { now, count: false });
  if (!person.clickupTaskId) {
    await markSyncRetry(person.id); // il task lo crea la ripresa delle schede (mai qui: niente task doppi)
    return requeue(item, "task ClickUp non ancora creato", { now });
  }
  let res;
  try {
    res = await uploadAttachment(person.clickupTaskId, { filename: attachmentName(person, item.kind, item.ext), bytes, contentType: item.contentType });
  } catch (e) {
    if (isTaskGone(e)) return giveUp(item, "il task ClickUp non esiste più", { now });
    if (isRetryableUploadError(e)) return requeue(item, e?.message || "ClickUp non raggiungibile", { now });
    return giveUp(item, e?.message || "ClickUp ha rifiutato il file", { now });
  }
  await setPersonFileRef(person.id, item.kind, { title: attachmentName(person, item.kind, item.ext), attachmentId: res?.id, at: Date.now() });
  await kv.hdel(K.queue, item.pathname).catch(() => {});
  // se la cancellazione fallisce, la pulizia notturna lo toglie (non è più in coda)
  await deleteUploadBlob(item.pathname).catch(() => {});
  return "done";
}

async function requeue(item, reason, { now, count = true }) {
  const attempts = (item.attempts || 0) + (count ? 1 : 0);
  const next = { ...item, attempts, nextAt: now + nextAttemptDelayMs(Math.max(1, attempts)), lastError: String(reason).slice(0, 200), lastAt: now };
  if (shouldGiveUp(next, now)) return giveUp(next, reason, { now });
  await kv.hset(K.queue, { [item.pathname]: JSON.stringify(next) });
  return "queued";
}

async function giveUp(item, reason, { now, log = true }) {
  await kv.hdel(K.queue, item.pathname).catch(() => {});
  // un documento d'identità non deve restare nel transito: si cancella e si chiede di ricaricarlo
  await deleteUploadBlob(item.pathname).catch(() => {});
  const title = UPLOAD_KIND[item.kind]?.title || "File";
  await kv.lpush(K.failed, JSON.stringify({ at: now, personId: item.personId, kind: item.kind, attempts: item.attempts || 0, firstAt: item.firstAt, reason: String(reason).slice(0, 200) }));
  await kv.ltrim(K.failed, 0, 99);
  if (log) {
    await appendLog(item.personId, [{
      at: now, by: "sistema", source: "sistema", action: "upload_failed", field: UPLOAD_KIND[item.kind]?.key || null,
      to: `${title} non arrivato su ClickUp dopo ${item.attempts || 0} tentativi (${String(reason).slice(0, 120)}): chiedi alla persona di ricaricarlo`,
    }]).catch(() => {});
  }
  return "failed";
}

// ── Coda e ripresa in background ─────────────────────────────────────────────
async function queueItems() {
  const h = (await kv.hgetall(K.queue)) || {};
  return Object.values(h).map(parseItem).filter(Boolean);
}

/** Svuota la coda dei file (al massimo `maxItems`, entro `budgetMs`). Senza lucchetto: lo prende chi chiama. */
async function drainUploadQueueUnlocked({ budgetMs, maxItems, now = Date.now() }) {
  const deadline = Date.now() + budgetMs;
  const stats = { done: 0, queued: 0, failed: 0 };
  const items = dueItems(await queueItems(), now).slice(0, maxItems);
  for (const item of items) {
    if (Date.now() >= deadline) break;
    const outcome = await withItemLock(item.pathname, async () => {
      if (shouldGiveUp(item, now)) return giveUp(item, item.lastError || "troppi tentativi", { now });
      let bytes = null;
      try { bytes = await readUploadBlob(item.pathname); } catch { bytes = null; }
      if (!bytes) return giveUp(item, "file non più disponibile nel transito", { now });
      return transferItem(item, bytes, { now });
    });
    stats[outcome] = (stats[outcome] || 0) + 1;
  }
  return stats;
}

/** Schede con scritture ClickUp in sospeso (task da creare, campi non spinti). */
async function drainPeopleUnlocked({ budgetMs, maxPeople, now = Date.now() }) {
  const deadline = Date.now() + budgetMs;
  const stats = { pushed: 0, skipped: 0 };
  if (!hrSyncConfig().enabled) return stats;
  const ids = await listSyncRetry();
  for (const id of ids.slice(0, maxPeople * 3)) {
    if (stats.pushed >= maxPeople || Date.now() >= deadline) break;
    const p = await getPerson(id);
    if (!p || p.archived) { await kv.srem("hr:sync:retry", id).catch(() => {}); continue; }
    // appena tentata (meno di 20 s fa, es. dal giro dopo l'invio): la si lascia stare
    if (p.sync?.at && now - p.sync.at < 20_000 && p.sync.status !== "pending") { stats.skipped += 1; continue; }
    await pushPersonSafe(p, p.clickupTaskId ? p.pendingKeys || [] : null, { actor: "sistema" });
    stats.pushed += 1;
  }
  return stats;
}

/**
 * Ripresa in background (dopo la risposta, con `after()`): poche schede e pochi
 * file per volta, budget di tempo, una sola ripresa alla volta in tutta l'app
 * (50 invii nello stesso minuto = 1 ripresa che lavora, le altre escono subito).
 */
export async function drainHrBackground({ budgetMs = 8000, maxPeople = 3, maxItems = 3 } = {}) {
  const got = await kv.set(K.drainLock, Date.now(), { nx: true, ex: Math.ceil(budgetMs / 1000) + 30 }).catch(() => null);
  if (!got) return { skipped: "busy" };
  try {
    const half = Math.floor(budgetMs / 2);
    const people = await drainPeopleUnlocked({ budgetMs: half, maxPeople });
    const files = blobConfigured() ? await drainUploadQueueUnlocked({ budgetMs: budgetMs - half, maxItems }) : null;
    return { people, files };
  } catch (e) {
    return { error: e?.message || "errore" };
  } finally {
    await kv.del(K.drainLock).catch(() => {});
  }
}

/** Notte: tutta la coda dei file che entra nel budget (le schede le fa già la riconciliazione). */
export async function drainUploadQueue({ budgetMs = 10_000, maxItems = 200 } = {}) {
  if (!blobConfigured()) return { skipped: "blob-off" };
  const got = await kv.set(K.drainLock, Date.now(), { nx: true, ex: Math.ceil(budgetMs / 1000) + 30 }).catch(() => null);
  if (!got) return { skipped: "busy" };
  try {
    return await drainUploadQueueUnlocked({ budgetMs, maxItems });
  } finally {
    await kv.del(K.drainLock).catch(() => {});
  }
}

/** Notte: cancella dal Blob i file più vecchi di 24 ore che non sono in coda. */
export async function cleanupOrphanUploads({ now = Date.now() } = {}) {
  if (!blobConfigured()) return { skipped: "blob-off" };
  const [blobs, h] = await Promise.all([listUploadBlobs(), kv.hgetall(K.queue)]);
  const toDelete = orphanBlobs(blobs, Object.keys(h || {}), now);
  for (let i = 0; i < toDelete.length; i += 100) await deleteUploadBlob(toDelete.slice(i, i + 100));
  return { deleted: toDelete.length, seen: blobs.length };
}

// ── Stato per l'admin ───────────────────────────────────────────────────────
/** File in coda di una scheda (per "Documento in arrivo"). */
export async function pendingUploadsFor(personId) {
  const items = await queueItems().catch(() => []);
  return items.filter((it) => it.personId === personId).map((it) => ({ kind: it.kind, key: UPLOAD_KIND[it.kind]?.key, since: it.firstAt, attempts: it.attempts || 0 }));
}

/** Per /admin/hr/sync: coda dei file e file abbandonati negli ultimi 30 giorni. */
export async function uploadQueueStatus({ now = Date.now() } = {}) {
  const [items, failedRaw] = await Promise.all([queueItems().catch(() => []), kv.lrange(K.failed, 0, 49).catch(() => [])]);
  const failed = (failedRaw || []).map(parseItem).filter((x) => x && now - x.at < 30 * 24 * 3600 * 1000);
  return {
    blob: blobConfigured(),
    pending: items.length,
    oldestAt: items.length ? Math.min(...items.map((i) => i.firstAt || now)) : null,
    failed,
  };
}
