// Film library — wrapper KV attorno al core puro (film-library-core.js).
//
// Un record per operatore (`film:lib:{op}`) + indice set (`film:lib:_index`):
// la libreria si ATTIVA alla prima apertura del film di un operatore e da lì
// il cron notturno la tiene fresca (film-refresh). Scelta deliberata vs
// "roster da Coaching Center": nessuna superficie di configurazione nuova,
// il coach attiva seguendo — deviazione dichiarata dal blueprint.
//
// NB atomicità: read-modify-write non transazionale, come infloww-ingest —
// adeguato alla cadenza reale (un coach alla volta sul singolo operatore).

import { kv } from "@vercel/kv";
import {
  FILM_LIBRARY_VERSION,
  mergeLibrary,
  applyJudgment,
  libraryCounts,
  libraryList,
  stripMomentMeta,
} from "@/lib/film-library-core";

const LIB_KEY = (op) => `film:lib:${encodeURIComponent(op)}`; // nome GREZZO encodato (lezione cache film)
const INDEX_KEY = "film:lib:_index";
const MAX_TRACKED = 60; // backstop: il cron non deve scalare oltre ciò che i coach seguono davvero

export async function getLibrary(operator) {
  const store = await kv.get(LIB_KEY(operator));
  if (!store || typeof store !== "object" || !store.moments) return null;
  return store;
}

/**
 * Upsert dei momenti freschi del film nella libreria dell'operatore.
 * Attiva la libreria alla prima chiamata (aggiunge all'indice). Best-effort
 * by design: il chiamante la avvolge in try/catch — un errore qui non deve
 * mai rompere il film.
 */
export async function upsertFromFilm(operator, metas, now = Date.now()) {
  const prev = await getLibrary(operator);
  // niente attivazione VUOTA: un nome sbagliato/senza momenti non deve entrare
  // nell'indice (gonfierebbe coda e giro di refresh per sempre, senza srem).
  if (!prev && (!Array.isArray(metas) || metas.length === 0)) {
    return { added: 0, updated: 0, counts: libraryCounts(null) };
  }
  const { store, added, updated } = mergeLibrary(prev, metas, now);
  await kv.set(LIB_KEY(operator), store);
  try {
    await kv.sadd(INDEX_KEY, operator);
  } catch {
    /* indice best-effort */
  }
  return { added, updated, counts: libraryCounts(store) };
}

/**
 * Segna la libreria come "toccata" senza cambiare i momenti: il refresh
 * notturno la usa nel catch — un film che fallisce deterministicamente NON
 * deve monopolizzare gli slot ogni notte (il fallimento consuma il turno).
 */
export async function touchLibrary(operator, now = Date.now()) {
  const store = await getLibrary(operator);
  if (!store) return;
  await kv.set(LIB_KEY(operator), { ...store, updated_at: now });
}

/** Giudizio del coach su un momento (persiste tra i ricalcoli, id stabile). */
export async function judgeMoment(operator, key, judgment, now = Date.now()) {
  const store = await getLibrary(operator);
  if (!store) throw new Error("Libreria non ancora attivata per questo operatore");
  const next = applyJudgment(store, key, judgment, now);
  await kv.set(LIB_KEY(operator), next);
  return { moment: stripMomentMeta(next.moments[key]), counts: libraryCounts(next) };
}

/** Meta interna di un momento (CON user_id: solo uso server, mai in risposta). */
export async function getMomentInternal(operator, key) {
  const store = await getLibrary(operator);
  return store?.moments?.[key] || null;
}

/**
 * Arricchisce il payload del film con la libreria: giudizi sulle card top e
 * lista completa (stripped) per la sezione "tutti i momenti". Mutazione in
 * place, additiva, best-effort (film regge anche senza libreria).
 */
export async function attachLibrary(operator, film) {
  if (!film) return film;
  try {
    const store = await getLibrary(operator);
    if (!store) return film;
    for (const m of [...(film.wins || []), ...(film.losses || [])]) {
      const rec = store.moments[m.key];
      if (rec?.judgment) m.judgment = rec.judgment;
    }
    film.library = {
      version: FILM_LIBRARY_VERSION,
      counts: libraryCounts(store),
      moments: libraryList(store).map(stripMomentMeta),
      updated_at: store.updated_at || null,
    };
  } catch {
    /* additivo, mai fatale */
  }
  return film;
}

/** Sommario code per il pannello d'ingresso (index operator-signals). */
export async function queueSummaries(limit = MAX_TRACKED) {
  // niente slice PRE-mget: smembers non è ordinato, il taglio a monte
  // escluderebbe operatori A CASO e per sempre. Si legge tutto (poche decine
  // di chiavi), si cappa DOPO l'ordinamento.
  const ops = (await kv.smembers(INDEX_KEY)) || [];
  if (!ops.length) return { operators: 0, nuovi: 0, rows: [] };
  const stores = await kv.mget(...ops.map((o) => LIB_KEY(o)));
  const rows = [];
  let nuovi = 0;
  ops.forEach((op, i) => {
    const s = stores?.[i];
    if (!s || !s.moments || !Object.keys(s.moments).length) return; // store vuoto/malformato: fuori
    const c = libraryCounts(s);
    nuovi += c.nuovi;
    rows.push({ operator: op, counts: c, updated_at: s.updated_at || null });
  });
  rows.sort((a, b) => (b.counts.nuovi || 0) - (a.counts.nuovi || 0));
  return { operators: rows.length, nuovi, rows: rows.slice(0, limit) };
}

/**
 * Tick del refresh notturno (chiamato dal dispatch): rinfresca le librerie
 * più stantie (>20h), al massimo `cap` per giro — budget BQ contenuto, la
 * coda gira su tutte in pochi giorni. Ritorna cosa ha fatto (heartbeat).
 */
export async function staleLibraries(cap = 2, now = Date.now()) {
  const ops = (await kv.smembers(INDEX_KEY)) || []; // tutto l'indice: il cap è sul risultato ordinato
  if (!ops.length) return [];
  const stores = await kv.mget(...ops.map((o) => LIB_KEY(o)));
  const withAge = ops
    .map((op, i) => ({ op, updated_at: stores?.[i]?.updated_at || 0 }))
    .filter((x) => now - x.updated_at > 20 * 3600 * 1000)
    .sort((a, b) => a.updated_at - b.updated_at);
  return withAge.slice(0, cap).map((x) => x.op);
}
