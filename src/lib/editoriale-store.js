// Editoriale Instagram — archivio in KV (26/10/2026). Logica in editoriale-core.js.
//
// Una creator = un drive = un insieme di contenuti; i profili Instagram sono gli account della
// creator in Account social (gli stessi del Warm-up, stesso id).
//
// Chiavi (namespace `edit:*`, ck = creatorKey):
//   edit:cfg               HASH ck → { creator, folderId, folderName, at, by }
//   edit:files:{ck}        elenco foto/video del drive letto da Google (cache: si rilegge a mano o se >15 min)
//   edit:items:{ck}        HASH itemId → contenuto (un campo per contenuto: due schede aperte non si
//                          cancellano a vicenda il lavoro)
//   edit:used:{ck}         HASH fileId → itemId — il LUCCHETTO anti-doppione: si prende con HSETNX,
//                          quindi due persone non possono mettere la stessa foto in due caroselli
//   edit:log:{ck}          LIST storico (cap 300)
import { kv } from "@vercel/kv";
import { randomUUID } from "node:crypto";
import { loadAll as loadSupervisor } from "@/lib/supervisor-store";
import { folderIdFromUrl, folderInfo, listMedia } from "@/lib/google-drive";
import {
  creatorKey, normalizeItem, filesOf, setReady, schedule, setPublished, itemForTask, stageOf,
} from "@/lib/editoriale-core";

const CFG = "edit:cfg";
const FILES = (ck) => `edit:files:${ck}`;
const ITEMS = (ck) => `edit:items:${ck}`;
const USED = (ck) => `edit:used:${ck}`;
const LOG = (ck) => `edit:log:${ck}`;
const LOG_CAP = 300;
const STALE_MS = 15 * 60 * 1000;

const parse = (x) => (typeof x === "string" ? JSON.parse(x) : x);

/** Creator con almeno un profilo Instagram in Account social, con i loro profili. */
export async function creatorsWithProfiles() {
  const sup = await loadSupervisor();
  const map = new Map();
  for (const a of sup.accounts) {
    if (a.platform !== "instagram" || !a.creator) continue;
    const ck = creatorKey(a.creator);
    if (!ck) continue;
    if (!map.has(ck)) map.set(ck, { ck, creator: a.creator, profiles: [] });
    map.get(ck).profiles.push({ id: a.id, username: "@" + a.username, status: a.platformStatus || null });
  }
  for (const c of map.values()) c.profiles.sort((x, y) => x.username.localeCompare(y.username));
  return [...map.values()].sort((a, b) => a.creator.localeCompare(b.creator, "it"));
}

export async function getConfig(ck) {
  const v = await kv.hget(CFG, ck);
  return v ? parse(v) : null;
}
export async function allConfigs() {
  const h = (await kv.hgetall(CFG)) || {};
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, parse(v)]));
}

export async function appendLog(ck, text, by) {
  try {
    await kv.lpush(LOG(ck), JSON.stringify({ ts: Date.now(), text, un: by?.name || "—" }));
    await kv.ltrim(LOG(ck), 0, LOG_CAP - 1);
  } catch {}
}
export async function getLog(ck) {
  return ((await kv.lrange(LOG(ck), 0, 60)) || []).map(parse);
}

/** Collega (o cambia) la cartella del drive della creator. Verifica che il service account la veda. */
export async function setFolder(creator, url, by) {
  const ck = creatorKey(creator);
  const folderId = folderIdFromUrl(url);
  if (!ck) return { ok: false, errors: ["Creator mancante"] };
  if (!folderId) return { ok: false, errors: ["Incolla il link della cartella di Google Drive"] };
  const info = await folderInfo(folderId);
  const cfg = { creator, folderId: info.id, folderName: info.name, at: Date.now(), by: by?.name || "" };
  await kv.hset(CFG, { [ck]: JSON.stringify(cfg) });
  await kv.del(FILES(ck));
  await appendLog(ck, `Cartella del drive collegata: ${info.name}`, by);
  return { ok: true, cfg };
}

/** Elenco dei file del drive (dalla cache, o riletto se vecchio / se richiesto). */
export async function getFiles(ck, { force = false } = {}) {
  const cfg = await getConfig(ck);
  if (!cfg) return null;
  const cached = await kv.get(FILES(ck));
  if (cached && !force && cached.folderId === cfg.folderId && Date.now() - cached.at < STALE_MS) return cached;
  try {
    const { files, folders, truncated } = await listMedia(cfg.folderId);
    const doc = { at: Date.now(), folderId: cfg.folderId, files, folders: folders || [], truncated };
    await kv.set(FILES(ck), doc);
    return doc;
  } catch (e) {
    // drive irraggiungibile: si lavora sull'ultimo elenco letto, dichiarandolo
    if (cached && cached.folderId === cfg.folderId) return { ...cached, error: e.message };
    return { at: null, folderId: cfg.folderId, files: [], error: e.message };
  }
}

export async function listItems(ck) {
  const h = (await kv.hgetall(ITEMS(ck))) || {};
  return Object.values(h).map(parse);
}
async function getItem(ck, id) {
  const v = await kv.hget(ITEMS(ck), id);
  return v ? parse(v) : null;
}
async function putItem(ck, item) {
  await kv.hset(ITEMS(ck), { [item.id]: JSON.stringify(item) });
}

/**
 * Prende il lucchetto sui file aggiunti e lo lascia su quelli tolti. Se un file è già di un altro
 * contenuto (che esiste ancora) non si prende niente e si dice quale.
 */
async function lockFiles(ck, itemId, before, after, nameOf) {
  const add = after.filter((f) => !before.includes(f));
  const drop = before.filter((f) => !after.includes(f));
  const taken = [];
  for (const f of add) {
    const ok = await kv.hsetnx(USED(ck), f, itemId);
    if (ok) { taken.push(f); continue; }
    const owner = await kv.hget(USED(ck), f);
    if (owner === itemId) continue;
    const other = owner ? await getItem(ck, owner) : null;
    if (!other) { await kv.hset(USED(ck), { [f]: itemId }); taken.push(f); continue; } // lucchetto orfano
    if (taken.length) await kv.hdel(USED(ck), ...taken);
    const where = { pubblicato: "già pubblicato", calendario: "in calendario", pronto: "pronto", lavorazione: "in preparazione" }[stageOf(other)];
    return { ok: false, errors: [`«${nameOf(f)}» è già usato in «${other.title}» (${where})`] };
  }
  for (const f of drop) {
    const owner = await kv.hget(USED(ck), f);
    if (owner === itemId) await kv.hdel(USED(ck), f);
  }
  return { ok: true };
}

/** Nuovo contenuto o modifica (foto, ordine, didascalia, reel montato…). */
export async function saveItem(ck, input, by) {
  const prev = input?.id ? await getItem(ck, String(input.id)) : null;
  if (input?.id && !prev) return { ok: false, status: 404, errors: ["Contenuto non trovato"] };
  if (prev?.status === "pubblicato") return { ok: false, status: 409, errors: ["È già pubblicato: non si modifica"] };
  const doc = await getFiles(ck);
  const byId = new Map((doc?.files || []).map((f) => [f.id, f]));
  const kinds = new Map([...byId].map(([id, f]) => [id, f.kind]));
  // i file già nel contenuto restano validi anche se il drive non li elenca più (spostati/rinominati)
  for (const f of prev ? filesOf(prev) : []) if (!kinds.has(f)) kinds.set(f, prev.type === "carosello" ? "photo" : "video");
  const r = normalizeItem(input, prev, kinds);
  if (!r.ok) return r;
  const item = r.item;
  item.id = prev?.id || randomUUID().slice(0, 12);
  const lk = await lockFiles(ck, item.id, prev ? filesOf(prev) : [], filesOf(item), (f) => byId.get(f)?.name || "file");
  if (!lk.ok) return { ...lk, status: 409 };
  const now = Date.now();
  item.createdAt = prev?.createdAt || now;
  item.createdBy = prev?.createdBy || by?.name || "";
  item.updatedAt = now;
  item.updatedBy = by?.name || "";
  await putItem(ck, item);
  if (!prev) await appendLog(ck, `${item.type === "carosello" ? "Carosello" : "Reel"} creato: «${item.title}» (${item.files.length} file)`, by);
  return { ok: true, item };
}

/** Smonta un contenuto: i suoi file tornano liberi. Un pubblicato non si smonta. */
export async function deleteItem(ck, id, by) {
  const prev = await getItem(ck, id);
  if (!prev) return { ok: false, status: 404, errors: ["Contenuto non trovato"] };
  if (prev.status === "pubblicato") return { ok: false, status: 409, errors: ["È già pubblicato: i suoi file restano usati"] };
  await lockFiles(ck, id, filesOf(prev), [], () => "");
  await kv.hdel(ITEMS(ck), id);
  await appendLog(ck, `Smontato: «${prev.title}» — i file tornano liberi`, by);
  return { ok: true };
}

/** Pronto / calendario / pubblicato: un passo alla volta, con le regole della lib. */
export async function stepItem(ck, id, step, args, by) {
  const prev = await getItem(ck, id);
  if (!prev) return { ok: false, status: 404, errors: ["Contenuto non trovato"] };
  let r;
  if (step === "ready") r = setReady(prev, Boolean(args.on));
  else if (step === "schedule") {
    const c = (await creatorsWithProfiles()).find((x) => x.ck === ck);
    r = schedule(prev, args.slot || null, (c?.profiles || []).map((p) => p.id));
  } else if (step === "publish") {
    r = setPublished(prev, Boolean(args.on), { by: by?.name, today: args.today, profileId: args.profileId });
  } else return { ok: false, errors: ["Passo sconosciuto"] };
  if (!r.ok) return r;
  const item = { ...r.item, updatedAt: Date.now(), updatedBy: by?.name || "" };
  await putItem(ck, item);
  const what = step === "ready" ? (args.on ? "pronto" : "riportato in preparazione")
    : step === "schedule" ? (item.slot ? `in calendario il ${item.slot.date}${item.slot.time ? " alle " + item.slot.time : ""}` : "tolto dal calendario")
    : (args.on ? "pubblicato" : "riaperto (non più pubblicato)");
  await appendLog(ck, `«${item.title}» ${what}`, by);
  return { ok: true, item };
}

// ── Warm-up ───────────────────────────────────────────────────────────────────

/**
 * Contenuti in calendario per i profili del Warm-up nei giorni dati: { [profileId]: { [day]: [..] } }.
 * Versione leggera (niente didascalie lunghe): serve a mostrare sotto la task cosa pubblicare.
 */
export async function scheduledForProfiles(profiles, days) {
  const cks = [...new Set(profiles.map((p) => creatorKey(p.creator)).filter(Boolean))];
  const ids = new Set(profiles.map((p) => p.id));
  const want = new Set(days);
  const out = {};
  const lists = await Promise.all(cks.map((ck) => listItems(ck).then((items) => [ck, items]).catch(() => [ck, []])));
  for (const [ck, items] of lists) {
    for (const it of items) {
      const sl = it.slot;
      if (!sl || !ids.has(sl.profileId) || !want.has(sl.date)) continue;
      ((out[sl.profileId] ||= {})[sl.date] ||= []).push({
        id: it.id, ck, type: it.type, title: it.title, time: sl.time, status: it.status, pubTask: it.pubTask || null,
        files: filesOf(it).length, cover: it.type === "carosello" ? it.files[0] || null : it.final || it.files[0] || null,
        caption: (it.caption || "").slice(0, 2200), sound: it.sound || "", city: it.city || "",
        // i file da scaricare per pubblicare: le foto in ordine, o il reel montato (o il grezzo se va bene così)
        dl: it.type === "carosello" ? it.files : [it.final || it.files[0]].filter(Boolean),
      });
    }
  }
  return out;
}

/**
 * Spunta di una task di pubblicazione nel Warm-up → il contenuto in calendario quel giorno
 * risulta pubblicato (e torna «pronto» se la spunta si toglie). Non fa nulla se il giorno non
 * ha contenuti in calendario: il Warm-up resta usabile anche senza editoriale.
 */
export async function publishFromTask(profile, day, taskId, on, by) {
  const ck = creatorKey(profile?.creator);
  if (!ck) return null;
  const items = await listItems(ck);
  let it;
  if (on) it = itemForTask(items, profile.id, day, taskId);
  else it = items.find((x) => x.pubTask === taskId && x.slot?.profileId === profile.id && x.slot?.date === day) || null;
  if (!it || (on && it.status === "pubblicato")) return null;
  const r = setPublished(it, on, { by: by?.name, today: day, profileId: profile.id, task: taskId });
  if (!r.ok) return null;
  await putItem(ck, { ...r.item, updatedAt: Date.now(), updatedBy: by?.name || "" });
  await appendLog(ck, `«${it.title}» ${on ? "pubblicato" : "riaperto"} dal Warm-up (${profile.username || ""})`, by);
  return r.item;
}
