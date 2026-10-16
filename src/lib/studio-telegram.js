// Studio social — canale Telegram, foto e landing del profilo: archivio + invio (16/10/2026).
// Logica pura in studio-telegram-core.js.
//
// Chiavi (namespace studio:*):
//   studio:tgcfg:{pid}     { channelId (canale di /admin/telegram), ofLinkUrl, landing{…}, referencePhotoIds[] (volto, per l'agente qualità), updatedAt, updatedBy }
//   studio:tg:{pid}        { [postId]: post }                         post Telegram programmati
//   studio:media:{pid}     { [photoId]: { id, path, type, size, at, by } }   foto (Blob PRIVATO studio/{pid}/…)
//   studio:land:{slug}     → pid                                       indirizzo della landing
//   studio:landst:{slug}   hash v:{giorno} visite, c:{giorno} clic       contatori della landing
//   studio:tgsend:{pid}:{postId}  lucchetto d'invio (10 min): due giri del cron non mandano lo stesso post
//
// Il bot è quello di /admin/telegram (TELEGRAM_BOT_TOKEN): deve essere amministratore del canale con
// il permesso di pubblicare. Le foto partono dallo spazio privato al bot (multipart), mai da un link pubblico.
import crypto from "crypto";
import { kv } from "@vercel/kv";
import { getChannel, getStats, getOfTelegramStats } from "@/lib/telegram-channels";
import { summarizeStats } from "@/lib/telegram-channels-core";
import { normalizeTgPost, canApproveTg, duePosts, sendPlan, normalizeLanding, landingStats, TG_MAX_PHOTOS } from "@/lib/studio-telegram-core";
import { romeToday } from "@/lib/studio-social-core";

const CFG = (pid) => `studio:tgcfg:${pid}`;
const POSTS = (pid) => `studio:tg:${pid}`;
const MEDIA = (pid) => `studio:media:${pid}`;
const LAND = (slug) => `studio:land:${slug}`;
const LANDST = (slug) => `studio:landst:${slug}`;
const LOCK = (pid, id) => `studio:tgsend:${pid}:${id}`;

const sdk = async () => globalThis.__studioFakeBlob || (await import("@vercel/blob"));
export const blobReady = () => Boolean(globalThis.__studioFakeBlob || process.env.BLOB_READ_WRITE_TOKEN);
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MEDIA_MAX = 200;

// ── Configurazione ──────────────────────────────────────────────────────────
export async function getTgConfig(pid) {
  return (await kv.get(CFG(pid))) || { channelId: null, ofLinkUrl: "", landing: null };
}

export async function saveTgConfig(pid, input, by) {
  const prev = await getTgConfig(pid);
  const errors = [];
  const next = { ...prev };
  if ("channelId" in (input || {})) {
    const id = input.channelId ? String(input.channelId) : null;
    if (id && !(await getChannel(id))) errors.push("Canale Telegram non trovato tra quelli mappati");
    next.channelId = id;
  }
  if ("ofLinkUrl" in (input || {})) {
    const u = String(input.ofLinkUrl || "").trim();
    if (u && !/^https:\/\/onlyfans\.com\/\S+$/i.test(u)) errors.push("Il link OnlyFans deve iniziare con https://onlyfans.com/");
    next.ofLinkUrl = u;
  }
  if ("referencePhotoIds" in (input || {})) {
    // foto di riferimento del volto per l'agente qualità (max 4, solo foto del profilo)
    const media = (await kv.get(MEDIA(pid))) || {};
    next.referencePhotoIds = [...new Set((Array.isArray(input.referencePhotoIds) ? input.referencePhotoIds : []).map(String))].filter((id) => media[id]).slice(0, 4);
  }
  if (input?.landing) {
    const { ok, errors: le, landing } = normalizeLanding(input.landing);
    if (!ok) errors.push(...le);
    else {
      const owner = await kv.get(LAND(landing.slug));
      if (owner && owner !== pid) errors.push("Questo indirizzo è già usato da un altro profilo");
      else {
        if (prev.landing?.slug && prev.landing.slug !== landing.slug) await kv.del(LAND(prev.landing.slug));
        await kv.set(LAND(landing.slug), pid);
        next.landing = landing;
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  next.updatedAt = Date.now();
  next.updatedBy = by || null;
  await kv.set(CFG(pid), next);
  return { ok: true, config: next };
}

// ── Foto ────────────────────────────────────────────────────────────────────
export async function listPhotos(pid) {
  return Object.values((await kv.get(MEDIA(pid))) || {}).sort((a, b) => (b.at || 0) - (a.at || 0)).map(({ path, ...p }) => p); // eslint-disable-line no-unused-vars
}

export async function addPhoto(pid, buf, type, by) {
  if (!blobReady()) throw new Error("Spazio per le foto non configurato in questo ambiente");
  if (!PHOTO_TYPES.includes(type)) throw new Error("Formato non ammesso: solo JPG, PNG o WebP");
  if (!buf?.length || buf.length > PHOTO_MAX_BYTES) throw new Error("Foto troppo grande (massimo 8 MB)");
  const all = (await kv.get(MEDIA(pid))) || {};
  if (Object.keys(all).length >= MEDIA_MAX) throw new Error(`Al massimo ${MEDIA_MAX} foto per profilo: togline qualcuna`);
  const id = crypto.randomBytes(8).toString("hex");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `studio/${pid}/${id}.${ext}`;
  const { put } = await sdk();
  await put(path, buf, { access: "private", contentType: type, addRandomSuffix: false, allowOverwrite: false });
  const fresh = (await kv.get(MEDIA(pid))) || {}; // riletto: due caricamenti in parallelo non si cancellano
  fresh[id] = { id, path, type, size: buf.length, at: Date.now(), by: by || null };
  await kv.set(MEDIA(pid), fresh);
  return { id, type, size: buf.length };
}

export async function removePhoto(pid, id) {
  const all = (await kv.get(MEDIA(pid))) || {};
  const p = all[id];
  if (!p) return { ok: false, error: "Foto non trovata" };
  const posts = Object.values((await kv.get(POSTS(pid))) || {});
  if (posts.some((x) => x.status === "programmato" && (x.photoIds || []).includes(id))) return { ok: false, error: "È in un post programmato: toglila prima dal post" };
  const cfg = await getTgConfig(pid);
  if (cfg.landing?.photoId === id) return { ok: false, error: "È la foto della landing: cambiala prima" };
  if ((cfg.referencePhotoIds || []).includes(id)) await kv.set(CFG(pid), { ...cfg, referencePhotoIds: cfg.referencePhotoIds.filter((x) => x !== id) });
  delete all[id];
  await kv.set(MEDIA(pid), all);
  if (blobReady()) { const { del } = await sdk(); await del(p.path).catch(() => {}); }
  return { ok: true };
}

/** Byte di una foto (per la pagina e per il bot). */
export async function readPhoto(pid, id) {
  if (!blobReady() || !/^[a-f0-9]{16}$/.test(String(id || ""))) return null;
  const p = ((await kv.get(MEDIA(pid))) || {})[id];
  if (!p) return null;
  const { get } = await sdk();
  const r = await get(p.path, { access: "private", useCache: false }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { stream: r.stream, type: p.type || "image/jpeg", ext: p.path.split(".").pop() };
}

async function photoBlob(pid, id) {
  const ph = await readPhoto(pid, id);
  if (!ph) throw new Error("Una foto del post non si trova più");
  const buf = Buffer.from(await new Response(ph.stream).arrayBuffer());
  return { blob: new Blob([buf], { type: ph.type }), name: `${id}.${ph.ext}` };
}

// ── Post ────────────────────────────────────────────────────────────────────
export async function listPosts(pid) {
  return Object.values((await kv.get(POSTS(pid))) || {}).sort((a, b) => (a.sendAt || 9e15) - (b.sendAt || 9e15));
}

export async function savePost(pid, input, by) {
  const all = (await kv.get(POSTS(pid))) || {};
  const prev = input?.id ? all[input.id] || null : null;
  if (prev?.status === "inviato") return { ok: false, errors: ["Il post è già uscito: non si modifica più"] };
  const { ok, errors, post } = normalizeTgPost(input, prev);
  if (!ok) return { ok, errors };
  const media = (await kv.get(MEDIA(pid))) || {};
  if (post.photoIds.some((id) => !media[id])) return { ok: false, errors: ["Una delle foto scelte non c'è più"] };
  const now = Date.now();
  post.id = post.id || crypto.randomBytes(6).toString("hex");
  post.createdAt = prev?.createdAt || now;
  post.createdBy = prev?.createdBy || by || null;
  post.updatedAt = now;
  post.updatedBy = by || null;
  post.approvedBy = null; post.approvedAt = null; // ogni modifica va riapprovata
  all[post.id] = post;
  await kv.set(POSTS(pid), all);
  return { ok: true, post };
}

/** L'approvazione è di una persona: il post diventa "programmato" e parte da solo all'ora scelta. */
export async function approvePost(pid, id, by) {
  const all = (await kv.get(POSTS(pid))) || {};
  const post = all[id];
  const gate = canApproveTg(post);
  if (!gate.ok) return { ok: false, errors: [gate.reason] };
  const cfg = await getTgConfig(pid);
  if (!cfg.channelId) return { ok: false, errors: ["Collega prima il canale Telegram del profilo"] };
  all[id] = { ...post, status: "programmato", approvedBy: by || null, approvedAt: Date.now(), error: null };
  await kv.set(POSTS(pid), all);
  return { ok: true, post: all[id] };
}

export async function setPostStatus(pid, id, status, by) {
  const all = (await kv.get(POSTS(pid))) || {};
  const post = all[id];
  if (!post) return { ok: false, errors: ["Post non trovato"] };
  if (post.status === "inviato") return { ok: false, errors: ["Il post è già uscito"] };
  if (!["bozza", "annullato"].includes(status)) return { ok: false, errors: ["Stato non valido"] };
  all[id] = { ...post, status, approvedBy: null, approvedAt: null, updatedAt: Date.now(), updatedBy: by || null };
  await kv.set(POSTS(pid), all);
  return { ok: true, post: all[id] };
}

export async function deletePost(pid, id) {
  const all = (await kv.get(POSTS(pid))) || {};
  if (!all[id]) return { ok: false, errors: ["Post non trovato"] };
  if (all[id].status === "inviato") return { ok: false, errors: ["Un post uscito resta nello storico"] };
  delete all[id];
  await kv.set(POSTS(pid), all);
  return { ok: true };
}

// ── Invio ───────────────────────────────────────────────────────────────────
async function tgCall(method, payload, files = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Bot Telegram non configurato (TELEGRAM_BOT_TOKEN)");
  let init;
  if (files.length) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(payload)) if (v != null) fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
    for (const f of files) fd.append(f.field, f.blob, f.name);
    init = { method: "POST", body: fd };
  } else {
    init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, init);
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.ok) throw new Error(`Telegram ${method}: ${json.description || `HTTP ${r.status}`}`);
  return json.result;
}

async function sendPost(pid, chatId, post) {
  const ids = [];
  for (const step of sendPlan(post)) {
    const markup = step.button ? { reply_markup: step.button } : {};
    if (step.method === "sendMessage") {
      const res = await tgCall("sendMessage", { chat_id: chatId, text: step.text, link_preview_options: { is_disabled: true }, ...markup });
      ids.push(res.message_id);
    } else if (step.method === "sendPhoto") {
      const f = await photoBlob(pid, step.photo);
      const res = await tgCall("sendPhoto", { chat_id: String(chatId), caption: step.caption || undefined, ...markup }, [{ field: "photo", ...f }]);
      ids.push(res.message_id);
    } else if (step.method === "sendMediaGroup") {
      const files = [];
      const media = [];
      for (const [i, id] of step.photos.entries()) {
        const f = await photoBlob(pid, id);
        files.push({ field: `p${i}`, ...f });
        media.push({ type: "photo", media: `attach://p${i}`, ...(i === 0 && step.caption ? { caption: step.caption } : {}) });
      }
      const res = await tgCall("sendMediaGroup", { chat_id: String(chatId), media }, files);
      ids.push(...res.map((m) => m.message_id));
    }
  }
  return ids;
}

/** Un giro: manda i post arrivati all'ora su tutti i profili. Ritorna un riepilogo per il battito. */
export async function sendDuePosts({ now = Date.now(), listProfileIds, budgetMs = 45_000 } = {}) {
  const started = Date.now();
  const out = { sent: 0, failed: 0, late: 0, profiles: 0 };
  for (const pid of await listProfileIds()) {
    const cfg = await getTgConfig(pid);
    if (!cfg.channelId) continue;
    const posts = await listPosts(pid);
    const { due, late } = duePosts(posts, now);
    if (!due.length && !late.length) continue;
    out.profiles++;
    const ch = await getChannel(cfg.channelId);
    for (const p of late) {
      await patchPost(pid, p.id, { status: "errore", error: "Non partito: oltre 6 ore di ritardo. Riprogrammalo se serve ancora." });
      out.late++;
    }
    for (const p of due) {
      if (Date.now() - started > budgetMs) return out;
      const got = await kv.set(LOCK(pid, p.id), Date.now(), { nx: true, ex: 600 });
      if (!got) continue;
      try {
        if (!ch?.chat_id) throw new Error("Il bot non è collegato al canale (aggiungilo come amministratore)");
        const ids = await sendPost(pid, ch.chat_id, p);
        await patchPost(pid, p.id, { status: "inviato", sentAt: Date.now(), messageIds: ids, error: null });
        out.sent++;
      } catch (e) {
        await patchPost(pid, p.id, { status: "errore", error: String(e.message || e).slice(0, 300) });
        out.failed++;
      }
    }
  }
  return out;
}

async function patchPost(pid, id, patch) {
  const all = (await kv.get(POSTS(pid))) || {};
  if (!all[id]) return;
  all[id] = { ...all[id], ...patch };
  await kv.set(POSTS(pid), all);
}

// ── Landing ─────────────────────────────────────────────────────────────────
export async function landingBySlug(slug) {
  const pid = await kv.get(LAND(String(slug || "").toLowerCase()));
  if (!pid) return null;
  const cfg = await getTgConfig(pid);
  if (!cfg.landing || cfg.landing.slug !== slug || !cfg.landing.active) return null;
  return { pid, landing: cfg.landing };
}

export async function countLanding(slug, kind) {
  const day = romeToday();
  await kv.hincrby(LANDST(slug), `${kind === "click" ? "c" : "v"}:${day}`, 1).catch(() => {});
}

// ── Numeri del percorso ─────────────────────────────────────────────────────
/** Landing (visite, clic) → Telegram (entrati dai link, iscritti) → OnlyFans (link di tracciamento del canale). */
export async function funnelNumbers(pid) {
  const cfg = await getTgConfig(pid);
  const today = romeToday();
  const out = { landing: null, telegram: null, onlyfans: null };
  if (cfg.landing?.slug) out.landing = landingStats(await kv.hgetall(LANDST(cfg.landing.slug)), today, 7);
  if (cfg.channelId) {
    const ch = await getChannel(cfg.channelId);
    if (ch) {
      const st = summarizeStats(await getStats(cfg.channelId), ch.links || [], { today, dayCount: 7 });
      const joins7 = st.days.reduce((s, d) => s + d.joins, 0);
      out.telegram = { title: ch.title || ch.handle || "Canale", members: ch.members ?? null, joins7, botAdmin: ch.bot?.status === "admin", connected: !!ch.chat_id };
    }
  }
  if (cfg.ofLinkUrl) {
    try {
      const { creators, available } = await getOfTelegramStats();
      const mine = Object.values(creators || {}).flatMap((c) => c.links).find((l) => l.url === cfg.ofLinkUrl) || null;
      out.onlyfans = available ? (mine ? { subs: mine.subs, clicks: mine.clicks, subs_30: mine.subs_30, clicks_30: mine.clicks_30, name: mine.name } : { missing: true }) : { unavailable: true };
    } catch {
      out.onlyfans = { unavailable: true };
    }
  }
  return out;
}

export { TG_MAX_PHOTOS };
