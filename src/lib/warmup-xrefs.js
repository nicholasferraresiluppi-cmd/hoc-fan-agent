// Ispirazioni X — archivio e giri Apify (logica in warmup-xrefs-core.js).
//
// KV `xref:data` = un documento compresso { v, refs: { handle: reference }, log: [...] }: poche centinaia
// di reference, letto solo dalla scheda Ispirazioni. Ogni scrittura rilegge il documento appena prima.
// Spesa: scoperta ~400 post (~0,16 $), lettura ~1,6 cent a reference; al massimo 4 giri manuali al giorno.
//
// Dal 25/10/2026 c'è anche l'API ufficiale di X (x-api.js): con la chiave configurata i giri passano
// da lì — vede la ricerca vera (Apify da fuori la vede monca: X nasconde i contenuti sensibili a chi
// non è entrato) e legge anche le RISPOSTE delle creator. Costa di più (0,5 cent a post, 1 cent a
// profilo): una scoperta ~2-3 $, una lettura ~30 cent a reference. Senza chiave resta Apify.
import { kv } from "@vercel/kv";
import { gzipSync, gunzipSync } from "node:zlib";
import { XREF_VERSION, STATUSES, discoveryQueries, slimTweet, candidatesFrom, analyzePosts, patterns, PRICE, isOfCreator, userAsPost,
  discoveryQueriesX, postsFromXApi, userFromXApi, X_PRICE, looksExplicit } from "@/lib/warmup-xrefs-core";
import { xApiConfigured, searchRecent, usersByUsernames, userTimeline, userFollowing } from "@/lib/x-api";

const KEY = "xref:data";
const API = "https://api.apify.com/v2";
const SEARCH_ACTOR = "apidojo~tweet-scraper";
const PROFILE_ACTOR = "apidojo~twitter-profile-scraper";
const USER_ACTOR = "apidojo~twitter-user-scraper";
const FOLLOWING_PER_SEED = 150;
const MAX_SEEDS = 5;
const GZ = "gz1:";
const MAX_RUNS_PER_DAY = 4;
const STALE_DAYS = 7;

const enc = (v) => GZ + gzipSync(Buffer.from(JSON.stringify(v), "utf8")).toString("base64");
const dec = (raw) => (typeof raw === "string" && raw.startsWith(GZ) ? JSON.parse(gunzipSync(Buffer.from(raw.slice(GZ.length), "base64")).toString("utf8")) : raw || null);
const fresh = () => ({ v: XREF_VERSION, refs: {}, log: [] });

async function load() { const d = dec(await kv.get(KEY)); return d && d.v === XREF_VERSION ? d : fresh(); }
async function save(doc) { doc.at = Date.now(); doc.log = (doc.log || []).slice(-50); await kv.set(KEY, enc(doc)); }

export const apifyConfigured = () => Boolean(process.env.APIFY_TOKEN);
const engine = () => (xApiConfigured() ? "x" : apifyConfigured() ? "apify" : null);
const usd = (x) => Math.round(x * 100) / 100;

// compatta il post già su Apify: viaggia meno roba
const MAP_FN = `(o) => { const a = o.author || {}; const m = (o.extendedEntities && o.extendedEntities.media) || []; const k = m.map((x) => x.type);
  return { id: o.id, searchTerm: o.searchTerm, viewCount: o.viewCount, likeCount: o.likeCount, replyCount: o.replyCount, retweetCount: o.retweetCount, bookmarkCount: o.bookmarkCount,
    createdAt: o.createdAt, text: (o.text || "").slice(0, 280), isReply: o.isReply, isRetweet: o.isRetweet, isQuote: o.isQuote, isPinned: o.isPinned,
    mediaKind: k.indexOf("video") >= 0 || k.indexOf("animated_gif") >= 0 ? "video" : k.length ? "foto" : null,
    entities: { urls: ((o.entities && o.entities.urls) || []).map((u) => ({ expanded_url: u.expanded_url })) },
    author: { userName: a.userName, name: a.name, followers: a.followers, location: a.location, isBlueVerified: a.isBlueVerified, description: a.description,
      profilePicture: a.profilePicture, statusesCount: a.statusesCount, createdAt: a.createdAt,
      entities: { url: { urls: ((a.entities && a.entities.url && a.entities.url.urls) || []).map((u) => ({ expanded_url: u.expanded_url })) } } } }; }`;

async function runSync(actor, input, maxUsd, timeout = 240) {
  const url = `${API}/acts/${actor}/run-sync-get-dataset-items?timeout=${timeout}&maxTotalChargeUsd=${maxUsd}&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`Apify ${r.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : [];
}

function spendGuard(doc) {
  const today = new Date().toISOString().slice(0, 10);
  const n = (doc.log || []).filter((l) => l.day === today && (l.kind === "scoperta" || l.kind === "lettura")).length;
  if (n >= MAX_RUNS_PER_DAY) throw new Error(`Oggi sono già stati fatti ${n} giri: si riprova domani`);
  return today;
}

export async function getXrefs() {
  const doc = await load();
  const refs = Object.values(doc.refs).map((r) => ({ ...r, explicit: looksExplicit(r) }));
  const counts = Object.fromEntries(Object.keys(STATUSES).map((k) => [k, refs.filter((r) => r.status === k).length]));
  return { refs, counts, patterns: patterns(refs), log: (doc.log || []).slice(-10).reverse(), configured: Boolean(engine()), engine: engine() };
}

/** Le «da valutare» trovate con regole vecchie e che oggi non passano il filtro escono (tenute e scartate restano). */
function prune(doc) {
  let n = 0;
  for (const [k, r] of Object.entries(doc.refs)) if (r.status === "nuova" && !r.manual && !isOfCreator(r)) { delete doc.refs[k]; n++; }
  return n;
}

/** Cerca nuove reference (ricerca dei post forti dell'ultimo mese, eventualmente su una nicchia). */
export async function discover({ niche = null, by } = {}) {
  if (!engine()) throw new Error("Né l'API di X né Apify sono configurati");
  const doc = await load();
  const day = spendGuard(doc);
  if (engine() === "x") return discoverX({ niche, by, day });
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const terms = niche ? discoveryQueries([niche], { since }).slice(-1) : discoveryQueries([], { since });
  const maxItems = niche ? 200 : 400;
  const rows = await runSync(SEARCH_ACTOR, { searchTerms: terms, maxItems, sort: "Top", includeSearchTerms: true, customMapFunction: MAP_FN }, Math.ceil(maxItems * PRICE.tweet * 1.3 * 100 + 5) / 100);
  const tweets = rows.map(slimTweet);
  const fresh2 = await load(); // rilettura appena prima di scrivere
  const pruned = prune(fresh2);
  const { added, seen } = candidatesFrom(tweets, fresh2.refs, { niche });
  for (const r of added) fresh2.refs[r.key] = r;
  fresh2.log.push({ at: Date.now(), day, kind: "scoperta", niche, by: by?.name || "", posts: tweets.length, creators: seen, added: added.length, pruned, usd: Math.round(tweets.length * PRICE.tweet * 100) / 100 });
  await save(fresh2);
  return { posts: tweets.length, creators: seen, added: added.length, pruned };
}

async function discoverX({ niche, by, day }) {
  const terms = niche ? discoveryQueriesX([niche]).slice(-1) : discoveryQueriesX([]);
  const tweets = [];
  let users = 0;
  for (const q of terms) {
    const res = await searchRecent(q, 100);
    users += (res.includes?.users || []).length;
    tweets.push(...postsFromXApi(res, q).map(slimTweet));
  }
  const fresh2 = await load();
  const pruned = prune(fresh2);
  const { added, seen } = candidatesFrom(tweets, fresh2.refs, { niche });
  for (const r of added) fresh2.refs[r.key] = r;
  const sensitive = tweets.filter((t) => t.sensitive).length;
  fresh2.log.push({ at: Date.now(), day, kind: "scoperta", src: "x", niche, by: by?.name || "", posts: tweets.length, sensitive, creators: seen, added: added.length, pruned,
    usd: usd(tweets.length * X_PRICE.post + users * X_PRICE.user) });
  await save(fresh2);
  return { posts: tweets.length, sensitive, creators: seen, added: added.length, pruned };
}

/** Id X delle reference (servono a «seguiti» e post): quelli mancanti si chiedono in un colpo solo. */
async function ensureIds(doc, list) {
  const miss = list.filter((r) => !r.xid).map((r) => r.u);
  let users = [];
  for (let i = 0; i < miss.length; i += 100) users.push(...((await usersByUsernames(miss.slice(i, i + 100))).data || []));
  for (const u of users) { const r = doc.refs[u.username.toLowerCase()]; if (r) r.xid = u.id; }
  return { users, cost: users.length * X_PRICE.user };
}

/**
 * Allarga dalla rete: le creator si seguono tra loro, quindi dai «seguiti» delle reference tenute
 * escono creator simili (misurato il 24/10: 3 creator → 49 con link OnlyFans e ≥5.000 follower,
 * contro 14 dalla ricerca nei post). Senza tenute si parte dalle «da valutare» più grandi.
 * Costo: ~1,6 cent a creator di partenza + 0,04 cent a seguito letto (~8 cent a partenza).
 */
export async function discoverNetwork({ by } = {}) {
  if (!engine()) throw new Error("Né l'API di X né Apify sono configurati");
  const doc = await load();
  const day = spendGuard(doc);
  prune(doc);
  const all = Object.values(doc.refs);
  const used = new Set(doc.seedsUsed || []);
  const pick = (arr) => arr.filter((r) => !used.has(r.key)).sort((a, b) => (b.f || 0) - (a.f || 0));
  let seeds = pick(all.filter((r) => r.status === "tenuta"));
  // senza tenute si parte SOLO da chi si dichiara donna: da partenze non scelte da una persona la rete
  // porta i suoi simili, anche uomini (visto il 24/10: da tre partenze maschili, altri creator uomini)
  if (!seeds.length) seeds = pick(all.filter((r) => r.status === "nuova" && r.female === true));
  seeds = seeds.slice(0, MAX_SEEDS);
  if (!seeds.length) throw new Error("Nessuna reference da cui partire: tieni qualche creator, oppure fai prima una ricerca nei post");
  if (engine() === "x") return networkX({ doc, seeds, by, day });
  const rows = await runSync(USER_ACTOR, { twitterHandles: seeds.map((r) => r.u), getFollowing: true, maxItems: FOLLOWING_PER_SEED * seeds.length },
    Math.ceil((seeds.length * PRICE.profile + FOLLOWING_PER_SEED * seeds.length * PRICE.tweet) * 1.4 * 100 + 5) / 100);
  const posts = rows.filter((o) => o.userName).map((o) => userAsPost(o, null));
  const fresh2 = await load();
  prune(fresh2);
  const { added, seen } = candidatesFrom(posts, fresh2.refs, { minFollowers: 5000 });
  for (const r of added) { r.via = seeds.map((x) => x.u).slice(0, 3); fresh2.refs[r.key] = r; }
  fresh2.seedsUsed = [...new Set([...(fresh2.seedsUsed || []), ...seeds.map((x) => x.key)])].slice(-500);
  fresh2.log.push({ at: Date.now(), day, kind: "scoperta", niche: "rete", by: by?.name || "", posts: posts.length, creators: seen, added: added.length,
    usd: Math.round((seeds.length * PRICE.profile + posts.length * PRICE.tweet) * 100) / 100 });
  await save(fresh2);
  return { seeds: seeds.map((x) => x.u), read: posts.length, creators: seen, added: added.length };
}

async function networkX({ doc, seeds, by, day }) {
  const { cost } = await ensureIds(doc, seeds);
  const posts = [];
  for (const s of seeds) {
    const id = doc.refs[s.key]?.xid;
    if (!id) continue;
    const res = await userFollowing(id, FOLLOWING_PER_SEED);
    posts.push(...(res.data || []).map((u) => userAsPost(userFromXApi(u), null)));
  }
  const fresh2 = await load();
  prune(fresh2);
  for (const s of seeds) if (doc.refs[s.key]?.xid && fresh2.refs[s.key]) fresh2.refs[s.key].xid = doc.refs[s.key].xid;
  const { added, seen } = candidatesFrom(posts, fresh2.refs, { minFollowers: 5000 });
  for (const r of added) { r.via = seeds.map((x) => x.u).slice(0, 3); fresh2.refs[r.key] = r; }
  fresh2.seedsUsed = [...new Set([...(fresh2.seedsUsed || []), ...seeds.map((x) => x.key)])].slice(-500);
  fresh2.log.push({ at: Date.now(), day, kind: "scoperta", src: "x", niche: "rete", by: by?.name || "", posts: posts.length, creators: seen, added: added.length,
    usd: usd(cost + posts.length * X_PRICE.user) });
  await save(fresh2);
  return { seeds: seeds.map((x) => x.u), read: posts.length, creators: seen, added: added.length };
}

/** Legge gli ultimi 40 post delle reference indicate (default: le tenute senza numeri o vecchi di 7 giorni). */
export async function analyze({ keys = null, by, auto = false } = {}) {
  if (!engine()) throw new Error("Né l'API di X né Apify sono configurati");
  const doc = await load();
  const day = auto ? new Date().toISOString().slice(0, 10) : spendGuard(doc);
  const stale = (r) => !r.stats?.at || Date.now() - r.stats.at > STALE_DAYS * 86400000;
  let list = keys ? keys.map((k) => doc.refs[String(k).toLowerCase()]).filter(Boolean) : Object.values(doc.refs).filter((r) => r.status === "tenuta" && stale(r));
  list = list.slice(0, 30);
  if (!list.length) return { read: 0 };
  if (engine() === "x") return analyzeX({ doc, list, by, day, auto });
  const rows = await runSync(PROFILE_ACTOR, { twitterHandles: list.map((r) => r.u), maxItems: 40 * list.length, getAboutData: false, customMapFunction: MAP_FN }, Math.ceil(list.length * PRICE.profile * 1.5 * 100 + 5) / 100);
  const byU = new Map();
  for (const t of rows.map(slimTweet)) { const k = t.author?.u?.toLowerCase(); if (!k) continue; if (!byU.has(k)) byU.set(k, []); byU.get(k).push(t); }
  const fresh2 = await load();
  let read = 0;
  for (const r of list) {
    const cur = fresh2.refs[r.key];
    if (!cur) continue;
    const posts = byU.get(r.key) || [];
    const a = posts.find((p) => p.author)?.author;
    if (a) Object.assign(cur, { f: a.f ?? cur.f, blue: a.blue, site: a.site || cur.site, bio: a.bio || cur.bio, pic: a.pic || cur.pic, name: a.name || cur.name, loc: a.loc || cur.loc });
    cur.stats = { at: Date.now(), ...analyzePosts(posts) };
    read++;
  }
  fresh2.log.push({ at: Date.now(), day, kind: auto ? "lettura automatica" : "lettura", by: by?.name || "", read, usd: Math.round(list.length * PRICE.profile * 100) / 100 });
  await save(fresh2);
  return { read };
}

// con l'API ufficiale: 60 post a reference (risposte comprese) → ~30 cent; al massimo 15 a giro
async function analyzeX({ doc, list, by, day, auto }) {
  list = list.slice(0, 15);
  const { users, cost } = await ensureIds(doc, list);
  const prof = new Map(users.map((u) => [u.username.toLowerCase(), userFromXApi(u)]));
  const fresh2 = await load();
  let read = 0, posts = 0;
  for (const r of list) {
    const id = doc.refs[r.key]?.xid;
    const cur = fresh2.refs[r.key];
    if (!id || !cur) continue;
    cur.xid = id;
    const res = await userTimeline(id, 60);
    const mine = postsFromXApi(res).map(slimTweet);
    posts += mine.length;
    const a = prof.get(r.key);
    if (a) Object.assign(cur, { f: a.followers ?? cur.f, blue: a.isBlueVerified, site: a.entities.url.urls[0]?.expanded_url || cur.site, bio: a.description || cur.bio, pic: a.profilePicture || cur.pic, name: a.name || cur.name, loc: a.location || cur.loc });
    cur.stats = { at: Date.now(), src: "x", ...analyzePosts(mine) };
    read++;
  }
  fresh2.log.push({ at: Date.now(), day, kind: auto ? "lettura automatica" : "lettura", src: "x", by: by?.name || "", read, usd: usd(cost + posts * X_PRICE.post) });
  await save(fresh2);
  return { read, posts };
}

/** Prova da pochi centesimi: la chiave funziona? arrivano anche i post segnati come sensibili? */
export async function checkXApi() {
  if (!xApiConfigured()) throw new Error("La chiave dell'API di X non è configurata");
  const res = await searchRecent('url:"onlyfans.com" has:media -is:retweet -is:reply lang:en', 10);
  const posts = postsFromXApi(res).map(slimTweet);
  const doc = await load();
  doc.log.push({ at: Date.now(), day: new Date().toISOString().slice(0, 10), kind: "prova API", src: "x", posts: posts.length, usd: usd(posts.length * X_PRICE.post + (res.includes?.users || []).length * X_PRICE.user) });
  await save(doc);
  return { posts: posts.length, sensitive: posts.filter((p) => p.sensitive).length, authors: [...new Set(posts.map((p) => p.author?.u).filter(Boolean))].slice(0, 10),
    ofCreators: posts.filter((p) => isOfCreator(p.author)).length };
}

export async function setStatus(key, status, by) {
  if (!STATUSES[status]) throw new Error("Stato non valido");
  const doc = await load();
  const r = doc.refs[String(key).toLowerCase()];
  if (!r) throw new Error("Reference non trovata");
  r.status = status; r.statusBy = by?.name || ""; r.statusAt = Date.now();
  await save(doc);
  return r;
}
export async function setNote(key, note, niches) {
  const doc = await load();
  const r = doc.refs[String(key).toLowerCase()];
  if (!r) throw new Error("Reference non trovata");
  if (note !== undefined) r.note = String(note || "").slice(0, 500);
  if (Array.isArray(niches)) r.niches = [...new Set(niches.map((n) => String(n).trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  await save(doc);
  return r;
}
/** Aggiunge a mano una reference che conoscete già (nasce «tenuta»; i numeri al primo giro). */
export async function addManual(handle, by) {
  const h = String(handle || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "").split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) throw new Error("Handle X non valido");
  const doc = await load();
  const k = h.toLowerCase();
  if (doc.refs[k]) { doc.refs[k].status = "tenuta"; } else doc.refs[k] = { key: k, u: h, name: "", f: null, loc: "", us: false, blue: false, site: "", bio: "", pic: null, status: "tenuta", niches: [], addedAt: Date.now(), note: "", manual: true, statusBy: by?.name || "" };
  await save(doc);
  return doc.refs[k];
}

/** Giro settimanale automatico (dal cron del Warm-up): rilegge le tenute più vecchie di 7 giorni. */
export async function weeklyRefresh() {
  if (!engine()) return { skip: "no-token" };
  const doc = await load();
  const last = (doc.log || []).filter((l) => l.kind === "lettura automatica").pop();
  if (last && Date.now() - last.at < 6.5 * 86400000) return { idle: true };
  return analyze({ auto: true });
}
