// Ispirazioni X (24/10/2026) — logica pura. Reference di creator (soprattutto USA) che usano X per
// portare su OnlyFans: chi sono, quanto girano i loro post, COME pubblicano. Servono come esempio a chi
// pubblica per le nostre creator su X (stesso spirito del Radar creator per Instagram).
//
// Scoperta (apidojo/tweet-scraper, ricerca dei post più forti del periodo): si tengono solo gli autori
// con un link DIRETTO a OnlyFans/Fansly nel profilo o che nominano OnlyFans in bio — i Linktree generici
// sono quasi tutti rumore (testate, squadre: misurato il 24/10, 64 su 92). Poi decide una persona:
// «Tieni» o «Scarta». Delle tenute si leggono gli ultimi 40 post (apidojo/twitter-profile-scraper).
//
// Niente media nella pagina: dei post si mostrano testo, numeri e il link per aprirli su X.

export const XREF_VERSION = "xref-1";
export const STATUSES = { nuova: "Da valutare", tenuta: "Tenuta", scartata: "Scartata" };
export const MIN_FOLLOWERS = 3000;

const OF_DIRECT = /(onlyfans\.com|fansly\.com|fans\.ly|fanvue\.com)/i;
// «OF» solo maiuscolo: con il confronto senza maiuscole prendeva la parola inglese «of»
// (Mercedes F1, un giornalista: prima ricerca del 24/10)
const OF_BIO = /(onlyfans|0nlyfans|only\s?fans|fansly)/i;
const OF_UPPER = /(^|[^A-Za-z])OF([^A-Za-z]|$)|🔞/;
// Le nostre creator sono donne: chi in bio si dichiara uomo non è una reference utile.
// NON usare parole che le creator donne scrivono di sé o del contenuto (husband, bbc, cock…): il 25/10
// toglievano hotwife e creator che vendono contenuti con partner.
const MALE = /(\bhe\s*\/\s*him\b|\bhim\s*\/\s*he\b|\bhe\s*\/\s*they\b|\bgay\b|\balpha\s*male\b|\bstraight\s*(male|guy|man)\b|\bbodybuilder\b|\bmuscle\b|\bdaddy\b|\btwink\b|\bcashmaster\b|\bfirefighter\b|\bboy\b|\bguy\b|\bprince\b|\bking\b|\bdude\b|\bmasc\b|\btwunk\b|\bversatile\b|\bbrazilian\s+top\b|\bbear\b|\bhung\b|\bstud\b|\blad\b|\bstr8\b|\bgay\w*|🍆|🐻|🏳️‍🌈|👨)/i;
const FEMALE = /(\bshe\s*\/\s*her\b|\bgirl\b|\bbabe\b|\bwife\b|\bmom\b|\bmilf\b|\blatina\b|\bpetite\b|\bgoddess\b|\bprincess\b|\bqueen\b|\bbaddie\b|\bblonde\b|\bbrunette\b|\bredhead\b|\bgirlfriend\b|\bwoman\b|\blady\b|\bgf\b|\bher\b|💋|💅|👸|🎀)/i;
// account di marchi/piattaforme (Fansly, negozi): hanno il link ma non sono creator
// + agenzie («Mgmt of Digital Content Creators», prima ricerca con l'API ufficiale 25/10)
const BRAND = /(official\s+(x\s+)?account|subscription-based social media|\bnetwork\b|official twitter of|\bmgmt\b|\bmanagement\b|\bagency\b|\bagencia\b)/i;
export const looksBrand = (a) => BRAND.test(a?.bio || "") || /fansly\.com\/explore/i.test(a?.site || "");
export const looksMale = (a) => MALE.test(`${a?.bio || ""} ${a?.name || ""}`);
export const looksFemale = (a) => FEMALE.test(`${a?.bio || ""} ${a?.name || ""}`);
const US = /\b(usa|united states|america|ca|tx|fl|ny|nyc|la|l\.a\.|miami|texas|california|florida|new york|las vegas|vegas|atlanta|chicago|arizona|ohio|georgia|houston|dallas|austin|denver|seattle|boston|phoenix|nashville|carolina|new jersey|nj|virginia|michigan|colorado|oregon|utah|hawaii)\b/i;

const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/** Ricerche della scoperta: quelle di base + una per nicchia (es. "tattoo", "latina", "fitness"). */
export function discoveryQueries(niches = [], { since } = {}) {
  const s = since ? ` since:${since}` : "";
  // frasi con cui le creator spingono la pagina, su post con media: meno rumore delle parole generiche
  const base = [
    `"my OF" min_faves:300 lang:en filter:media -filter:replies${s}`,
    `"full video" (OF OR onlyfans) min_faves:300 lang:en filter:media -filter:replies${s}`,
    `"link in bio" (girl OR babe OR baddie OR wife) min_faves:500 lang:en filter:media -filter:replies${s}`,
    `"subscribe" onlyfans min_faves:200 lang:en filter:media -filter:replies${s}`,
    `"come see more" min_faves:300 lang:en filter:media -filter:replies${s}`,
    `onlyfans (girl OR babe) min_faves:500 lang:en filter:media -filter:replies${s}`,
  ];
  const nic = niches.map((n) => String(n).trim().replace(/["\\]/g, "")).filter(Boolean).slice(0, 8)
    .map((n) => `${n} (onlyfans OR "my OF" OR "link in bio") min_faves:100 lang:en filter:media -filter:replies${s}`);
  return [...base, ...nic];
}

// --- API ufficiale di X (v2, a consumo: 25/10/2026) ---
// Stessa forma dei post Apify, così scoperta/lettura/analisi restano una sola logica.
// Differenze: la ricerca copre solo gli ultimi 7 giorni e non ha min_faves → si ordina per rilevanza
// e si filtra per url:"onlyfans.com" (il link nel post: segnale più forte di qualsiasi parola).
export const X_PRICE = { post: 0.005, user: 0.01 };
export const X_USER_FIELDS = "description,location,public_metrics,profile_image_url,verified,verified_type,url,entities,created_at";
export const X_TWEET_FIELDS = "created_at,public_metrics,possibly_sensitive,attachments,entities,referenced_tweets,author_id,conversation_id";

export function discoveryQueriesX(niches = []) {
  const tail = "has:media -is:retweet -is:reply lang:en";
  const base = [
    `url:"onlyfans.com" ${tail}`,
    `("my OF" OR "my onlyfans" OR "full video") (onlyfans OR OF) ${tail}`,
    `url:"fansly.com" ${tail}`,
  ];
  const nic = niches.map((n) => String(n).trim().replace(/["\\]/g, "")).filter(Boolean).slice(0, 8)
    .map((n) => `"${n}" (onlyfans OR url:"onlyfans.com" OR "my OF") ${tail}`);
  return [...base, ...nic];
}

/** Utente v2 → autore nella forma Apify. Il link a OnlyFans può stare nel campo sito o nella bio. */
export function userFromXApi(u) {
  if (!u?.username) return null;
  const siteUrls = (u.entities?.url?.urls || []).map((x) => x.expanded_url).filter(Boolean);
  const bioUrls = (u.entities?.description?.urls || []).map((x) => x.expanded_url).filter(Boolean);
  const site = [...siteUrls, ...bioUrls].find((x) => OF_DIRECT.test(x)) || siteUrls[0] || bioUrls[0] || "";
  const pm = u.public_metrics || {};
  return {
    id: u.id, userName: u.username, name: u.name || "", followers: pm.followers_count ?? null, location: u.location || "",
    isBlueVerified: Boolean(u.verified || u.verified_type === "blue"), description: u.description || "",
    profilePicture: u.profile_image_url ? u.profile_image_url.replace("_normal", "_200x200") : null, statusesCount: pm.tweet_count ?? null,
    createdAt: u.created_at || null, entities: { url: { urls: site ? [{ expanded_url: site }] : [] } },
  };
}

/** Post v2 (+ includes) → post nella forma Apify, pronto per slimTweet. */
export function tweetFromXApi(t, { users = {}, media = {}, term = null } = {}) {
  const pm = t.public_metrics || {};
  const refs = (t.referenced_tweets || []).map((r) => r.type);
  const kinds = (t.attachments?.media_keys || []).map((k) => media[k]?.type).filter(Boolean);
  return {
    id: t.id, text: t.text || "", createdAt: t.created_at || null, searchTerm: term,
    viewCount: pm.impression_count ?? null, likeCount: pm.like_count ?? null, replyCount: pm.reply_count ?? null,
    retweetCount: pm.retweet_count ?? null, bookmarkCount: pm.bookmark_count ?? null,
    isReply: refs.includes("replied_to"), isRetweet: refs.includes("retweeted"), isQuote: refs.includes("quoted"),
    sensitive: Boolean(t.possibly_sensitive),
    mediaKind: kinds.includes("video") || kinds.includes("animated_gif") ? "video" : kinds.length ? "foto" : null,
    entities: { urls: (t.entities?.urls || []).map((u) => ({ expanded_url: u.expanded_url })) },
    author: userFromXApi(users[t.author_id]) || {},
  };
}

/** Risposta v2 completa (data + includes) → post nella forma Apify. */
export function postsFromXApi(res, term = null) {
  const users = Object.fromEntries((res?.includes?.users || []).map((u) => [u.id, u]));
  const media = Object.fromEntries((res?.includes?.media || []).map((m) => [m.media_key, m]));
  return (res?.data || []).map((t) => tweetFromXApi(t, { users, media, term }));
}

/** Mappa compatta di un post dell'attore (anche dalla customMapFunction). */
export function slimTweet(o) {
  const a = o.author || {};
  const site = a.entities?.url?.urls?.[0]?.expanded_url || o.site || "";
  const media = o.extendedEntities?.media || o.media || [];
  const kinds = Array.isArray(media) ? media.map((m) => m.type).filter(Boolean) : [];
  const urls = (o.entities?.urls || []).map((u) => u.expanded_url || "").filter(Boolean);
  return {
    id: String(o.id), createdAt: o.createdAt, text: String(o.text || o.fullText || "").slice(0, 280),
    views: num(o.viewCount), likes: num(o.likeCount), replies: num(o.replyCount), reposts: num(o.retweetCount), bookmarks: num(o.bookmarkCount),
    isReply: Boolean(o.isReply), isRetweet: Boolean(o.isRetweet), isQuote: Boolean(o.isQuote), pinned: Boolean(o.isPinned),
    media: kinds.includes("video") || kinds.includes("animated_gif") ? "video" : kinds.length ? "foto" : (o.mediaKind || null),
    linkInPost: urls.some((u) => OF_DIRECT.test(u) || /linktr|beacons|allmylinks|link\.me/i.test(u)),
    term: o.searchTerm || null, sensitive: Boolean(o.sensitive),
    author: a.userName ? {
      u: a.userName, name: a.name || "", f: num(a.followers), loc: a.location || "", blue: Boolean(a.isBlueVerified),
      site, bio: String(a.description || "").slice(0, 300), pic: a.profilePicture || null, posts: num(a.statusesCount), createdAt: a.createdAt || null,
    } : (o.u ? { u: o.u, f: num(o.f), loc: o.loc || "", blue: Boolean(o.blue), site: o.site || "", bio: o.bio || "", name: o.name || "", pic: o.pic || null } : null),
  };
}

/** Un utente di apidojo/twitter-user-scraper (es. dai «seguiti») nella stessa forma di un post. */
export function userAsPost(o, via) {
  return slimTweet({ id: `u-${o.userName || o.u}`, text: "", createdAt: null, searchTerm: via ? `seguiti da @${via}` : null, author: {
    userName: o.userName || o.u, name: o.name || "", followers: o.followers ?? o.f, location: o.location ?? o.loc ?? "", isBlueVerified: o.isBlueVerified ?? o.blue,
    description: o.description ?? o.bio ?? "", profilePicture: o.profilePicture ?? o.pic ?? null, statusesCount: o.statusesCount,
    entities: { url: { urls: (o.entities?.url?.urls || (o.site ? [{ expanded_url: o.site }] : [])).map((u) => ({ expanded_url: u.expanded_url })) } },
  } });
}

/** È una creator che porta su OnlyFans? (link diretto nel profilo, o OnlyFans nominato in bio) */
export function isOfCreator(author) {
  if (!author) return false;
  if (looksMale(author) || looksBrand(author)) return false;
  if (OF_DIRECT.test(author.site || "")) return true;
  return (OF_BIO.test(author.bio || "") || OF_UPPER.test(author.bio || "")) && /linktr|beacons|allmylinks|link\.me|carrd|bio\.link|hoo\.be|snipfeed|getallmylinks|lnk\.bio/i.test(author.site || "");
}
export const looksUS = (author) => US.test(author?.loc || "");

/**
 * Candidate dalla scoperta → nuove reference (quelle già viste, tenute o scartate, non si toccano).
 * Restituisce { added: [...], seen }.
 */
export function candidatesFrom(tweets, existing = {}, { minFollowers = MIN_FOLLOWERS, niche = null, now = Date.now() } = {}) {
  const by = new Map();
  for (const t of tweets) {
    const a = t.author;
    if (!a?.u || !isOfCreator(a) || (a.f || 0) < minFollowers) continue;
    const k = a.u.toLowerCase();
    const cur = by.get(k) || { ...a, found: [] };
    cur.found.push({ id: t.id, views: t.views, text: t.text, term: t.term });
    by.set(k, cur);
  }
  const added = [];
  for (const [k, a] of by) {
    if (existing[k]) continue;
    added.push({
      key: k, u: a.u, name: a.name, f: a.f, loc: a.loc, us: looksUS(a), female: looksFemale(a), blue: a.blue, site: a.site, bio: a.bio, pic: a.pic,
      status: "nuova", niches: niche ? [niche] : [], addedAt: now, note: "",
      foundPost: a.found.sort((x, y) => (y.views || 0) - (x.views || 0))[0] || null,
    });
  }
  return { added, seen: by.size };
}

const median = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

/** Come pubblica una reference: dagli ultimi post (niente repost/risposte). */
export function analyzePosts(posts, now = Date.now()) {
  const own = posts.filter((p) => !p.isRetweet && !p.isReply && p.createdAt);
  if (!own.length) return { n: 0 };
  const ts = own.map((p) => Date.parse(p.createdAt)).filter((x) => !isNaN(x)).sort((a, b) => a - b);
  const spanDays = Math.max(1, (Math.min(now, ts[ts.length - 1]) - ts[0]) / 86400000);
  const views = own.map((p) => p.views);
  const pct = (f) => Math.round((own.filter(f).length / own.length) * 100);
  // ore di pubblicazione in ora di New York (il pubblico USA)
  const hours = {};
  for (const p of own) {
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(Date.parse(p.createdAt))));
    if (!isNaN(h)) hours[h] = (hours[h] || 0) + 1;
  }
  const topHours = Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => Number(h));
  const top = [...own].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5)
    .map((p) => ({ id: p.id, createdAt: p.createdAt, text: p.text, views: p.views, likes: p.likes, replies: p.replies, media: p.media, linkInPost: p.linkInPost }));
  const lens = own.map((p) => (p.text || "").replace(/https?:\/\/\S+/g, "").trim().length);
  // come risponde ai commenti (arriva solo dall'API ufficiale, che legge anche le risposte)
  const reps = posts.filter((p) => p.isReply && !p.isRetweet && (p.text || "").trim());
  const replies = reps.length ? {
    n: reps.length,
    share: Math.round((reps.length / (reps.length + own.length)) * 100),
    medLen: median(reps.map((p) => (p.text || "").replace(/^(@\w+\s*)+/, "").replace(/https?:\/\/\S+/g, "").trim().length)),
    examples: [...reps].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 4).map((p) => ({ id: p.id, text: (p.text || "").replace(/^(@\w+\s*)+/, "").slice(0, 200), likes: p.likes })),
  } : null;
  return {
    n: own.length,
    perDay: Math.round((own.length / spanDays) * 10) / 10,
    medViews: median(views),
    avgViews: views.filter((v) => v != null).length ? Math.round(views.filter((v) => v != null).reduce((t, v) => t + v, 0) / views.filter((v) => v != null).length) : null,
    pctVideo: pct((p) => p.media === "video"),
    pctPhoto: pct((p) => p.media === "foto"),
    pctText: pct((p) => !p.media),
    pctLinkInPost: pct((p) => p.linkInPost),
    medTextLen: median(lens),
    topHoursET: topHours,
    top,
    replies,
  };
}

/** «Cosa fanno le migliori»: mediane sulle reference tenute con numeri letti. */
export function patterns(refs) {
  const st = refs.filter((r) => r.status === "tenuta" && r.stats?.n >= 5).map((r) => r.stats);
  if (!st.length) return null;
  const hours = {};
  for (const s of st) for (const h of s.topHoursET || []) hours[h] = (hours[h] || 0) + 1;
  return {
    refs: st.length,
    perDay: median(st.map((s) => s.perDay)),
    medViews: median(st.map((s) => s.medViews)),
    pctVideo: median(st.map((s) => s.pctVideo)),
    pctPhoto: median(st.map((s) => s.pctPhoto)),
    pctText: median(st.map((s) => s.pctText)),
    pctLinkInPost: median(st.map((s) => s.pctLinkInPost)),
    medTextLen: median(st.map((s) => s.medTextLen)),
    topHoursET: Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h]) => Number(h)).sort((a, b) => a - b),
  };
}

/** Ora di New York → ora italiana (di solito +6). */
export function etToIt(h, d = new Date()) {
  const off = (tz) => { const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName").value; const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s); return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0)) : 0; };
  const diff = (off("Europe/Rome") - off("America/New_York")) / 60;
  return ((h + diff) % 24 + 24) % 24;
}

export const PRICE = { tweet: 0.0004, profile: 0.016 };
