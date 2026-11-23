/**
 * Carriera — archivio su KV (23/11/2026). La logica sta in carriera-core.js (puro, testato).
 *
 * Chiavi (namespace `carriera:*`, isolato):
 *   carriera:review:{id}      revisione (colloquio → piano → verifiche → esito)   indice set carriera:reviews
 *   carriera:exception:{id}   eccezione del sales coach (scade)                    indice set carriera:exceptions
 *   carriera:roundtable:{id}  tre righe della roundtable settimanale              indice zset carriera:roundtables (score = ms)
 *
 * Niente TTL: revisioni ed eccezioni sono la traccia scritta di decisioni su persone
 * (la si deve poter mostrare a chi contesta). Volumi piccoli: decine all'anno.
 */
import { kv } from "@vercel/kv";

const REVIEW = (id) => `carriera:review:${id}`;
const REVIEWS = "carriera:reviews";
const EXC = (id) => `carriera:exception:${id}`;
const EXCS = "carriera:exceptions";
const RT = (id) => `carriera:roundtable:${id}`;
const RTS = "carriera:roundtables";
const RT_DAYS = 120;

async function readMany(keyOf, ids) {
  if (!ids?.length) return [];
  const docs = await kv.mget(...ids.map(keyOf));
  return docs.filter(Boolean);
}

export async function listReviews() {
  const ids = (await kv.smembers(REVIEWS)) || [];
  const all = await readMany(REVIEW, ids);
  return all.sort((a, b) => String(b.opened_at).localeCompare(String(a.opened_at)));
}
export const getReview = (id) => kv.get(REVIEW(String(id || "")));
export async function saveReview(r) {
  await kv.set(REVIEW(r.id), r);
  await kv.sadd(REVIEWS, r.id);
  return r;
}

export async function listExceptions() {
  const ids = (await kv.smembers(EXCS)) || [];
  const all = await readMany(EXC, ids);
  return all.sort((a, b) => String(b.from).localeCompare(String(a.from)));
}
export const getException = (id) => kv.get(EXC(String(id || "")));
export async function saveException(e) {
  await kv.set(EXC(e.id), e);
  await kv.sadd(EXCS, e.id);
  return e;
}

/** Roundtable degli ultimi ~4 mesi (bastano per «fatta questa settimana» e lo storico recente). */
export async function listRoundtables(now = Date.now()) {
  const ids = (await kv.zrange(RTS, now - RT_DAYS * 86400000, "+inf", { byScore: true })) || [];
  const all = await readMany(RT, ids);
  return all.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
export async function saveRoundtable(r) {
  await kv.set(RT(r.id), r);
  await kv.zadd(RTS, { score: Date.parse(r.at), member: r.id });
  return r;
}
