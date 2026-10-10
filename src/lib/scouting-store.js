// Radar creator — archivio in KV (namespace isolato `scouting:*`).
//
// Perché KV e non BigQuery (10/10/2026): ~1.200 profili + poche cifre a settimana,
// letti SOLO dalla pagina /admin/scouting e dal giro settimanale. Dopo l'incidente
// banda del 4/10 (cp:wagechunk, 12 MB letti interi da 29 punti) qui si applicano le
// stesse difese di cp-wages-store: pezzi compressi (gzip+base64, prefisso "gz1:")
// e copia in memoria per istanza. Nessun'altra parte dell'app legge queste chiavi.
//
// Chiavi:
//   scouting:profiles            meta { n, count, at, enc }
//   scouting:pchunk:{i}          pezzo compresso di profili
//   scouting:crm                 CRM compresso { creators, dismissed }
//   scouting:refresh             stato del giro settimanale (run Apify in corso, ultimo esito)
//   scouting:forgotten           handle cancellati su richiesta: il giro non li riaggiunge
import { kv } from "@vercel/kv";
import { gzipSync, gunzipSync } from "node:zlib";

const GZ = "gz1:";
const CHUNK_BYTES = 900 * 1024; // JSON non compresso per pezzo (compresso ~1/6)
const enc = (v) => GZ + gzipSync(Buffer.from(JSON.stringify(v), "utf8")).toString("base64");
const dec = (raw, fallback) => {
  if (typeof raw === "string" && raw.startsWith(GZ)) return JSON.parse(gunzipSync(Buffer.from(raw.slice(GZ.length), "base64")).toString("utf8"));
  return raw ?? fallback;
};

let memProfiles = null; // { at, json }
let memCrm = null;

export async function getProfiles() {
  const meta = await kv.get("scouting:profiles");
  if (!meta) return [];
  if (memProfiles && memProfiles.at === meta.at) return JSON.parse(memProfiles.json);
  const parts = await Promise.all(Array.from({ length: meta.n }, (_, i) => kv.get(`scouting:pchunk:${i}`)));
  const all = parts.flatMap((p) => dec(p, []));
  memProfiles = { at: meta.at, json: JSON.stringify(all) };
  return all;
}

export async function saveProfiles(profiles) {
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const p of profiles) {
    const s = JSON.stringify(p).length;
    if (size + s > CHUNK_BYTES && cur.length) { chunks.push(cur); cur = []; size = 0; }
    cur.push(p); size += s;
  }
  if (cur.length) chunks.push(cur);
  const old = await kv.get("scouting:profiles");
  for (let i = 0; i < chunks.length; i++) await kv.set(`scouting:pchunk:${i}`, enc(chunks[i]));
  const at = Date.now();
  await kv.set("scouting:profiles", { n: chunks.length, count: profiles.length, at, enc: "gz1" });
  for (let i = chunks.length; i < (old?.n || 0); i++) await kv.del(`scouting:pchunk:${i}`);
  memProfiles = { at, json: JSON.stringify(profiles) };
  return { chunks: chunks.length, count: profiles.length };
}

export async function getCrm() {
  const raw = await kv.get("scouting:crm");
  if (raw == null) return { creators: {}, dismissed: [] };
  if (memCrm && memCrm.raw === raw) return JSON.parse(memCrm.json);
  const v = dec(raw, { creators: {}, dismissed: [] });
  memCrm = { raw, json: JSON.stringify(v) };
  return v;
}

export async function saveCrm(crm) {
  const raw = enc({ creators: crm.creators || {}, dismissed: crm.dismissed || [] });
  await kv.set("scouting:crm", raw);
  memCrm = { raw, json: JSON.stringify(crm) };
}

export const getRefreshState = async () => (await kv.get("scouting:refresh")) || {};
export const setRefreshState = (s) => kv.set("scouting:refresh", s);

export async function getForgotten() {
  return new Set((await kv.smembers("scouting:forgotten")) || []);
}
export const addForgotten = (h) => kv.sadd("scouting:forgotten", h);

// ---------- segnalazioni e reel (10/10/2026) ----------
//   scouting:inbox               ultime 200 segnalazioni { id, at, by, text, why, status, h, msg }
//   scouting:tokens              hash sha256(token) → { by, at } per il Comando rapido dell'iPhone
//   scouting:reelmedia:{handle}  link video/copertine dei reel (scadono: TTL 36 h, mai copie dei file)
const INBOX_MAX = 200;
export async function getInbox() {
  return dec(await kv.get("scouting:inbox"), []);
}
export async function saveInbox(items) {
  await kv.set("scouting:inbox", enc(items.slice(0, INBOX_MAX)));
}
export async function updateInboxItem(id, patch) {
  const items = await getInbox();
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) { items[i] = { ...items[i], ...patch }; await saveInbox(items); }
}
export const getTokenOwner = (hash) => kv.hget("scouting:tokens", hash);
export const setToken = (hash, owner) => kv.hset("scouting:tokens", { [hash]: owner });
export const getReelMedia = (h) => kv.get(`scouting:reelmedia:${h}`);
export const setReelMedia = (h, v) => kv.set(`scouting:reelmedia:${h}`, v, { ex: 36 * 3600 });
