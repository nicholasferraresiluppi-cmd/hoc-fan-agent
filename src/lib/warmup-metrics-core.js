// Warm-up — numeri PUBBLICI dei profili letti in automatico (fase 1, 22/10/2026). Logica pura.
//
// Fonte: Apify, solo quello che vede chiunque apra il profilo (nessun accesso agli account):
//   Instagram  apify/instagram-profile-scraper   follower, post totali, ultimi ~12 post con
//                                                 visualizzazioni dei reel, like, commenti
//   X          danek/twitter-profile-ppr          follower, post totali, Premium, sito in bio
//              apidojo/twitter-profile-scraper    ultimi 40 post con visualizzazioni e interazioni
// Restano a mano i numeri privati (visite al profilo, tocchi sul link): li dà solo l'app.
//
// Cosa si salva per profilo (warmup:pub:{id}): l'ultima lettura, una riga al giorno (follower,
// post) e i post visti con l'ultimo conteggio. Da qui si ricava la settimana:
//   follower a fine settimana e differenza con la settimana prima;
//   reel/post PUBBLICATI nella settimana e le loro visualizzazioni (all'ultima lettura).
// Le visualizzazioni di un reel crescono nei giorni dopo: il numero di una settimana si
// assesta qualche giorno dopo la sua fine. Lo si dice a schermo.
import { weekKey } from "@/lib/warmup-plan";

export const METRICS_VERSION = "wu-pub-1";
export const KEEP_POST_DAYS = 120;
export const KEEP_DAY_ROWS = 200;

/** Giorno di Roma (YYYY-MM-DD) di un istante. */
export function romeDay(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** Settimana (lunedì-domenica) di un giorno YYYY-MM-DD, con la stessa chiave del warm-up. */
export const weekOfDay = (day) => weekKey(new Date(day + "T12:00:00"));

/** Nome utente pulito da usare con gli strumenti (niente @, niente spazi). */
export function handleOf(username) {
  const h = String(username || "").trim().replace(/^@+/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h : null;
}

const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/** Una riga di apify/instagram-profile-scraper → lettura. */
export function parseInstagram(item, at = Date.now()) {
  if (!item) return null;
  if (item.error) return { at, notFound: item.error === "not_found", error: item.errorDescription || item.error };
  const posts = (item.latestPosts || []).filter((p) => p && p.timestamp).map((p) => ({
    id: String(p.shortCode || p.id),
    ts: Date.parse(p.timestamp),
    kind: p.productType === "clips" || p.type === "Video" ? "reel" : p.type === "Sidecar" ? "carosello" : "post",
    views: num(p.videoViewCount ?? p.videoPlayCount),
    likes: num(p.likesCount),
    comments: num(p.commentsCount),
    pinned: Boolean(p.isPinned),
  })).filter((p) => !isNaN(p.ts));
  return {
    at, notFound: false,
    private: Boolean(item.private),
    followers: num(item.followersCount), following: num(item.followsCount), posts: num(item.postsCount),
    highlights: num(item.highlightReelCount), professional: Boolean(item.isBusinessAccount || item.businessCategoryName),
    items: posts,
  };
}

/** Una riga di danek/twitter-profile-ppr (+ i post di apidojo) → lettura. */
export function parseX(profile, tweets = [], at = Date.now()) {
  if (!profile) return null;
  if (profile.status && profile.status !== "active") return { at, notFound: profile.status === "notfound", error: profile.status };
  const items = (tweets || []).filter((t) => t && t.createdAt && !t.isRetweet && !t.isReply && !t.noResults).map((t) => ({
    id: String(t.id),
    ts: Date.parse(t.createdAt),
    kind: "post",
    views: num(t.viewCount),
    likes: num(t.likeCount),
    comments: num(t.replyCount),
    reposts: num(t.retweetCount),
  })).filter((p) => !isNaN(p.ts));
  return {
    at, notFound: false,
    private: Boolean(profile.protected),
    followers: num(profile.sub_count), following: num(profile.friends), posts: num(profile.statuses_count),
    premium: Boolean(profile.blue_verified),
    website: profile.website || null,
    items,
  };
}

/** Aggiunge una lettura allo storico del profilo (riga del giorno + post visti), potando il vecchio. */
export function mergeReading(store, reading) {
  const s = store && store.v === METRICS_VERSION ? { ...store, days: { ...store.days }, posts: { ...store.posts } } : { v: METRICS_VERSION, days: {}, posts: {} };
  if (!reading) return s;
  s.last = { ...reading, items: undefined };
  s.lastAt = reading.at;
  if (reading.notFound || reading.error) return s;
  const day = romeDay(reading.at);
  s.days[day] = { followers: reading.followers, following: reading.following, posts: reading.posts };
  for (const p of reading.items || []) {
    const prev = s.posts[p.id] || {};
    s.posts[p.id] = { ...prev, ...p, firstAt: prev.firstAt || reading.at, lastAt: reading.at };
  }
  const oldPost = reading.at - KEEP_POST_DAYS * 86400000;
  for (const [k, p] of Object.entries(s.posts)) if (p.ts < oldPost) delete s.posts[k];
  const dayKeys = Object.keys(s.days).sort();
  for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - KEEP_DAY_ROWS))) delete s.days[k];
  return s;
}

/** Settimana per settimana: follower (fine, differenza), post pubblicati e loro numeri. */
export function weeklyFromStore(store, weekKeys) {
  const out = {};
  if (!store || store.v !== METRICS_VERSION) return out;
  const days = Object.keys(store.days || {}).sort();
  const lastIn = (wk) => [...days].reverse().find((d) => weekOfDay(d) === wk);
  const firstIn = (wk) => days.find((d) => weekOfDay(d) === wk);
  const sorted = [...weekKeys].sort();
  for (const wk of sorted) {
    const endDay = lastIn(wk);
    const prevWk = sorted[sorted.indexOf(wk) - 1];
    const prevEnd = prevWk ? lastIn(prevWk) : null;
    const before = prevEnd || [...days].reverse().find((d) => d < (firstIn(wk) || "") && weekOfDay(d) < wk) || null;
    const startDay = before || firstIn(wk);
    const fEnd = endDay ? store.days[endDay].followers : null;
    const fStart = startDay ? store.days[startDay].followers : null;
    const posts = Object.values(store.posts || {}).filter((p) => weekOfDay(romeDay(p.ts)) === wk);
    const reels = posts.filter((p) => p.kind === "reel");
    const withViews = posts.filter((p) => p.views != null);
    const sum = (arr, k) => arr.reduce((t, p) => t + (p[k] || 0), 0);
    if (!endDay && !posts.length) continue;
    out[wk] = {
      followers: fEnd,
      followersDelta: fEnd != null && fStart != null && startDay !== endDay ? fEnd - fStart : null,
      deltaPartial: !before, // niente lettura della settimana prima: la differenza parte dal primo giorno letto
      published: posts.length,
      reels: reels.length,
      views: withViews.length ? sum(withViews, "views") : null,
      avgViews: withViews.length ? Math.round(sum(withViews, "views") / withViews.length) : null,
      likes: sum(posts, "likes"), comments: sum(posts, "comments"), reposts: sum(posts, "reposts"),
      engagementPct: withViews.length && sum(withViews, "views") ? Math.round(((sum(withViews, "likes") + sum(withViews, "comments") + sum(withViews, "reposts")) / sum(withViews, "views")) * 1000) / 10 : null,
      readAt: endDay || null,
    };
  }
  return out;
}

/** I numeri automatici con cui precompilare la scheda «Dati della settimana» (solo campi vuoti). */
export function prefillFor(platform, w) {
  if (!w) return {};
  if (platform === "x") return { followers: w.followersDelta, views: w.avgViews, eng: w.engagementPct };
  return { followers: w.followers, views: w.views };
}

/** Avvisi per «Da non dimenticare» dalla lettura pubblica più recente. */
export function publicAlerts(a, pub, now = Date.now()) {
  const out = [];
  const last = pub?.last;
  if (!last || now - (pub.lastAt || 0) > 4 * 86400000) return out;
  const where = a.platform === "x" ? "su X" : "su Instagram";
  if (last.notFound) out.push({ lev: "bad", t: `Profilo non trovato ${where}: ${a.username}`, d: "La lettura automatica di stanotte non trova il profilo pubblico: nome utente cambiato, account chiuso o bannato? Controlla dal telefono e correggi il nome utente o lo stato." });
  else if (last.private) out.push({ lev: "warn", t: `${a.username} risulta privato`, d: "Dal profilo pubblico non si vede niente: se non è il cooldown (dove è voluto), rimettilo pubblico." });
  if (a.platform === "x" && !last.notFound && last.premium === false) out.push({ lev: "warn", t: `Premium non attivo su ${a.username}`, d: "Letto dal profilo pubblico: senza Premium un post fa in media meno di 100 visualizzazioni." });
  return out;
}

/** Costo stimato di un giro (per il tetto sul run). */
export const PRICE = { ig: 0.003, xProfile: 0.0003, xPosts: 0.017 };
export function runBudget(nIg, nX) {
  return Math.ceil((nIg * PRICE.ig + nX * (PRICE.xProfile + PRICE.xPosts)) * 1.5 * 100 + 5) / 100;
}
