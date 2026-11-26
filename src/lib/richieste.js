/**
 * Richieste alla modella — KV + Blob privato (26/11/2026). Regole in richieste-core.js.
 *
 * KV:
 *   richieste:{token}          la richiesta: creator, titolo, scadenza, riprese, giudizi (JSON)
 *   richieste:index            ZSET token → creata il (ms)
 *   richieste:files:{token}    HASH pathname → { kind, shotId, contentType, size, at } — le riprese
 *                              della modella (un campo per file: due caricamenti insieme non si pestano)
 *   richieste:slot:{pathname}  caricamento concesso (token, uso, ripresa, chi), 6 ore
 *   richieste:slots:{token}    contatore dei caricamenti chiesti
 *   richieste:sig:{pathname}   link firmato per guardare il file (50 minuti, rifatto quando scade)
 *
 * Blob privato (`BLOB_READ_WRITE_TOKEN`, come /numeri e il modulo HR):
 *   richieste/take/<casuale>.<ext>   riprese della modella (video o foto, fino a 4 GB, a pezzi)
 *   richieste/ref/<casuale>.<ext>    video/foto di riferimento caricati dall'app
 *   richieste/voce/<casuale>.<ext>   note vocali registrate nell'app
 * I file NON passano dal server: il browser li carica direttamente, e si guardano con link firmati a
 * scadenza (un link vale un solo file, alterarlo dà 403 — verificato 26/11). Cancellare la richiesta
 * cancella tutti i suoi file.
 *
 * Drive: oggi il collegamento a Drive di HOC Pro è in sola lettura (service account senza permesso di
 * scrittura, delega di dominio solo sul calendario). La copia delle riprese approvate nella cartella
 * della creator è il passo dopo, quando la delega comprenderà anche Drive.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import {
  TOKEN_RE, SHOT_ID_RE, MAX_SLOTS_PER_TOKEN, UPLOAD_SLOT_TTL_S, MAX_BYTES, UPLOAD_TYPES,
  sanitizeRequest, removedShotsWithTakes, sanitizeReviewNote, requestState, isLate, linkState, expiresFor, deadlineText,
  takesOf, shotState, reviewAllowed, canUpload, takeRemovable, redoCount, lastReview, publicShots, familyOf,
  newUploadPathname, isUploadPathname, kindOfPathname, checkUploadRequest, sniffMedia, sniffMatches,
} from "./richieste-core.js";

const K = {
  rec: (t) => `richieste:${t}`,
  index: "richieste:index",
  files: (t) => `richieste:files:${t}`,
  slot: (p) => `richieste:slot:${p}`,
  slots: (t) => `richieste:slots:${t}`,
  sig: (p) => `richieste:sig:${p}`,
};
const sdk = async () => globalThis.__richiesteFakeBlob || (await import("@vercel/blob"));
export const blobConfigured = () => Boolean(globalThis.__richiesteFakeBlob || process.env.BLOB_READ_WRITE_TOKEN);
const parse = (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
const hex = () => randomBytes(16).toString("hex");
const shotId = () => randomBytes(4).toString("hex");

export const validToken = (t) => TOKEN_RE.test(String(t || ""));

export async function getRecord(token) {
  if (!validToken(token)) return null;
  return parse(await kv.get(K.rec(token)));
}
const putRecord = (rec) => kv.set(K.rec(rec.token), rec);

export async function listFiles(token) {
  if (!validToken(token)) return [];
  const h = (await kv.hgetall(K.files(token))) || {};
  return Object.entries(h).map(([pathname, v]) => ({ pathname, ...(parse(v) || {}) })).filter((f) => f.kind);
}

async function removeBlobs(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length || !blobConfigured()) return;
  try { const { del } = await sdk(); await del(list); } catch { /* la pulizia non blocca */ }
  await Promise.all(list.map((p) => kv.del(K.sig(p)).catch(() => {})));
}

// ── Link firmati per guardare i file ───────────────────────────────────────
const SIG_TTL_S = 50 * 60;
async function signedUrl(pathname) {
  if (!isUploadPathname(pathname) || !blobConfigured()) return null;
  try {
    const { issueSignedToken, presignUrl } = await sdk();
    const tok = await issueSignedToken({ pathname, operations: ["get"], validUntil: Date.now() + 60 * 60 * 1000 });
    const { presignedUrl } = await presignUrl(tok, { operation: "get", pathname, access: "private" });
    await kv.set(K.sig(pathname), presignedUrl, { ex: SIG_TTL_S }).catch(() => {});
    return presignedUrl;
  } catch { return null; }
}
/** Link firmati per tanti file: una sola lettura KV per quelli già pronti, firma in parallelo per gli altri. */
async function signAll(paths) {
  const uniq = [...new Set(paths.filter((p) => isUploadPathname(p)))];
  if (!uniq.length || !blobConfigured()) return {};
  const cached = await kv.mget(...uniq.map(K.sig)).catch(() => uniq.map(() => null));
  const urls = await Promise.all(uniq.map((p, i) => cached[i] || signedUrl(p)));
  return Object.fromEntries(uniq.map((p, i) => [p, urls[i]]));
}

// ── Lato app (SMM) ─────────────────────────────────────────────────────────
export async function createRequest(input, by, now = Date.now()) {
  const { data, errors } = sanitizeRequest(input, { newId: shotId, now });
  if (errors.length) return { ok: false, status: 422, error: errors[0], errors };
  const token = hex();
  const rec = {
    token, ...data, reviews: {},
    createdBy: by || null, createdAt: now, updatedAt: now,
    sentAt: null, openedAt: null, lastSeenAt: null, deliveredAt: null, expiresAt: expiresFor(data.deadline),
  };
  await putRecord(rec);
  await kv.zadd(K.index, { score: now, member: token });
  return { ok: true, token };
}

export async function updateRequest(token, input, by, now = Date.now()) {
  const rec = await getRecord(token);
  if (!rec) return { ok: false, status: 404, error: "Richiesta non trovata." };
  const { data, errors } = sanitizeRequest(input, { existing: rec, newId: shotId, now });
  if (errors.length) return { ok: false, status: 422, error: errors[0], errors };
  const files = await listFiles(token);
  const blocked = removedShotsWithTakes(rec, data.shots, files);
  if (blocked.length) return { ok: false, status: 409, error: `La ripresa «${blocked[0].title}» ha già dei file della modella: non si può togliere.` };
  const keep = new Set(data.shots.map((s) => s.id));
  const gone = rec.shots.filter((s) => !keep.has(s.id));
  await removeBlobs(gone.flatMap((s) => [s.ref?.pathname, s.voice?.pathname]));
  const reviews = Object.fromEntries(Object.entries(rec.reviews || {}).filter(([id]) => keep.has(id)));
  Object.assign(rec, data, { reviews, updatedAt: now, updatedBy: by || null, expiresAt: Math.max(Number(rec.expiresAt || 0), expiresFor(data.deadline)) });
  await putRecord(rec);
  return { ok: true };
}

export async function markSent(token, now = Date.now()) {
  const rec = await getRecord(token);
  if (!rec) return { ok: false, status: 404, error: "Richiesta non trovata." };
  if (!rec.sentAt) { rec.sentAt = now; await putRecord(rec); }
  return { ok: true };
}

function summary(rec, files, now) {
  const st = requestState(rec, files);
  return {
    token: rec.token, creator: rec.creator, title: rec.title, deadline: rec.deadline,
    deadlineText: deadlineText(rec.deadline, now), late: isLate(rec, st.state, now),
    state: st.state, counts: st.counts, total: st.total, delivered: st.delivered,
    createdAt: rec.createdAt, updatedAt: rec.updatedAt, sentAt: rec.sentAt, openedAt: rec.openedAt, lastSeenAt: rec.lastSeenAt,
    lastUploadAt: files.filter((f) => f.kind === "take").reduce((m, f) => Math.max(m, Number(f.at) || 0), 0) || null,
    link: linkState(rec, now),
  };
}

export async function listRequests(now = Date.now()) {
  const tokens = (await kv.zrange(K.index, 0, -1, { rev: true })) || [];
  if (!tokens.length) return [];
  const recs = await kv.mget(...tokens.map(K.rec));
  const files = await Promise.all(tokens.map((t) => listFiles(t).catch(() => [])));
  return tokens.map((t, i) => { const r = parse(recs[i]); return r ? summary(r, files[i], now) : null; }).filter(Boolean);
}

/** Tutto per la pagina dell'app: riprese con file firmati, giudizi, quanti giri restano. */
export async function getForApp(token, now = Date.now()) {
  const [rec, files] = await Promise.all([getRecord(token), listFiles(token)]);
  if (!rec) return null;
  const urls = await signAll([...rec.shots.flatMap((s) => [s.ref?.pathname, s.voice?.pathname]), ...files.map((f) => f.pathname)]);
  const shots = rec.shots.map((s, i) => {
    const reviews = rec.reviews?.[s.id] || [];
    const takes = takesOf(files, s.id);
    const state = shotState(takes, reviews);
    const last = lastReview(reviews);
    return {
      ...s, n: i + 1, state, redoUsed: redoCount(reviews),
      ref: s.ref ? { ...s.ref, family: familyOf(s.ref.contentType), url: urls[s.ref.pathname] || null } : null,
      voice: s.voice ? { ...s.voice, url: urls[s.voice.pathname] || null } : null,
      reviews: reviews.map((r) => ({ verdict: r.verdict, note: r.note || "", at: r.at })),
      takes: takes.map((t) => ({ pathname: t.pathname, at: t.at, size: t.size, family: familyOf(t.contentType), url: urls[t.pathname] || null, name: t.name || null, new: !last || Number(t.at) > Number(last.at) })),
    };
  });
  return { ...summary(rec, files, now), note: rec.note, shots, createdBy: rec.createdBy, uploads: blobConfigured() };
}

export async function deleteRequest(token) {
  const rec = await getRecord(token);
  if (!rec) return false;
  const files = await listFiles(token);
  await removeBlobs([...files.map((f) => f.pathname), ...rec.shots.flatMap((s) => [s.ref?.pathname, s.voice?.pathname])]);
  await Promise.all([kv.del(K.rec(token)), kv.del(K.files(token)), kv.del(K.slots(token)), kv.zrem(K.index, token)]);
  return true;
}

/** Approva o chiede di rifare una ripresa (solo ciò che è arrivato dopo l'ultimo giudizio). */
export async function reviewShot(token, sid, verdict, note, by, now = Date.now()) {
  const rec = await getRecord(token);
  if (!rec) return { ok: false, status: 404, error: "Richiesta non trovata." };
  if (!SHOT_ID_RE.test(String(sid || "")) || !rec.shots.some((s) => s.id === sid)) return { ok: false, status: 404, error: "Ripresa non trovata." };
  const files = await listFiles(token);
  const reviews = rec.reviews?.[sid] || [];
  const state = shotState(takesOf(files, sid), reviews);
  const allowed = reviewAllowed(state, verdict, reviews);
  if (!allowed.ok) return { ok: false, status: 409, error: allowed.error };
  const clean = sanitizeReviewNote(note);
  if (verdict === "redo" && !clean) return { ok: false, status: 422, error: "Scrivi cosa rifare: la modella vede questa nota." };
  rec.reviews = { ...(rec.reviews || {}), [sid]: [...reviews, { verdict, note: clean, at: now, by: by || null }] };
  rec.updatedAt = now;
  const st = requestState(rec, files);
  if (st.state !== "consegnata") rec.deliveredAt = null;
  await putRecord(rec);
  return { ok: true, state: st.state };
}

/** Toglie il riferimento o la nota vocale di una ripresa (lato app). */
export async function removeShotMedia(token, sid, kind, now = Date.now()) {
  if (kind !== "ref" && kind !== "voce") return { ok: false, status: 400, error: "Richiesta non valida." };
  const rec = await getRecord(token);
  const shot = rec?.shots.find((s) => s.id === sid);
  if (!shot) return { ok: false, status: 404, error: "Ripresa non trovata." };
  const field = kind === "ref" ? "ref" : "voice";
  const old = shot[field]?.pathname;
  shot[field] = null;
  rec.updatedAt = now;
  await putRecord(rec);
  await removeBlobs(old);
  return { ok: true };
}

// ── Lato modella (il token è l'auth) ───────────────────────────────────────
const SEEN_EVERY_MS = 10 * 60 * 1000;
export async function openForModel(token, now = Date.now()) {
  if (!validToken(token)) return { link: "invalid" };
  const [rec, files] = await Promise.all([getRecord(token), listFiles(token)]);
  const link = linkState(rec, now);
  if (link === "invalid") return { link };
  if (link === "expired") return { link, title: rec.title };
  let dirty = false;
  if (!rec.openedAt) { rec.openedAt = now; dirty = true; }
  if (!rec.lastSeenAt || now - rec.lastSeenAt > SEEN_EVERY_MS) { rec.lastSeenAt = now; dirty = true; }
  const shots = publicShots(rec, files);
  const [, urls] = await Promise.all([
    dirty ? putRecord(rec) : null,
    signAll(shots.flatMap((s) => [s.ref?.pathname, s.voice?.pathname, ...s.takes.map((t) => t.pathname)])),
  ]);
  const withUrls = shots.map((s) => ({
    ...s,
    ref: s.ref ? { family: s.ref.family, url: urls[s.ref.pathname] || null } : null,
    voice: s.voice ? { url: urls[s.voice.pathname] || null } : null,
    takes: s.takes.map((t) => ({ ...t, url: urls[t.pathname] || null })),
  }));
  const st = requestState(rec, files);
  return {
    link, title: rec.title, creatorName: rec.creator?.name || "", note: rec.note || "",
    deadline: rec.deadline, deadlineText: deadlineText(rec.deadline, now),
    state: st.state, counts: st.counts, total: st.total, delivered: st.delivered,
    shots: withUrls, uploads: blobConfigured(),
  };
}

function linkError(link) {
  if (link === "expired") return { status: 410, error: "Questo link è scaduto. Chiedine uno nuovo a chi te l'ha mandato." };
  return { status: 404, error: "Link non valido." };
}

/** Toglie una ripresa della modella finché nessuno l'ha guardata. */
export async function removeTake(token, pathname, now = Date.now()) {
  const rec = await getRecord(token);
  const link = linkState(rec, now);
  if (link !== "open") return { ok: false, ...linkError(link) };
  if (!isUploadPathname(pathname) || kindOfPathname(pathname) !== "take") return { ok: false, status: 400, error: "Richiesta non valida." };
  const meta = parse(await kv.hget(K.files(token), pathname));
  if (!meta) return { ok: false, status: 404, error: "File non trovato." };
  if (!takeRemovable(meta, rec.reviews?.[meta.shotId])) return { ok: false, status: 409, error: "Questo file è già stato guardato: non si può più togliere." };
  await kv.hdel(K.files(token), pathname);
  await removeBlobs(pathname);
  return { ok: true };
}

// ── Caricamenti (comuni ai due lati) ───────────────────────────────────────
// side: "modella" (solo riprese, col link aperto) | "app" (solo riferimento e nota vocale)
const KINDS_BY_SIDE = { modella: ["take"], app: ["ref", "voce"] };

/** Passo 1: dove caricare. Il pathname lo decide il server (casuale) e resta legato alla richiesta. */
export async function requestSlot(token, { kind, shotId: sid, contentType, size } = {}, side, now = Date.now()) {
  const rec = await getRecord(token);
  if (side === "modella") {
    const link = linkState(rec, now);
    if (link !== "open") return { ok: false, ...linkError(link) };
  } else if (!rec) return { ok: false, status: 404, error: "Richiesta non trovata." };
  if (!KINDS_BY_SIDE[side]?.includes(kind)) return { ok: false, status: 400, error: "Caricamento non previsto." };
  if (!blobConfigured()) return { ok: false, status: 503, error: "Il caricamento non è attivo in questo momento. Riprova più tardi." };
  const shot = rec.shots.find((s) => s.id === sid);
  if (!shot) return { ok: false, status: 404, error: "Ripresa non trovata: ricarica la pagina." };
  const bad = checkUploadRequest({ kind, contentType, size });
  if (bad) return { ok: false, ...bad };
  if (kind === "take") {
    const files = await listFiles(token);
    const takes = takesOf(files, sid);
    const up = canUpload(shotState(takes, rec.reviews?.[sid]), takes.length);
    if (!up.ok) return { ok: false, status: 409, error: up.error };
  }
  const n = await kv.incr(K.slots(token));
  if (n === 1) await kv.expire(K.slots(token), 120 * 86400);
  if (n > MAX_SLOTS_PER_TOKEN) return { ok: false, status: 429, error: "Troppi caricamenti. Scrivi a chi ti ha mandato il link." };
  const pathname = newUploadPathname(hex(), kind, contentType);
  await kv.set(K.slot(pathname), { token, kind, shotId: sid, contentType, side, at: now }, { ex: UPLOAD_SLOT_TTL_S });
  return { ok: true, pathname };
}

/** Passo 2 (onBeforeGenerateToken): il token del Blob esiste solo per uno slot di questa richiesta. */
export async function authorizeBlobUpload(token, pathname, side, now = Date.now()) {
  if (!isUploadPathname(pathname)) return { error: { status: 400, error: "Caricamento non valido." } };
  const rec = await getRecord(token);
  if (side === "modella") {
    const link = linkState(rec, now);
    if (link !== "open") return { error: linkError(link) };
  } else if (!rec) return { error: { status: 404, error: "Richiesta non trovata." } };
  const slot = await kv.get(K.slot(pathname));
  if (!slot || slot.token !== token || slot.side !== side) return { error: { status: 403, error: "Caricamento non autorizzato." } };
  return {
    options: {
      allowedContentTypes: [slot.contentType],
      maximumSizeInBytes: MAX_BYTES[slot.kind],
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: now + UPLOAD_SLOT_TTL_S * 1000,
    },
  };
}

async function firstBytes(pathname, n = 64) {
  const { get } = await sdk();
  const r = await get(pathname, { access: "private", useCache: false, headers: { Range: `bytes=0-${n - 1}` } });
  if (!r?.stream) return null;
  const reader = r.stream.getReader();
  const chunks = [];
  let total = 0;
  while (total < n) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, n);
}

/**
 * Passo 3: il browser dice «caricato». Si controlla che il file ci sia, quanto pesa e cosa contiene
 * davvero (i primi byte), poi lo si registra. Ritorna { justDelivered } quando con questo file la
 * modella ha caricato TUTTE le riprese (per l'avviso).
 */
export async function confirmUpload(token, pathname, side, now = Date.now()) {
  if (!isUploadPathname(pathname)) return { ok: false, status: 400, error: "Richiesta non valida." };
  const slot = await kv.get(K.slot(pathname));
  if (!slot || slot.token !== token || slot.side !== side) return { ok: false, status: 404, error: "Caricamento non trovato: riprova." };
  let meta;
  try { const { head } = await sdk(); meta = await head(pathname); } catch { meta = null; }
  if (!meta?.size) return { ok: false, status: 404, error: "Il file non è arrivato: riprova." };
  if (meta.size > MAX_BYTES[slot.kind]) { await Promise.all([removeBlobs(pathname), kv.del(K.slot(pathname))]); return { ok: false, status: 413, error: "File troppo grande." }; }
  let bytes = null;
  try { bytes = await firstBytes(pathname); } catch { bytes = null; }
  if (!bytes) return { ok: false, status: 502, error: "Non riesco a leggere il file appena caricato. Riprova tra poco." };
  if (!sniffMatches(sniffMedia(bytes), slot.contentType)) {
    await Promise.all([removeBlobs(pathname), kv.del(K.slot(pathname))]);
    return { ok: false, status: 415, error: slot.kind === "voce" ? "Questo non sembra un audio." : "Questo file non sembra un video o una foto: riprova dalla galleria." };
  }
  const file = { kind: slot.kind, shotId: slot.shotId, contentType: slot.contentType, size: meta.size, at: now };
  await kv.del(K.slot(pathname));
  const rec = await getRecord(token);
  if (!rec) { await removeBlobs(pathname); return { ok: false, status: 404, error: "Richiesta non trovata." }; }
  const shot = rec.shots.find((s) => s.id === slot.shotId);
  if (!shot) { await removeBlobs(pathname); return { ok: false, status: 404, error: "Ripresa non trovata: ricarica la pagina." }; }

  if (slot.kind === "take") {
    await kv.hset(K.files(token), { [pathname]: JSON.stringify(file) });
    const files = await listFiles(token);
    const st = requestState(rec, files);
    let justDelivered = false;
    if (st.state === "consegnata" && !rec.deliveredAt) { rec.deliveredAt = now; justDelivered = true; }
    rec.updatedAt = now;
    await putRecord(rec);
    return { ok: true, file: { pathname, ...file }, justDelivered };
  }
  const field = slot.kind === "ref" ? "ref" : "voice";
  const old = shot[field]?.pathname;
  shot[field] = { pathname, contentType: slot.contentType, size: meta.size, at: now };
  rec.updatedAt = now;
  await putRecord(rec);
  if (old && old !== pathname) await removeBlobs(old);
  return { ok: true, file: { pathname, ...file } };
}

export { UPLOAD_TYPES };
