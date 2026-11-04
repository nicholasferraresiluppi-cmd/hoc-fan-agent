// Radar del clipping — logica pura (29/10/2026). Nessun import: la usano API, pagina e test.
//
// Richiesta di Nicholas: «come il Radar creator ma solo per il clipping: il publisher inserisce
// e fa monitorare alcuni profili, così da vedere i video che più funzionano».
//
// Il metro: il MULTIPLO SULLA MEDIA DEL PROFILO («×4,2» = 4,2 volte le visualizzazioni tipiche di
// quella pagina). Le visualizzazioni nude premiano solo le pagine grandi; il multiplo dice quale
// video è uscito dal solito, cioè quale formato o gancio ha funzionato. «Tipiche» = MEDIANA dei
// video non fissati degli ultimi 30 giorni (la media la sposta un solo video esploso), con almeno
// 3 video: sotto, niente multiplo (sarebbe rumore). Un video giovane non ha ancora finito di
// crescere: l'età è sempre scritta accanto, e c'è anche la velocità (visualizzazioni all'ora).

export const CLIP_RADAR_VERSION = "clipradar-1";
export const MAX_PROFILES = 60;
export const KEEP_DAYS = 45;          // video tenuti in archivio
export const MAX_VIDEOS = 80;         // per profilo
export const BASE_DAYS = 30;          // finestra della mediana
export const MIN_BASE = 3;            // video minimi per avere una mediana
export const PRICE = { ig: 0.0014, tt: 0.0015 }; // $ a video letto (listino Apify, tier attuale)
export const PER_PROFILE = 20;        // video letti per profilo a giro
// Profilo piccolo (29/10, Nicholas sul «×44» di una pagina da 223 visualizzazioni): sotto questa
// mediana bastano poche migliaia di visualizzazioni per un multiplo enorme, che può essere un caso.
// Il multiplo resta, ma si dice «profilo piccolo» e il video non fa da protagonista.
export const SMALL_BASE = 1000;
export const isSmallBase = (base) => base != null && base < SMALL_BASE;

/** Il multiplo scritto per esteso: «44× il solito», «9,9× il solito» (una cifra decimale sotto 10). */
export function timesLabel(n, { short = false } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const x = Number(n) >= 10 ? String(Math.round(Number(n))) : String(Math.round(Number(n) * 10) / 10).replace(".", ",");
  return short ? `${x}×` : `${x}× il solito`;
}

const DAY = 86_400_000;
const s = (v, max = 300) => (v == null ? "" : String(v).trim().slice(0, max));
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);

/**
 * Da quello che scrive il publisher (link o @nome) a { platform, handle }.
 * `fallback` = piattaforma scelta quando si scrive solo il nome.
 */
export function parseProfileInput(text, fallback = "ig") {
  const t = s(text, 300);
  if (!t) return null;
  let m = /tiktok\.com\/@([\w.]{2,40})/i.exec(t);
  if (m) return { platform: "tt", handle: m[1].toLowerCase() };
  m = /instagram\.com\/([\w.]{2,40})/i.exec(t);
  if (m && !["p", "reel", "reels", "stories", "explore"].includes(m[1].toLowerCase())) return { platform: "ig", handle: m[1].toLowerCase() };
  m = /^@?([\w.]{2,40})$/.exec(t);
  if (m) return { platform: fallback === "tt" ? "tt" : "ig", handle: m[1].toLowerCase() };
  return null;
}

export const profileId = (platform, handle) => `${platform}:${String(handle).toLowerCase()}`;
export const profileUrl = (p) => (p.platform === "tt" ? `https://www.tiktok.com/@${p.handle}` : `https://www.instagram.com/${p.handle}/`);

/** Un reel dal lettore Instagram (apify/instagram-reel-scraper). null se non è un video. */
export function normalizeIg(row) {
  if (!row || row.error || !row.shortCode) return null;
  const isVideo = row.type === "Video" || row.productType === "clips" || num(row.videoDuration) != null;
  if (!isVideo) return null;
  const posted = Date.parse(row.timestamp || "");
  return {
    id: `ig:${row.shortCode}`, platform: "ig",
    owner: s(row.ownerUsername, 60).toLowerCase(),
    url: s(row.url, 300) || `https://www.instagram.com/reel/${row.shortCode}/`,
    views: num(row.videoPlayCount) ?? num(row.videoViewCount),
    likes: num(row.likesCount), comments: num(row.commentsCount), shares: num(row.sharesCount), saves: null,
    postedAt: Number.isFinite(posted) ? posted : null,
    duration: num(row.videoDuration) != null ? Math.round(num(row.videoDuration)) : null,
    cover: s(row.displayUrl, 1200) || null,
    video: s(row.videoUrl, 2000) || null, // file originale (link firmato di Instagram, scade in qualche giorno)
    caption: s(row.caption, 400),
    sound: [row.musicInfo?.song_name, row.musicInfo?.artist_name].filter(Boolean).join(" · ").slice(0, 120),
    pinned: Boolean(row.isPinned),
  };
}

/** Un video dal lettore TikTok (clockworks/tiktok-profile-scraper). */
export function normalizeTt(row) {
  if (!row || row.error || !row.id) return null;
  const posted = row.createTimeISO ? Date.parse(row.createTimeISO) : num(row.createTime) != null ? num(row.createTime) * 1000 : NaN;
  return {
    id: `tt:${row.id}`, platform: "tt",
    owner: s(row.authorMeta?.name, 60).toLowerCase(),
    url: s(row.webVideoUrl, 300),
    views: num(row.playCount), likes: num(row.diggCount), comments: num(row.commentCount),
    shares: num(row.shareCount), saves: num(row.collectCount),
    postedAt: Number.isFinite(posted) ? posted : null,
    duration: num(row.videoMeta?.duration),
    cover: s(row.videoMeta?.coverUrl, 1200) || null,
    caption: s(row.text, 400),
    sound: s(row.musicMeta?.musicName, 120),
    pinned: Boolean(row.isPinned),
    slideshow: Boolean(row.isSlideshow),
  };
}

/**
 * Archivio di un profilo dopo una lettura: i video nuovi entrano, quelli già visti aggiornano i
 * numeri e tengono una piccola storia delle visualizzazioni (per la velocità). Si tengono gli
 * ultimi KEEP_DAYS giorni, al massimo MAX_VIDEOS.
 */
export function mergeVideos(prev, fresh, at) {
  const by = new Map((prev || []).map((v) => [v.id, v]));
  for (const f of fresh || []) {
    if (!f) continue;
    const old = by.get(f.id);
    const hist = [...(old?.hist || [])];
    if (f.views != null && (!hist.length || hist[hist.length - 1][1] !== f.views)) hist.push([at, f.views]);
    by.set(f.id, { ...old, ...f, firstSeen: old?.firstSeen || at, lastSeen: at, hist: hist.slice(-12) });
  }
  const cut = at - KEEP_DAYS * DAY;
  return [...by.values()]
    .filter((v) => (v.postedAt || v.firstSeen) >= cut)
    .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0))
    .slice(0, MAX_VIDEOS);
}

const median = (arr) => {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Visualizzazioni tipiche del profilo: mediana dei video non fissati degli ultimi 30 giorni. */
export function profileStats(videos, now) {
  const recent = (videos || []).filter((v) => !v.pinned && v.views != null && v.postedAt && now - v.postedAt <= BASE_DAYS * DAY);
  const base = recent.length >= MIN_BASE ? median(recent.map((v) => v.views)) : null;
  const perWeek = recent.length ? Math.round((recent.length / BASE_DAYS) * 7 * 10) / 10 : 0;
  return { median: base, count: recent.length, perWeek, total: (videos || []).length };
}

/** Visualizzazioni all'ora: dalla storia se c'è (ultime 24 h lette), altrimenti dall'uscita. */
export function velocity(v, now) {
  const h = v.hist || [];
  if (h.length >= 2) {
    const [t1, v1] = h[h.length - 1];
    let j = h.length - 2;
    while (j > 0 && t1 - h[j][0] < 20 * 3_600_000) j--;
    const [t0, v0] = h[j];
    if (t1 > t0) return Math.max(0, Math.round((v1 - v0) / ((t1 - t0) / 3_600_000)));
  }
  if (v.views == null || !v.postedAt) return null;
  const hours = Math.max(1, (now - v.postedAt) / 3_600_000);
  return Math.round(v.views / hours);
}

/** Un video con i suoi numeri di confronto. */
export function scoreVideo(v, stats, now) {
  // un video fissato in cima è quasi sempre un vecchio exploit: niente multiplo, falserebbe la classifica
  const outlier = stats?.median && v.views != null && !v.pinned ? Math.round((v.views / stats.median) * 10) / 10 : null;
  const ageH = v.postedAt ? Math.max(0, Math.round((now - v.postedAt) / 3_600_000)) : null;
  return { ...v, outlier, ageH, perHour: velocity(v, now), fresh: ageH != null && ageH < 72 };
}

/**
 * I video da guardare. opts: { days (7|30), platform ("ig"|"tt"|null), profile (id|null),
 * sort ("outlier"|"views"|"recent"|"speed"), minOutlier }.
 */
export function topVideos(profiles, videosByProfile, opts = {}, now = Date.now()) {
  const days = opts.days || 30;
  const out = [];
  for (const p of profiles || []) {
    if (opts.platform && p.platform !== opts.platform) continue;
    if (opts.profile && p.id !== opts.profile) continue;
    const vids = videosByProfile[p.id] || [];
    const st = profileStats(vids, now);
    for (const v of vids) {
      if (!v.postedAt || now - v.postedAt > days * 86_400_000) continue;
      const sc = scoreVideo(v, st, now);
      if (opts.minOutlier && !(sc.outlier >= opts.minOutlier)) continue;
      out.push({ ...sc, profileId: p.id, handle: p.handle, label: p.label || p.handle, base: st.median });
    }
  }
  const key = {
    outlier: (v) => v.outlier ?? -1,
    views: (v) => v.views ?? -1,
    recent: (v) => v.postedAt || 0,
    speed: (v) => v.perHour ?? -1,
  }[opts.sort || "outlier"];
  return out.sort((a, b) => key(b) - key(a));
}

/** Tetto di spesa di un giro Apify: video previsti × prezzo × 1,5 + avvio. */
export const runBudget = (n, platform) => Math.round((n * PER_PROFILE * PRICE[platform] * 1.5 + 0.05) * 100) / 100;

/** Numeri brevi all'italiana: 1,2 mln, 34,5 mila, 812. */
export function shortNum(n) {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",")} mln`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(0)} mila`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".", ",")} mila`;
  return String(Math.round(n));
}

/** «3 h», «2 g», «5 sett.» */
export function ageLabel(h) {
  if (h == null) return "—";
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 21 ? `${d} g` : `${Math.round(d / 7)} sett.`;
}
