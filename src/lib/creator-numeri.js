/**
 * Scheda numeri della creator — KV + Blob privato (19/11/2026). Regole in creator-numeri-core.js.
 *
 * KV:
 *   numeri:{token}            scheda: chi l'ha creata, per chi, risposte, invio (JSON)
 *   numeri:index              ZSET token → creata il (ms)
 *   numeri:files:{token}      HASH pathname → { step, contentType, size, at } (un campo per file:
 *                             due caricamenti insieme non si pestano i piedi)
 *   numeri:slot:{pathname}    caricamento concesso (token, passo), 2 ore
 *   numeri:slots:{token}      contatore dei caricamenti chiesti
 *
 * Blob privato (`BLOB_READ_WRITE_TOKEN`, come il modulo HR): `creator-numeri/<casuale>.jpg|png`.
 * Gli screenshot RESTANO nel Blob finché la scheda esiste: si leggono solo passando dalle route
 * (della creator col suo link, o dell'app con SCOUTING_USE). Cancellare la scheda li cancella.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import {
  TOKEN_RE, LINK_TTL_DAYS, MAX_FILES_PER_TOKEN, MAX_SLOTS_PER_TOKEN, UPLOAD_MAX_BYTES, UPLOAD_SLOT_TTL_S,
  sanitizeAnswers, missingForSubmit, linkState, firstRead, newUploadPathname, isUploadPathname, checkUploadRequest, sniffImage,
} from "./creator-numeri-core.js";

const K = {
  rec: (t) => `numeri:${t}`,
  index: "numeri:index",
  files: (t) => `numeri:files:${t}`,
  slot: (p) => `numeri:slot:${p}`,
  slots: (t) => `numeri:slots:${t}`,
};
const sdk = async () => globalThis.__numeriFakeBlob || (await import("@vercel/blob"));
export const blobConfigured = () => Boolean(globalThis.__numeriFakeBlob || process.env.BLOB_READ_WRITE_TOKEN);
const parse = (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

export const validToken = (t) => TOKEN_RE.test(String(t || ""));

export async function getRecord(token) {
  if (!validToken(token)) return null;
  return parse(await kv.get(K.rec(token)));
}
async function putRecord(rec) {
  await kv.set(K.rec(rec.token), rec);
}

export async function listFiles(token) {
  if (!validToken(token)) return [];
  const h = (await kv.hgetall(K.files(token))) || {};
  return Object.entries(h).map(([pathname, v]) => ({ pathname, ...(parse(v) || {}) })).filter((f) => f.step);
}

// ── Lato app ────────────────────────────────────────────────────────────────
export async function createLink({ name, note, by }, now = Date.now()) {
  const token = randomBytes(16).toString("hex");
  const rec = {
    token, name: String(name || "").trim().slice(0, 80), note: String(note || "").trim().slice(0, 300),
    createdBy: by || null, createdAt: now, expiresAt: now + LINK_TTL_DAYS * 86400000,
    answers: {}, updatedAt: null, submittedAt: null, openedAt: null,
  };
  await putRecord(rec);
  await kv.zadd(K.index, { score: now, member: token });
  return rec;
}

export async function listLinks() {
  const tokens = (await kv.zrange(K.index, 0, -1, { rev: true })) || [];
  if (!tokens.length) return [];
  const recs = await kv.mget(...tokens.map(K.rec));
  const counts = await Promise.all(tokens.map((t) => kv.hlen(K.files(t)).catch(() => 0)));
  return tokens.map((t, i) => {
    const r = parse(recs[i]);
    if (!r) return null;
    return {
      token: t, name: r.name, note: r.note, createdBy: r.createdBy, createdAt: r.createdAt, expiresAt: r.expiresAt,
      openedAt: r.openedAt, updatedAt: r.updatedAt, submittedAt: r.submittedAt,
      stageName: r.answers?.stageName || null, state: linkState(r), files: Number(counts[i] || 0),
      call: firstRead(r.answers).call,
    };
  }).filter(Boolean);
}

/** Riapre una scheda inviata (per far aggiungere qualcosa) e allunga il link. */
export async function reopenLink(token, now = Date.now()) {
  const rec = await getRecord(token);
  if (!rec) return null;
  rec.submittedAt = null;
  rec.expiresAt = Math.max(Number(rec.expiresAt || 0), now + 7 * 86400000);
  await putRecord(rec);
  return rec;
}

export async function deleteLink(token) {
  if (!validToken(token)) return false;
  const files = await listFiles(token);
  if (files.length && blobConfigured()) {
    const { del } = await sdk();
    await del(files.map((f) => f.pathname)).catch(() => {});
  }
  await Promise.all([kv.del(K.rec(token)), kv.del(K.files(token)), kv.del(K.slots(token)), kv.zrem(K.index, token)]);
  return true;
}

// ── Lato creator (il token è l'auth) ───────────────────────────────────────
export async function openForCreator(token, now = Date.now()) {
  const rec = await getRecord(token);
  const state = linkState(rec, now);
  if (state === "invalid") return { state };
  if (!rec.openedAt) { rec.openedAt = now; await putRecord(rec); }
  const files = (await listFiles(token)).map(({ pathname, step, at }) => ({ pathname, step, at }));
  return { state, answers: rec.answers || {}, files, name: rec.name || "", expiresAt: rec.expiresAt, submittedAt: rec.submittedAt, uploads: blobConfigured() };
}

export async function saveAnswers(token, answers, now = Date.now()) {
  const rec = await getRecord(token);
  const state = linkState(rec, now);
  if (state !== "open") return { ok: false, ...stateError(state) };
  rec.answers = sanitizeAnswers(answers);
  rec.updatedAt = now;
  await putRecord(rec);
  return { ok: true };
}

export async function submit(token, answers, now = Date.now()) {
  const rec = await getRecord(token);
  const state = linkState(rec, now);
  if (state !== "open") return { ok: false, ...stateError(state) };
  const clean = sanitizeAnswers(answers);
  const missing = missingForSubmit(clean);
  if (missing.length) return { ok: false, status: 422, error: missing[0].msg, missing };
  rec.answers = clean;
  rec.updatedAt = now;
  rec.submittedAt = now;
  await putRecord(rec);
  return { ok: true };
}

function stateError(state) {
  if (state === "submitted") return { status: 409, error: "Hai già inviato la scheda. Se vuoi aggiungere qualcosa scrivi a chi ti ha mandato il link." };
  if (state === "expired") return { status: 410, error: "Questo link è scaduto. Chiedine uno nuovo a chi te l'ha mandato." };
  return { status: 404, error: "Link non valido." };
}

/** Passo 1: dove caricare. Il pathname lo decide il server (casuale) e resta legato al link. */
export async function requestSlot(token, { step, contentType, size } = {}, now = Date.now()) {
  const rec = await getRecord(token);
  const state = linkState(rec, now);
  if (state !== "open") return { ok: false, ...stateError(state) };
  if (!blobConfigured()) return { ok: false, status: 503, error: "Il caricamento non è attivo in questo momento. Riprova più tardi." };
  const files = await listFiles(token);
  const bad = checkUploadRequest({ step, contentType, size }, files.filter((f) => f.step === step).length);
  if (bad) return { ok: false, ...bad };
  if (files.length >= MAX_FILES_PER_TOKEN) return { ok: false, status: 429, error: "Hai già caricato il numero massimo di screenshot." };
  const n = await kv.incr(K.slots(token));
  if (n === 1) await kv.expire(K.slots(token), LINK_TTL_DAYS * 86400);
  if (n > MAX_SLOTS_PER_TOKEN) return { ok: false, status: 429, error: "Troppi caricamenti. Scrivi a chi ti ha mandato il link." };
  const pathname = newUploadPathname(randomBytes(16).toString("hex"), contentType);
  await kv.set(K.slot(pathname), { token, step, contentType, at: now }, { ex: UPLOAD_SLOT_TTL_S });
  return { ok: true, pathname };
}

/** Passo 2 (onBeforeGenerateToken): il token del Blob esiste solo per uno slot di questo link. */
export async function authorizeBlobUpload(token, pathname, now = Date.now()) {
  if (!isUploadPathname(pathname)) return { error: { status: 400, error: "Caricamento non valido." } };
  const rec = await getRecord(token);
  const state = linkState(rec, now);
  if (state !== "open") return { error: stateError(state) };
  const slot = await kv.get(K.slot(pathname));
  if (!slot || slot.token !== token) return { error: { status: 403, error: "Caricamento non autorizzato." } };
  return {
    options: {
      allowedContentTypes: [slot.contentType],
      maximumSizeInBytes: UPLOAD_MAX_BYTES,
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: now + 15 * 60 * 1000,
    },
  };
}

async function readBlob(pathname, maxBytes = UPLOAD_MAX_BYTES) {
  const { get } = await sdk();
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const chunks = [];
  let total = 0;
  const reader = r.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw Object.assign(new Error("troppo grande"), { tooBig: true }); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Passo 3: il browser dice «caricato». Si controllano i byte veri e si registra il file. */
export async function confirmUpload(token, pathname, now = Date.now()) {
  if (!isUploadPathname(pathname)) return { ok: false, status: 400, error: "Richiesta non valida." };
  const slot = await kv.get(K.slot(pathname));
  if (!slot || slot.token !== token) return { ok: false, status: 404, error: "Caricamento non trovato: riprova." };
  let bytes;
  try { bytes = await readBlob(pathname); } catch (e) {
    if (e?.tooBig) { await removeBlob(pathname); return { ok: false, status: 413, error: "File troppo grande (massimo 15 MB)." }; }
    return { ok: false, status: 502, error: "Non riesco a leggere il file appena caricato. Riprova tra poco." };
  }
  if (!bytes?.length) return { ok: false, status: 404, error: "Il file non è arrivato: riprova." };
  const sniff = sniffImage(bytes);
  if (!sniff) { await removeBlob(pathname); return { ok: false, status: 415, error: "Carica una foto o uno screenshot (JPG o PNG)." }; }
  const file = { step: slot.step, contentType: sniff.type, size: bytes.length, at: now };
  await kv.hset(K.files(token), { [pathname]: JSON.stringify(file) });
  const rec = await getRecord(token);
  if (rec) { rec.updatedAt = now; await putRecord(rec); }
  return { ok: true, file: { pathname, step: slot.step, at: now } };
}

async function removeBlob(pathname) {
  try { const { del } = await sdk(); await del(pathname); } catch { /* la pulizia non blocca */ }
}

export async function removeUpload(token, pathname, now = Date.now()) {
  const rec = await getRecord(token);
  const state = linkState(rec, now);
  if (state !== "open") return { ok: false, ...stateError(state) };
  if (!isUploadPathname(pathname)) return { ok: false, status: 400, error: "Richiesta non valida." };
  const had = await kv.hdel(K.files(token), pathname);
  if (had) await removeBlob(pathname);
  return { ok: true };
}

/** Byte di uno screenshot di QUESTO link (null se non gli appartiene). */
export async function readOwnFile(token, pathname) {
  if (!validToken(token) || !isUploadPathname(pathname)) return null;
  const meta = parse(await kv.hget(K.files(token), pathname));
  if (!meta) return null;
  const bytes = await readBlob(pathname).catch(() => null);
  if (!bytes) return null;
  return { bytes, contentType: meta.contentType || "image/jpeg" };
}
