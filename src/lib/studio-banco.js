// Banco montaggi — archivio su KV (1/11/2026). Logica in studio-banco-core.js.
//
// Chiavi (namespace `studio:banco:*`, letto solo da questa sezione):
//   studio:banco:folder:{pid} → { id, name, url, by, at }
//   studio:banco:files:{pid}  → { files, at, error, truncated }   copia dell'elenco del drive
//   studio:banco:ids:{pid}    → set degli id: anteprime e video si servono solo per questi file
//   studio:banco:marks:{pid}  → hash fileId → { state, by, at }   una scrittura non tocca le altre
import { kv } from "@vercel/kv";
import { folderIdFromUrl, folderInfo, listMedia, driveFolderUrl } from "@/lib/google-drive";
import { isBancoState, mergeFiles } from "@/lib/studio-banco-core";

const folderKey = (pid) => `studio:banco:folder:${pid}`;
const filesKey = (pid) => `studio:banco:files:${pid}`;
const idsKey = (pid) => `studio:banco:ids:${pid}`;
const marksKey = (pid) => `studio:banco:marks:${pid}`;
const FRESH_MS = 10 * 60_000;

async function readMarks(pid) {
  const raw = (await kv.hgetall(marksKey(pid))) || {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    try { out[k] = typeof v === "string" ? JSON.parse(v) : v; } catch { /* voce illeggibile: conta come da guardare */ }
  }
  return out;
}

async function refreshFiles(pid, folder, prev) {
  try {
    const { files, truncated } = await listMedia(folder.id);
    const videos = files.filter((f) => f.kind === "video");
    const doc = { files: videos, at: Date.now(), error: null, truncated };
    await kv.set(filesKey(pid), doc);
    await kv.del(idsKey(pid));
    if (videos.length) await kv.sadd(idsKey(pid), ...videos.map((f) => f.id));
    return doc;
  } catch (e) {
    // il drive non risponde: restano i file già noti, con l'errore in vista
    return { files: prev?.files || [], at: prev?.at || null, error: e.message || "Drive non raggiungibile", truncated: Boolean(prev?.truncated) };
  }
}

export async function getBanco(pid, { force = false } = {}) {
  const folder = await kv.get(folderKey(pid));
  if (!folder) return { folder: null, rows: [], at: null, error: null, truncated: false };
  let doc = await kv.get(filesKey(pid));
  if (force || !doc || Date.now() - (doc.at || 0) > FRESH_MS) doc = await refreshFiles(pid, folder, doc);
  return { folder, rows: mergeFiles(doc.files, await readMarks(pid)), at: doc.at, error: doc.error, truncated: Boolean(doc.truncated) };
}

/** Il Banco dall'ultimo elenco già letto, senza mai chiamare Drive (per le viste d'insieme come la sala di Editing). */
export async function getBancoCached(pid) {
  const [folder, doc] = await Promise.all([kv.get(folderKey(pid)), kv.get(filesKey(pid))]);
  if (!folder) return { folder: null, rows: [], at: null };
  return { folder, rows: mergeFiles(doc?.files || [], await readMarks(pid)), at: doc?.at || null };
}

export async function setBancoFolder(pid, url, userId) {
  const id = folderIdFromUrl(url);
  if (!id) return { ok: false, error: "Il link non sembra una cartella di Drive" };
  let info;
  try { info = await folderInfo(id); } catch (e) { return { ok: false, error: e.message || "Cartella non raggiungibile" }; }
  const folder = { id: info.id, name: info.name, url: driveFolderUrl(info.id), by: userId || null, at: Date.now() };
  await kv.set(folderKey(pid), folder);
  await kv.del(filesKey(pid));
  return { ok: true, folder };
}

export async function markFile(pid, fileId, state, userId) {
  if (!isBancoState(state)) return { ok: false, error: "Stato sconosciuto" };
  if (!(await hasFile(pid, fileId))) return { ok: false, error: "Video non trovato in questa cartella" };
  if (state === "da_vedere") await kv.hdel(marksKey(pid), fileId);
  else await kv.hset(marksKey(pid), { [fileId]: { state, by: userId || null, at: Date.now() } });
  return { ok: true };
}

export const hasFile = async (pid, fileId) => Boolean(await kv.sismember(idsKey(pid), String(fileId || "")));
