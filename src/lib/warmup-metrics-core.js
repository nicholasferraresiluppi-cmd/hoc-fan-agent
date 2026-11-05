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
import { normalizeLinkUrl } from "@/lib/s4s-core";

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
    // visualizzazioni «a un giorno»: la prima lettura fatta tra 18 e 48 ore dalla pubblicazione.
    // Serve a confrontare reel di età uguale (un reel di 10 giorni ha sempre più view di uno di ieri).
    const age = reading.at - p.ts;
    const early = prev.early ?? (p.views != null && age >= 18 * 3600000 && age <= 48 * 3600000 ? p.views : undefined);
    s.posts[p.id] = { ...prev, ...p, ...(early != null ? { early } : {}), firstAt: prev.firstAt || reading.at, lastAt: reading.at };
  }
  const oldPost = reading.at - KEEP_POST_DAYS * 86400000;
  for (const [k, p] of Object.entries(s.posts)) if (p.ts < oldPost) delete s.posts[k];
  const dayKeys = Object.keys(s.days).sort();
  for (const k of dayKeys.slice(0, Math.max(0, dayKeys.length - KEEP_DAY_ROWS))) delete s.days[k];
  return s;
}

/**
 * Giorno per giorno (29/10/2026, per il periodo a scelta in Dati): follower letti quel giorno e i
 * post USCITI quel giorno con il loro ultimo conteggio. Solo dati automatici: quelli a mano sono
 * settimanali. Ultimi `n` giorni con almeno una lettura o un post.
 */
export function dailyFromStore(store, n = 120) {
  const out = {};
  if (!store || store.v !== METRICS_VERSION) return out;
  const blank = () => ({ followers: null, posts: 0, views: null, viewsN: 0, likes: 0, comments: 0 });
  for (const [d, r] of Object.entries(store.days || {})) out[d] = { ...blank(), followers: r.followers ?? null };
  for (const p of Object.values(store.posts || {})) {
    const d = romeDay(p.ts);
    if (!d) continue;
    const row = out[d] || (out[d] = blank());
    row.posts++;
    row.likes += p.likes || 0; row.comments += (p.comments || 0) + (p.reposts || 0);
    if (p.views != null) { row.views = (row.views || 0) + p.views; row.viewsN++; }
  }
  const keep = Object.keys(out).sort().slice(-n);
  return Object.fromEntries(keep.map((d) => [d, out[d]]));
}

/** I post degli ultimi giorni in forma corta, per «i post migliori» del periodo. */
export function postsFromStore(store, platform) {
  if (!store || store.v !== METRICS_VERSION) return [];
  return Object.values(store.posts || {}).filter((p) => p.ts).map((p) => ({
    id: p.id, ts: p.ts, kind: p.kind || null, views: p.views ?? null, likes: p.likes ?? null, comments: p.comments ?? null,
    url: platform === "x" ? `https://x.com/i/status/${p.id}` : `https://www.instagram.com/p/${p.id}/`,
  })).sort((a, b) => b.ts - a.ts);
}

/** Clic, iscritti e ricavo del tracking link tra due giorni compresi (differenza dei totali). */
export function linkRange(linkDays, from, to, created) {
  const days = Object.keys(linkDays || {}).sort();
  const inR = days.filter((d) => d >= from && d <= to);
  if (!inR.length) return null;
  const end = linkDays[inR[inR.length - 1]];
  const b = [...days].reverse().find((d) => d < from);
  const start = b ? linkDays[b] : created && created >= from ? { clicks: 0, subs: 0, revenue: 0 } : null;
  if (!start) return { partial: true, clicks: null, subs: null, revenue: null };
  return { clicks: end.clicks - start.clicks, subs: end.subs - start.subs, revenue: Math.round((end.revenue - start.revenue) * 100) / 100 };
}

/** I numeri di un giorno come i campi del grafico (IG: follower totali e view; X: nuovi follower e view medie). */
export function dailyPrefill(platform, row, prevRow) {
  if (!row) return {};
  if (platform === "x") return {
    followers: row.followers != null && prevRow?.followers != null ? row.followers - prevRow.followers : null,
    views: row.viewsN ? Math.round(row.views / row.viewsN) : null,
  };
  return { followers: row.followers, views: row.views };
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
      ...linkWeek(store.link, wk),
    };
  }
  // settimane con soli numeri del link (nessuna lettura del profilo)
  for (const wk of sorted) if (!out[wk]) { const lw = linkWeek(store.link, wk); if (lw.linkClicks != null) out[wk] = { published: 0, ...lw }; }
  return out;
}

/* ── tracking link OnlyFans dell'account (dal magazzino dati: onlyfans.links_stats) ──
   Ogni account porta il SUO link di tracciamento: clic, iscritti e ricavo arrivano da OnlyFans
   e li leggiamo dal nostro lato, senza toccare l'account. links_stats è una fotografia
   giornaliera coi totali dalla creazione del link. */
export const normalizeOfLink = (u) => normalizeLinkUrl(u);

/** Il link da usare: quello scritto sul profilo, o (su X) quello che si legge in bio. */
export function effectiveLink(rec, pubLast) {
  const own = normalizeLinkUrl(rec?.trackingLink);
  if (own) return { url: own, from: "profilo" };
  if (rec?.platform === "x") { const bio = normalizeLinkUrl(pubLast?.website); if (bio) return { url: bio, from: "bio" }; }
  return null;
}

export function linkStatsSQL(urls, { dataset, orgId, days = 120 }) {
  const list = [...new Set(urls.map(normalizeLinkUrl).filter(Boolean))];
  if (!list.length) return null;
  return `
SELECT CAST(calendar_date AS STRING) AS day, REGEXP_REPLACE(LOWER(link_url), r'^https?://(www\\.)?', '') AS url,
  ANY_VALUE(link_name) AS name, CAST(MIN(creation_date) AS STRING) AS created,
  MAX(clicks) AS clicks, MAX(subs) AS subs, CAST(MAX(revenue) AS FLOAT64) AS revenue
FROM \`${dataset}.onlyfans.links_stats\`
WHERE organization_id = '${orgId}' AND calendar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
  AND REGEXP_REPLACE(LOWER(link_url), r'^https?://(www\\.)?', '') IN (${list.map((u) => `'${u.replace(/'/g, "")}'`).join(",")})
GROUP BY 1, 2`;
}

/** Righe del magazzino → link nello storico del profilo (totali per giorno). */
export function mergeLinkRows(store, url, rows, from) {
  const s = store && store.v === METRICS_VERSION ? { ...store } : { v: METRICS_VERSION, days: {}, posts: {} };
  const mine = rows.filter((r) => r.url === url);
  if (!mine.length) { s.link = { url, from, missing: true, days: {} }; return s; }
  const days = {};
  for (const r of mine) days[r.day] = { clicks: Number(r.clicks) || 0, subs: Number(r.subs) || 0, revenue: Math.round((Number(r.revenue) || 0) * 100) / 100 };
  const last = mine.map((r) => r.day).sort().pop();
  s.link = { url, from, name: mine[0].name || null, created: String(mine[0].created || "").slice(0, 10), days, total: days[last], lastDay: last };
  return s;
}

/** Clic, iscritti e ricavo del link nella settimana (differenza dei totali). */
export function linkWeek(link, wk) {
  if (!link || !link.days || link.missing) return {};
  const days = Object.keys(link.days).sort();
  const inWk = days.filter((d) => weekOfDay(d) === wk);
  if (!inWk.length) return {};
  const end = link.days[inWk[inWk.length - 1]];
  const beforeDay = [...days].reverse().find((d) => d < inWk[0]);
  let start = beforeDay ? link.days[beforeDay] : null;
  // nessun giorno prima: se il link è nato in questa settimana si parte da zero, altrimenti non si sa
  if (!start && link.created && weekOfDay(link.created) === wk) start = { clicks: 0, subs: 0, revenue: 0 };
  if (!start) return { linkPartial: true };
  return {
    linkClicks: end.clicks - start.clicks,
    linkSubs: end.subs - start.subs,
    linkRevenue: Math.round((end.revenue - start.revenue) * 100) / 100,
  };
}

/**
 * Copertura: le visualizzazioni a un giorno dei reel (IG) o dei post (X) di questi giorni contro
 * quelle dei 5-28 giorni prima, sullo stesso profilo. Un crollo con lo Stato dell'account verde è
 * il segno tipico dello shadowban. Servono abbastanza post da tutte e due le parti, altrimenti
 * «pochi dati» (niente allarmi su 1-2 post: una giornata storta non è uno shadowban).
 */
export const REACH = { recentDays: 4, baseFrom: 5, baseTo: 28, minRecent: 3, minBase: 5, minBaseViews: 20, collapse: 0.4, drop: 0.6 };
const median = (a) => { const v = [...a].sort((x, y) => x - y); const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
export function reachCheck(store, platform, now = Date.now()) {
  const D = 86400000;
  const posts = Object.values(store?.posts || {}).filter((p) => p.early != null && (platform === "x" || p.kind === "reel"));
  const recent = posts.filter((p) => now - p.ts <= REACH.recentDays * D).map((p) => p.early);
  const base = posts.filter((p) => now - p.ts >= REACH.baseFrom * D && now - p.ts <= REACH.baseTo * D).map((p) => p.early);
  const out = { nRecent: recent.length, nBase: base.length, recentMedian: recent.length ? median(recent) : null, baseMedian: base.length ? median(base) : null };
  if (recent.length < REACH.minRecent || base.length < REACH.minBase || out.baseMedian < REACH.minBaseViews) return { ...out, status: "pochi_dati" };
  out.ratio = Math.round((out.recentMedian / out.baseMedian) * 100) / 100;
  out.status = out.ratio < REACH.collapse ? "crollo" : out.ratio < REACH.drop ? "calo" : "ok";
  return out;
}

/** I numeri automatici con cui precompilare la scheda «Dati della settimana» (solo campi vuoti). */
export function prefillFor(platform, w) {
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
  if (!w) return {};
  return clean(prefillRaw(platform, w));
}
function prefillRaw(platform, w) {
  if (platform === "x") return { followers: w.followersDelta, views: w.avgViews, eng: w.engagementPct, clicks: w.linkClicks, subs: w.linkSubs, spent: w.linkRevenue };
  return { followers: w.followers, views: w.views };
}

/** Avvisi per «Da non dimenticare» dalla lettura pubblica più recente. */
export function publicAlerts(a, pub, now = Date.now()) {
  const out = [];
  const last = pub?.last;
  if (!last || now - (pub.lastAt || 0) > 4 * 86400000) return out;
  const where = a.platform === "x" ? "su X" : "su Instagram";
  if (last.notFound) out.push({ lev: "bad", t: `Profilo non trovato ${where}: ${a.username}`, d: "L'ultima lettura automatica non trova il profilo pubblico: nome utente cambiato, account chiuso o bannato? Controlla dal telefono e correggi il nome utente o lo stato." });
  else if (last.private) out.push({ lev: "warn", t: `${a.username} risulta privato`, d: "Dal profilo pubblico non si vede niente: se non è il cooldown (dove è voluto), rimettilo pubblico." });
  const r = pub.reach;
  if (!last.notFound && r?.status === "crollo" && (a.state || "online") === "online" && !a.flag) {
    const cosa = a.platform === "x" ? "post" : "reel";
    out.push({ lev: "warn", t: `Visualizzazioni crollate su ${a.username}`, d: `I ${cosa} di questi giorni fanno ${r.recentMedian} visualizzazioni a un giorno, contro le ${r.baseMedian} di prima (${Math.round(r.ratio * 100)}%). Con lo Stato dell'account verde è il segno tipico dello shadowban: controllalo dal telefono e, se confermato, apri la segnalazione.` });
  }
  if (a.platform === "x" && !last.notFound && last.premium === false) out.push({ lev: "warn", t: `Premium non attivo su ${a.username}`, d: "Letto dal profilo pubblico: senza Premium un post fa in media meno di 100 visualizzazioni." });
  return out;
}

/** Costo stimato di un giro (per il tetto sul run). */
export const PRICE = { ig: 0.003, xProfile: 0.0003, xPosts: 0.017 };
export function runBudget(nIg, nX) {
  return Math.ceil((nIg * PRICE.ig + nX * (PRICE.xProfile + PRICE.xPosts)) * 1.5 * 100 + 5) / 100;
}
