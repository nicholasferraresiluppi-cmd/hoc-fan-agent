// Trend del clipping — logica pura (3/11/2026). La usano API, pagina e test.
//
// Richiesta di Nicholas: «per il clipping è molto importante pubblicare i meme in trend». Il Radar
// guarda PROFILI scelti a mano; un trend invece nasce su decine di account piccoli che rifanno lo
// stesso formato nelle stesse settimane (es. la cascata «me when him»: 9,1 mln su un profilo da 2 mila
// follower, poi rifatta da decine di altri). Per trovarlo si cerca per FORMATO, non per profilo:
// ogni settimana le ricerche salvate («me when him», «behind the screen»…) passano su TikTok e
// Instagram, e qui si misura quanto il formato è vivo adesso.
//
// Il segnale di trend, in ordine di peso:
//  1. tanti ACCOUNT DIVERSI con video recenti (≤30 giorni) sopra le 50 mila visualizzazioni: un solo
//     video virale è un caso, dieci account diversi sono un formato che funziona;
//  2. le CONDIVISIONI sulle visualizzazioni: i meme di coppia si mandano al fidanzato o all'amica,
//     ed è la condivisione in privato che porta un profilo nuovo a chi non lo segue;
//  3. account PICCOLI (<10 mila follower) che fanno numeri: lì il merito è del formato, non del profilo;
//  4. la direzione rispetto alla settimana prima (in salita / stabile / in calo).
// Gli audio che tornano su più account (stesso id audio) sono l'altro segno di trend: si mostrano a
// parte, perché su Instagram e TikTok l'audio è spesso il trend stesso.
import { normalizeIg, normalizeTt } from "./clip-radar-core.js";

export const TRENDS_VERSION = "cliptrend-1";
export const TREND_DAYS = 30;          // «recente»
export const HIT_VIEWS = 50_000;       // un video che ha preso
export const SMALL_ACCOUNT = 10_000;   // follower sotto cui un exploit è merito del formato
export const MIN_SOUND_ACCOUNTS = 3;   // account diversi perché un audio conti come trend
export const MAX_QUERIES = 20;
export const PER_QUERY = { tt: 30, ig: 20 };
export const TREND_PRICE = { tt: 0.0023, ig: 0.0021 }; // $ a risultato (listino Apify, tier attuale)
export const REFRESH_DAYS = 7;
export const MAX_CANDIDATES = 30;
// oltre questi follower (solo TikTok li dice) è una pagina media o una celebrità, non una pagina da cui imparare il formato
export const BIG_ACCOUNT = 1_000_000;
// la lingua del testo (TikTok la dice) per tenere i profili proposti nel mercato giusto
const LANG = { eng: "en", ita: "it" };
// da dove si fa la ricerca TikTok: quello che vede un utente americano o italiano (proxyCountryCode)
export const SEARCH_COUNTRY = { eng: "US", ita: "IT" };

// Le ricerche di partenza: i formati trovati a mano il 3/11 (inglese) e i loro equivalenti italiani,
// da correggere dalla pagina. Le ricerche sono il «dove guardare»: si aggiungono e tolgono lì.
export const DEFAULT_QUERIES = [
  { text: "me when him", country: "eng" },
  { text: "me when he texts me", country: "eng" },
  { text: "behind the screen", country: "eng" },
  { text: "american boyfriend", country: "eng" },
  { text: "him relatable", country: "eng" },
  { text: "boyfriend meme", country: "eng" },
  { text: "io quando lui", country: "ita" },
  { text: "pov fidanzato", country: "ita" },
  { text: "meme coppia", country: "ita" },
];

const DAY = 86_400_000;
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

/** Il testo di una ricerca: minuscolo, spazi singoli, 3-60 caratteri. null se non va. */
export function parseQuery(text) {
  const t = String(text || "").replace(/^#/, "").replace(/\s+/g, " ").trim().toLowerCase();
  return t.length >= 3 && t.length <= 60 ? t : null;
}
export const queryId = (country, text) => `${country === "ita" ? "ita" : "eng"}:${text}`;

/** Dall'indirizzo di una ricerca Instagram al testo cercato («…/keyword/?q=me%20when%20him»). */
export function igQueryFromUrl(u) {
  const s = String(u || "");
  const m = /[?&]q=([^&]+)/.exec(s) || /\/tags\/([^/?]+)/.exec(s);
  if (!m) return null;
  try { return parseQuery(decodeURIComponent(m[1].replace(/\+/g, " "))); } catch { return null; }
}

/** Un risultato di ricerca → post comune alle due piattaforme, con la ricerca che l'ha trovato. */
export function normalizeTrendRow(row, platform) {
  if (platform === "tt") {
    const v = normalizeTt(row);
    if (!v || v.slideshow) return null;
    return { ...v, query: parseQuery(row.searchQuery), fans: num(row.authorMeta?.fans),
      lang: row.textLanguage ? String(row.textLanguage).slice(0, 5).toLowerCase() : null,
      soundId: row.musicMeta?.musicId ? `tt:${row.musicMeta.musicId}` : null };
  }
  const v = normalizeIg(row);
  if (!v) return null;
  return { ...v, query: igQueryFromUrl(row.inputUrl) || parseQuery(row.query), fans: null,
    soundId: row.musicInfo?.audio_id ? `ig:${row.musicInfo.audio_id}` : null };
}

const median = (arr) => {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Il migliore video per account (un account che pubblica 5 volte lo stesso formato conta uno). */
function bestPerAccount(posts) {
  const by = new Map();
  for (const p of posts) {
    const k = `${p.platform}:${p.owner}`;
    if (!by.has(k) || (p.views ?? -1) > (by.get(k).views ?? -1)) by.set(k, p);
  }
  return [...by.values()];
}

/**
 * I numeri di un gruppo di post (una ricerca o un audio). Si contano gli account, non i video:
 * `accounts` = account diversi con un video recente, `hits` = quanti di loro sopra HIT_VIEWS,
 * `smallHits` = di questi, quanti con meno di SMALL_ACCOUNT follower (solo TikTok dice i follower).
 */
export function summarize(posts, now) {
  const all = (posts || []).filter(Boolean);
  const recent = all.filter((p) => p.postedAt && now - p.postedAt <= TREND_DAYS * DAY);
  const best = bestPerAccount(recent);
  const hits = best.filter((p) => (p.views ?? 0) >= HIT_VIEWS);
  const withShares = recent.filter((p) => p.shares != null && p.views);
  const sv = withShares.reduce((a, p) => a + p.views, 0);
  const shareRate = sv >= 10_000 ? Math.round((withShares.reduce((a, p) => a + p.shares, 0) / sv) * 1000) / 10 : null;
  const newest = recent.reduce((m, p) => Math.max(m, p.postedAt || 0), 0) || null;
  const examples = [...best].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 4)
    .map(({ id, platform, owner, url, views, shares, postedAt, cover, caption, sound, fans }) => ({ id, platform, owner, url, views, shares, postedAt, cover, caption, sound, fans }));
  return {
    found: all.length,
    recent: recent.length,
    // quota dei risultati usciti negli ultimi 30 giorni: la ricerca mostra i più popolari di sempre,
    // se in cima ci sono video recenti il formato è vivo ADESSO
    recentShare: all.length ? Math.round((recent.length / all.length) * 100) : null,
    accounts: best.length,
    hits: hits.length,
    smallHits: hits.filter((p) => p.fans != null && p.fans < SMALL_ACCOUNT).length,
    medianViews: median(best.map((p) => p.views)),
    shareRate,
    newest,
    examples,
  };
}

/** Rispetto alla settimana prima: «nuovo» se la ricerca non c'era, poi in salita / stabile / in calo sui video che hanno preso. */
export function heat(cur, prev) {
  if (!prev) return "nuovo";
  const r = ((cur?.hits || 0) + 1) / ((prev.hits || 0) + 1);
  if (r >= 1.3) return "in salita";
  if (r <= 0.75) return "in calo";
  return "stabile";
}

/** Ordine dei formati: prima quanti account diversi ci prendono, poi le condivisioni, poi le visualizzazioni. */
const formatRank = (a, b) => (b.hits - a.hits) || ((b.shareRate ?? -1) - (a.shareRate ?? -1)) || ((b.medianViews ?? -1) - (a.medianViews ?? -1));

/**
 * Dal giro di ricerche ai trend da mostrare.
 * queries: [{ id, text, country }]; posts: post normalizzati (con .query); prev: { [queryId]: summary } della settimana prima.
 */
export function buildTrends(queries, posts, prev = {}, now = Date.now()) {
  const byText = new Map();
  for (const p of posts || []) if (p?.query) (byText.get(p.query) || byText.set(p.query, []).get(p.query)).push(p);
  const formats = (queries || []).map((q) => {
    const sm = summarize(byText.get(q.text) || [], now);
    return { id: q.id, text: q.text, country: q.country, ...sm, heat: prev && Object.keys(prev).length ? heat(sm, prev[q.id]) : null };
  }).sort(formatRank);

  // audio che tornano su più account (con il paese della ricerca che li ha trovati)
  const countryOf = new Map((queries || []).map((q) => [q.text, q.country]));
  const bySound = new Map();
  for (const p of posts || []) {
    if (!p?.soundId) continue;
    const g = bySound.get(p.soundId) || { id: p.soundId, name: p.sound || "", posts: [], countries: new Set() };
    g.posts.push(p); g.name = g.name || p.sound || "";
    if (countryOf.has(p.query)) g.countries.add(countryOf.get(p.query));
    bySound.set(p.soundId, g);
  }
  const sounds = [...bySound.values()]
    .map((g) => ({ id: g.id, name: g.name, countries: [...g.countries], ...summarize(g.posts, now) }))
    .filter((s) => s.accounts >= MIN_SOUND_ACCOUNTS && s.hits >= 1)
    .sort(formatRank)
    .slice(0, 12);
  return { formats, sounds };
}

/**
 * Profili da seguire (3/11, Nicholas: «tirarne fuori altri in automatico, per capire che trend ci
 * sono sul mercato americano»): gli account che nelle ricerche della settimana hanno fatto numeri
 * con i formati cercati, e che il Radar non segue ancora. Si PROPONGONO, non si aggiungono da soli:
 * nelle ricerche per parola escono anche pagine fuori nicchia (lifestyle, film, altri paesi) e un
 * clic umano costa meno di un Radar pieno di rumore. Su TikTok si scarta chi scrive in un'altra
 * lingua rispetto al paese della ricerca. Ordine: video sopra le 50 mila, ricerche diverse in cui
 * compare (lo stesso account su più formati = pagina del genere), poi il video migliore.
 */
export function candidateAccounts(posts, queries, known = [], now = Date.now()) {
  const countryOf = new Map((queries || []).map((q) => [q.text, q.country]));
  const skip = new Set(known || []);
  const by = new Map();
  for (const p of posts || []) {
    if (!p?.owner || !p.postedAt || now - p.postedAt > TREND_DAYS * DAY) continue;
    const id = `${p.platform}:${p.owner}`;
    if (skip.has(id)) continue;
    const country = countryOf.get(p.query) || null;
    if (p.platform === "tt" && p.lang && country && !p.lang.startsWith(LANG[country])) continue;
    if (p.fans != null && p.fans > BIG_ACCOUNT) continue;
    const a = by.get(id) || { id, platform: p.platform, handle: p.owner, country, fans: null, posts: [], queries: new Set() };
    a.posts.push(p); a.queries.add(p.query);
    if (p.fans != null) a.fans = p.fans;
    by.set(id, a);
  }
  return [...by.values()].map((a) => {
    const hits = a.posts.filter((p) => (p.views ?? 0) >= HIT_VIEWS).length;
    const best = a.posts.reduce((m, p) => ((p.views ?? -1) > (m.views ?? -1) ? p : m));
    const ws = a.posts.filter((p) => p.shares != null && p.views);
    const sv = ws.reduce((x, p) => x + p.views, 0);
    return {
      id: a.id, platform: a.platform, handle: a.handle, country: a.country, fans: a.fans,
      hits, videos: a.posts.length, queries: [...a.queries].filter(Boolean),
      shareRate: sv >= 10_000 ? Math.round((ws.reduce((x, p) => x + p.shares, 0) / sv) * 1000) / 10 : null,
      best: { url: best.url, views: best.views, cover: best.cover, caption: best.caption, postedAt: best.postedAt },
    };
  })
    .filter((a) => a.hits >= 1)
    .sort((x, y) => (y.hits - x.hits) || (y.queries.length - x.queries.length) || ((y.best.views ?? 0) - (x.best.views ?? 0)))
    .slice(0, MAX_CANDIDATES);
}

/** Il riassunto per ricerca da tenere per la settimana dopo (solo i numeri che servono a `heat`). */
export const prevSnapshot = (formats) => Object.fromEntries((formats || []).map((f) => [f.id, { hits: f.hits, accounts: f.accounts, medianViews: f.medianViews }]));

/** Tetto di spesa di un giro: risultati attesi × prezzo × 1,5 + avvii. */
// TikTok da un paese costa un supplemento a risultato (add-on «Scrape as in country»)
export const COUNTRY_ADDON = 0.0008;
export const trendBudget = (nQueries) => Math.round((nQueries * (PER_QUERY.tt * (TREND_PRICE.tt + COUNTRY_ADDON) + PER_QUERY.ig * TREND_PRICE.ig) * 1.5 + 0.08) * 100) / 100;

/** Il giro va fatto? Una volta a settimana, o subito se non c'è mai stato. */
export const trendsDue = (last, now) => !last?.at || now - last.at >= (REFRESH_DAYS - 0.5) * DAY;
