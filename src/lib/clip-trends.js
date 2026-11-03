// Trend del clipping — ricerche settimanali e archivio (3/11/2026). Logica pura in clip-trends-core.js.
//
// Ogni settimana le ricerche salvate passano su TikTok (clockworks/tiktok-scraper, ricerca video) e
// Instagram (apify/instagram-hashtag-scraper, ricerca per parola): solo contenuti pubblici, nessun
// account. Le ricerche TikTok durano minuti, più del tempo di una funzione: il giro si AVVIA (run
// asincroni Apify) e si RACCOGLIE dopo, quando la pagina viene aperta o al giro notturno seguente.
//
// Chiavi:  clipradar:trends:queries  HASH id → { id, text, country, addedAt, addedBy }
//          clipradar:trends:seeded   le ricerche di partenza sono già state messe (una volta sola)
//          clipradar:trends:job      il giro in corso { startedAt, by, queries, runs: { tt_eng, tt_ita, ig } }
//          clipradar:trends:last     l'ultimo giro raccolto { at, formats, sounds, candidates, usd, errors }
// TikTok cerca «da un paese» (proxyCountryCode): le ricerche inglesi come le vede un utente
// americano, quelle italiane come un utente italiano. Un run per paese, Instagram uno solo.
// La spesa va nello stesso tetto mensile del Radar (clipradar:spend:{YYYY-MM}).
import { kv } from "@vercel/kv";
import { apifyConfigured, capUsd, spentThisMonth, addSpend, listProfiles } from "@/lib/clip-radar";
import {
  DEFAULT_QUERIES, MAX_QUERIES, PER_QUERY, TREND_PRICE, COUNTRY_ADDON, SEARCH_COUNTRY, parseQuery, queryId, normalizeTrendRow,
  buildTrends, candidateAccounts, prevSnapshot, trendBudget, trendsDue,
} from "@/lib/clip-trends-core";

const API = "https://api.apify.com/v2";
const TT_ACTOR = "clockworks~tiktok-scraper";
const IG_ACTOR = "apify~instagram-hashtag-scraper";
const Q = "clipradar:trends:queries";
const SEEDED = "clipradar:trends:seeded";
const JOB = "clipradar:trends:job";
const LAST = "clipradar:trends:last";
const JOB_MAX_MS = 40 * 60_000; // oltre, un giro bloccato si chiude con quello che c'è
const token = () => encodeURIComponent(process.env.APIFY_TOKEN);
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

// solo i campi che servono: i risultati TikTok completi pesano decine di KB l'uno
const TT_FIELDS = "id,text,textLanguage,createTime,createTimeISO,webVideoUrl,playCount,diggCount,commentCount,shareCount,collectCount,isPinned,isSlideshow,searchQuery,authorMeta,musicMeta,videoMeta";
const IG_FIELDS = "shortCode,type,productType,videoDuration,timestamp,ownerUsername,url,videoPlayCount,videoViewCount,likesCount,commentsCount,sharesCount,displayUrl,caption,musicInfo,isPinned,inputUrl,error";

async function apify(path, init) {
  const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}token=${token()}`, { cache: "no-store", ...init });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}
async function startRun(actor, input, maxUsd) {
  const d = await apify(`/acts/${actor}/runs?timeout=900&maxTotalChargeUsd=${maxUsd}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return { id: d.data.id, ds: d.data.defaultDatasetId };
}

export async function listQueries() {
  if (!(await kv.get(SEEDED))) {
    const at = Date.now();
    const seed = Object.fromEntries(DEFAULT_QUERIES.map((q) => {
      const id = queryId(q.country, q.text);
      return [id, JSON.stringify({ id, text: q.text, country: q.country, addedAt: at, addedBy: "Ricerche di partenza" })];
    }));
    await kv.hset(Q, seed);
    await kv.set(SEEDED, at);
  }
  const h = (await kv.hgetall(Q)) || {};
  return Object.values(h).map(parse).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

export async function addQuery({ text, country }, by) {
  const t = parseQuery(text);
  if (!t) throw new Error("Scrivi una ricerca di 3-60 caratteri, come la scriveresti su TikTok («me when him»)");
  const c = country === "ita" ? "ita" : "eng";
  const id = queryId(c, t);
  const all = await listQueries();
  if (all.some((q) => q.id === id)) return { id, exists: true };
  if (all.length >= MAX_QUERIES) throw new Error(`Al massimo ${MAX_QUERIES} ricerche: togline una prima`);
  await kv.hset(Q, { [id]: JSON.stringify({ id, text: t, country: c, addedAt: Date.now(), addedBy: by?.name || null }) });
  return { id };
}

export const removeQuery = (id) => kv.hdel(Q, String(id));

/**
 * Avvia il giro di ricerche (se non ce n'è già uno e se è il momento, o `force`).
 * Ritorna { started } | { busy } | { idle } | { skip }.
 */
export async function startTrends({ force = false, by = null } = {}) {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const job = parse(await kv.get(JOB));
  if (job && Date.now() - job.startedAt < JOB_MAX_MS) return { busy: true };
  const last = parse(await kv.get(LAST));
  if (!force && !trendsDue(last, Date.now())) return { idle: true };
  const queries = await listQueries();
  if (!queries.length) return { skip: "no-queries" };
  const planned = trendBudget(queries.length);
  const spent = await spentThisMonth();
  if (spent + planned > capUsd()) return { skip: "cap", spent, planned, cap: capUsd() };
  // TikTok: un run per paese (ricerche inglesi dagli USA, italiane dall'Italia); Instagram: uno solo
  const byCountry = {};
  for (const q of queries) (byCountry[q.country] ||= new Set()).add(q.text);
  const ttUsd = (n) => Math.round((n * PER_QUERY.tt * (TREND_PRICE.tt + COUNTRY_ADDON) * 1.5 + 0.02) * 100) / 100;
  const texts = [...new Set(queries.map((q) => q.text))];
  const starts = Object.entries(byCountry).map(([c, set]) => [`tt_${c}`,
    startRun(TT_ACTOR, { searchQueries: [...set], resultsPerPage: PER_QUERY.tt, searchSection: "/video", proxyCountryCode: SEARCH_COUNTRY[c] || "None", shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false }, ttUsd(set.size))]);
  starts.push(["ig", startRun(IG_ACTOR, { hashtags: texts, keywordSearch: true, resultsType: "reels", resultsLimit: PER_QUERY.ig }, Math.round((texts.length * PER_QUERY.ig * TREND_PRICE.ig * 1.5 + 0.02) * 100) / 100)]);
  const done = await Promise.all(starts.map(([k, pr]) => pr.then((r) => [k, r]).catch((e) => [k, { error: e.message }])));
  const runs = Object.fromEntries(done);
  if (Object.values(runs).every((r) => r.error)) throw new Error(Object.values(runs)[0].error);
  await kv.set(JOB, { startedAt: Date.now(), by: by?.name || null, queries: queries.map((q) => q.id), runs });
  return { started: true, planned };
}

async function runItems(run, fields) {
  if (!run?.id) return { done: true, items: [], error: run?.error || null };
  const st = await apify(`/actor-runs/${run.id}`);
  const status = st?.data?.status;
  if (status === "READY" || status === "RUNNING") return { done: false };
  // anche un giro finito male (tetto di spesa, tempo) ha i risultati raccolti fin lì
  const items = await apify(`/datasets/${run.ds}/items?clean=true&fields=${fields}&limit=2000`).catch(() => []);
  return { done: true, items: Array.isArray(items) ? items : [], error: status === "SUCCEEDED" ? null : `ricerca ${status?.toLowerCase() || "non riuscita"}` };
}

/**
 * Se c'è un giro avviato e i run Apify sono finiti, raccoglie i risultati e calcola i trend.
 * Ritorna { collected } | { pending } | { none }.
 */
export async function collectTrends() {
  const job = parse(await kv.get(JOB));
  if (!job) return { none: true };
  if (!(await kv.set(`${JOB}:lock`, 1, { nx: true, ex: 120 }))) return { pending: true };
  try {
    const late = Date.now() - job.startedAt > JOB_MAX_MS;
    // giri vecchi (prima del 3/11 sera) hanno «tt»; quelli nuovi «tt_eng», «tt_ita»
    const keys = Object.keys(job.runs || {});
    const res = await Promise.all(keys.map((k) => runItems(job.runs[k], k.startsWith("tt") ? TT_FIELDS : IG_FIELDS).then((r) => [k, r])));
    if (res.some(([, r]) => !r.done) && !late) return { pending: true };
    const posts = [], errors = [];
    let usd = 0.002;
    for (const [k, r] of res) {
      const plat = k.startsWith("tt") ? "tt" : "ig";
      for (const row of r.items || []) { const p = normalizeTrendRow(row, plat); if (p) posts.push(p); }
      usd += (r.items?.length || 0) * (plat === "tt" ? TREND_PRICE.tt + COUNTRY_ADDON : TREND_PRICE.ig);
      const name = k === "ig" ? "Instagram" : `TikTok ${k.slice(3).toUpperCase() || ""}`.trim();
      if (r.error) errors.push(`${name}: ${r.error}`);
      if (!r.done) errors.push(`${name}: non ha finito in tempo`);
    }
    usd = Math.round(usd * 1000) / 1000;
    await addSpend(usd);
    const queries = (await listQueries()).filter((q) => (job.queries || []).includes(q.id));
    const last = parse(await kv.get(LAST));
    const prev = last?.formats ? prevSnapshot(last.formats) : {};
    const now = Date.now();
    const { formats, sounds } = buildTrends(queries, posts, prev, now);
    const known = (await listProfilesSafe()).map((p) => p.id);
    const candidates = candidateAccounts(posts, queries, known, now);
    await kv.set(LAST, { at: now, startedAt: job.startedAt, by: job.by, formats, sounds, candidates, usd, posts: posts.length, errors, prevAt: last?.at || null });
    await kv.del(JOB);
    return { collected: true, posts: posts.length, usd };
  } finally {
    await kv.del(`${JOB}:lock`).catch(() => {});
  }
}

/** Giro notturno: raccoglie quello avviato la notte prima, poi avvia il nuovo se è passata una settimana. */
export async function weeklyTrends() {
  if (!apifyConfigured()) return { skip: "no-apify-token" };
  const c = await collectTrends();
  const s = c.pending ? { busy: true } : await startTrends();
  return { collect: c, start: s };
}

const listProfilesSafe = () => listProfiles().catch(() => []);

export async function loadTrends() {
  const [queries, last, job, spent, profiles] = await Promise.all([listQueries(), kv.get(LAST), kv.get(JOB), spentThisMonth(), listProfilesSafe()]);
  const j = parse(job);
  const l = parse(last) || null;
  // chi nel frattempo è entrato nel Radar non si propone più
  const inRadar = new Set(profiles.map((p) => p.id));
  if (l?.candidates) l.candidates = l.candidates.filter((c) => !inRadar.has(c.id));
  return {
    queries, last: l,
    running: j ? { startedAt: j.startedAt, by: j.by } : null,
    spent: Math.round(spent * 100) / 100, cap: capUsd(), budget: trendBudget(queries.length),
  };
}
