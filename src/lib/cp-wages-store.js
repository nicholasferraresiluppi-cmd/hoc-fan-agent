/**
 * Storage delle wage CP di un mese (`cp:wages:{periodId}`), a pezzi.
 *
 * PERCHÉ (25/09/2026): Upstash rifiuta richieste >10MB. Dal v5 del parser
 * (lug 2026) salviamo TUTTI i take di ogni turno e un mese pieno supera i
 * 10MB (settembre: ~15MB) → la sync si fermava a metà batch con
 * "max request size exceeded". Qui l'array si spezza in chunk da ~3MB:
 *   - `cp:wages:{p}`            → manifest { chunked: true, n, count, at }
 *   - `cp:wagechunk:{p}:{i}`    → pezzo i (prefisso DIVERSO da cp:wages:
 *                                 per non inquinare chi elenca le chiavi)
 * I mesi vecchi salvati come array unico si leggono uguale (retrocompatibile).
 * Tutti i lettori passano da getWages(): mai più kv.get(`cp:wages:…`) diretto.
 */
import { kv } from "@vercel/kv";

const CHUNK_BYTES = 3 * 1024 * 1024;
const chunkKey = (p, i) => `cp:wagechunk:${p}:${i}`;

/** Array delle wage del mese, o null se il mese non è mai stato sincronizzato. */
export async function getWages(periodId) {
  const v = await kv.get(`cp:wages:${periodId}`);
  if (Array.isArray(v)) return v;
  if (!v || !v.chunked) return null;
  // get singole in parallelo (una mget da >10MB sbatterebbe sullo stesso limite)
  const parts = await Promise.all(Array.from({ length: v.n }, (_, i) => kv.get(chunkKey(periodId, i))));
  return parts.flatMap((x) => (Array.isArray(x) ? x : []));
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
  for (let i = 0; i < chunks.length; i++) await kv.set(chunkKey(periodId, i), chunks[i], opts);
  // manifest DOPO i pezzi: un lettore concorrente vede o il vecchio o il nuovo completo
  await kv.set(`cp:wages:${periodId}`, { chunked: true, n: chunks.length, count: arr.length, at: Date.now() }, opts);
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
}
