/**
 * Storage delle wage CP di un mese (`cp:wages:{periodId}`), a pezzi.
 *
 * PERCHÉ (25/09/2026): Upstash rifiuta richieste >10MB. Dal v5 del parser
 * (lug 2026) salviamo TUTTI i take di ogni turno e un mese pieno supera i
 * 10MB (settembre: ~15MB) → la sync si fermava a metà batch con
 * "max request size exceeded". Qui l'array si spezza in chunk da ~3MB:
 *   - `cp:wages:{p}`            → manifest { chunked: true, n, count, at, enc }
 *   - `cp:wagechunk:{p}:{i}`    → pezzo i (prefisso DIVERSO da cp:wages:
 *                                 per non inquinare chi elenca le chiavi)
 * I mesi vecchi salvati come array unico si leggono uguale (retrocompatibile).
 * Tutti i lettori passano da getWages(): mai più kv.get(`cp:wages:…`) diretto.
 *
 * BANDA (04/10/2026): Upstash ha SOSPESO il database per banda mensile
 * esaurita (10 GB del piano Free in 4 giorni, con soli ~96K comandi). Causa:
 * questi pezzi (~12 MB per mese, 154 MB su 202 del database) letti INTERI da
 * 29 punti dell'app a ogni apertura di pagina — la scheda storica di un
 * operatore ne leggeva fino a 24 mesi. Due difese, invisibili ai chiamanti
 * (stessi dati, stessi numeri):
 *   1. pezzi COMPRESSI (gzip → base64, prefisso "gz1:"): ~1/10 dei byte.
 *      I pezzi vecchi non compressi si leggono ancora; la riscrittura (sync o
 *      scripts/compress-cp-wages.mjs) li comprime.
 *   2. copia in MEMORIA per istanza del server, valida finché il manifest ha
 *      lo stesso `at`: a ogni lettura si scarica solo il manifest (pochi
 *      byte). Si tiene il TESTO JSON e si fa JSON.parse a ogni chiamata, così
 *      ogni chiamante riceve oggetti nuovi e non può sporcare la copia.
 */
import { kv } from "@vercel/kv";
import { gzipSync, gunzipSync } from "node:zlib";

const CHUNK_BYTES = 3 * 1024 * 1024; // byte di JSON NON compresso per pezzo
const chunkKey = (p, i) => `cp:wagechunk:${p}:${i}`;
const GZ = "gz1:";

export function encodeChunk(arr) {
  return GZ + gzipSync(Buffer.from(JSON.stringify(arr), "utf8")).toString("base64");
}
/** Testo JSON di un pezzo (compresso o no). */
export function chunkJson(raw) {
  if (typeof raw === "string" && raw.startsWith(GZ)) return gunzipSync(Buffer.from(raw.slice(GZ.length), "base64")).toString("utf8");
  if (Array.isArray(raw)) return JSON.stringify(raw);
  return "[]";
}
const joinJson = (parts) => {
  const inner = parts.map((p) => p.trim().slice(1, -1).trim()).filter(Boolean);
  return `[${inner.join(",")}]`;
};

// copia in memoria: periodId → { at, json }; poche voci (un mese ≈ 12 MB di testo)
const CACHE_MAX = 6;
const cache = new Map();
function remember(periodId, at, json) {
  cache.delete(periodId);
  cache.set(periodId, { at, json });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/** Array delle wage del mese, o null se il mese non è mai stato sincronizzato. */
export async function getWages(periodId) {
  const v = await kv.get(`cp:wages:${periodId}`);
  if (Array.isArray(v)) return v;
  if (!v || !v.chunked) return null;
  const hit = cache.get(periodId);
  if (hit && v.at && hit.at === v.at) {
    cache.delete(periodId); cache.set(periodId, hit); // più recente in fondo
    return JSON.parse(hit.json);
  }
  // get singole in parallelo (una mget da >10MB sbatterebbe sullo stesso limite)
  const parts = await Promise.all(Array.from({ length: v.n }, (_, i) => kv.get(chunkKey(periodId, i))));
  const json = joinJson(parts.map(chunkJson));
  if (v.at) remember(periodId, v.at, json);
  return JSON.parse(json);
}

/** Scrive l'array intero del mese. `ex` opzionale (secondi). */
export async function setWages(periodId, wages, { ex } = {}) {
  const arr = Array.isArray(wages) ? wages : [];
  const chunks = [];
  let cur = [];
  let size = 0;
  for (const w of arr) {
    const s = JSON.stringify(w).length;
    if (cur.length && size + s > CHUNK_BYTES) { chunks.push(cur); cur = []; size = 0; }
    cur.push(w);
    size += s;
  }
  if (cur.length) chunks.push(cur);

  const prev = await kv.get(`cp:wages:${periodId}`);
  const opts = ex ? { ex } : undefined;
  for (let i = 0; i < chunks.length; i++) await kv.set(chunkKey(periodId, i), encodeChunk(chunks[i]), opts);
  // manifest DOPO i pezzi: un lettore concorrente vede o il vecchio o il nuovo completo
  await kv.set(`cp:wages:${periodId}`, { chunked: true, n: chunks.length, count: arr.length, at: Date.now(), enc: "gz1" }, opts);
  cache.delete(periodId);
  // pezzi avanzati da una versione più lunga
  const prevN = prev && prev.chunked ? prev.n : 0;
  for (let i = chunks.length; i < prevN; i++) await kv.del(chunkKey(periodId, i));
  return { chunks: chunks.length, count: arr.length };
}

/** Aggiunge in coda (la sync a batch). */
export async function appendWages(periodId, more, { ex } = {}) {
  const existing = (await getWages(periodId)) || [];
  return setWages(periodId, [...existing, ...(more || [])], { ex });
}

/** Cancella il mese (manifest + pezzi). */
export async function deleteWages(periodId) {
  const v = await kv.get(`cp:wages:${periodId}`);
  const n = v && v.chunked ? v.n : 0;
  for (let i = 0; i < n; i++) await kv.del(chunkKey(periodId, i));
  await kv.del(`cp:wages:${periodId}`);
  cache.delete(periodId);
}
