// Trend del clipping — ricerche settimanali e archivio (3/11/2026). Logica pura in clip-trends-core.js.
//
// Ogni settimana le ricerche salvate passano su TikTok (clockworks/tiktok-scraper, ricerca video) e
// Instagram (apify/instagram-hashtag-scraper, ricerca per parola): solo contenuti pubblici, nessun
// account. Le ricerche TikTok durano minuti, più del tempo di una funzione: il giro si AVVIA (run
// asincroni Apify) e si RACCOGLIE dopo, quando la pagina viene aperta o al giro notturno seguente.
//
// Chiavi:  clipradar:trends:queries  HASH id → { id, text, country, addedAt, addedBy }
//          clipradar:trends:seeded   le ricerche di partenza sono già state messe (una volta sola)
//          clipradar:trends:job      il giro in corso { startedAt, by, queries, runs: { tt, ig } }
//          clipradar:trends:last     l'ultimo giro raccolto { at, formats, sounds, usd, errors, prev }
// La spesa va nello stesso tetto mensile del Radar (clipradar:spend:{YYYY-MM}).
import { kv } from "@vercel/kv";
import { apifyConfigured, capUsd, spentThisMonth, addSpend } from "@/lib/clip-radar";
import {
  DEFAULT_QUERIES, MAX_QUERIES, PER_QUERY, TREND_PRICE, parseQuery, queryId, normalizeTrendRow,
  buildTrends, prevSnapshot, trendBudget, trendsDue,
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
const TT_FIELDS = "id,text,createTime,createTimeISO,webVideoUrl,playCount,diggCount,commentCount,shareCount,collectCount,isPinned,isSlideshow,searchQuery,authorMeta,musicMeta,videoMeta";
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
  const texts = [...new Set(queries.map((q) => q.text))];
  const half = Math.round((planned / 2) * 100) / 100;
  const [tt, ig] = await Promise.all([
    startRun(TT_ACTOR, { searchQueries: texts, resultsPerPage: PER_QUERY.tt, searchSection: "/video", shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false }, half).catch((e) => ({ error: e.message })),
    startRun(IG_ACTOR, { hashtags: texts, keywordSearch: true, resultsType: "reels", resultsLimit: PER_QUERY.ig }, half).catch((e) => ({ error: e.message })),
  ]);
  if (tt.error && ig.error) throw new Error(tt.error);
  await kv.set(JOB, { startedAt: Date.now(), by: by?.name || null, queries: queries.map((q) => q.id), runs: { tt, ig } });
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
    const [tt, ig] = await Promise.all([runItems(job.runs?.tt, TT_FIELDS), runItems(job.runs?.ig, IG_FIELDS)]);
    if ((!tt.done || !ig.done) && !late) return { pending: true };
    const posts = [
      ...(tt.items || []).map((r) => normalizeTrendRow(r, "tt")),
      ...(ig.items || []).map((r) => normalizeTrendRow(r, "ig")),
    ].filter(Boolean);
    const usd = Math.round(((tt.items?.length || 0) * TREND_PRICE.tt + (ig.items?.length || 0) * TREND_PRICE.ig + 0.002) * 1000) / 1000;
    await addSpend(usd);
    const queries = (await listQueries()).filter((q) => (job.queries || []).includes(q.id));
    const last = parse(await kv.get(LAST));
    const prev = last?.formats ? prevSnapshot(last.formats) : {};
    const { formats, sounds } = buildTrends(queries, posts, prev, Date.now());
    const errors = [tt.error && `TikTok: ${tt.error}`, ig.error && `Instagram: ${ig.error}`, (!tt.done || !ig.done) && "una ricerca non ha finito in tempo"].filter(Boolean);
    await kv.set(LAST, { at: Date.now(), startedAt: job.startedAt, by: job.by, formats, sounds, usd, posts: posts.length, errors, prevAt: last?.at || null });
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

export async function loadTrends() {
  const [queries, last, job, spent] = await Promise.all([listQueries(), kv.get(LAST), kv.get(JOB), spentThisMonth()]);
  const j = parse(job);
  return {
    queries, last: parse(last) || null,
    running: j ? { startedAt: j.startedAt, by: j.by } : null,
    spent: Math.round(spent * 100) / 100, cap: capUsd(), budget: trendBudget(queries.length),
  };
}
