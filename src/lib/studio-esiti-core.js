// Cosa ha funzionato — logica pura (6/11/2026). Nessun import: la usano API, componente e test.
//
// Chiude il giro del Banco montaggi: un video montato esce come reel, e qui si vede come è andato,
// così il giro dopo si rifà ciò che funziona invece di indovinare.
//
// Fonte: il magazzino dati, che fotografa ogni giorno ogni reel dei profili HOC (instagram.reels_diffs:
// visualizzazioni, like, commenti) e ogni profilo (instagram.cache_accounts_talents: visite al link
// in bio, nuovi iscritti, follower). Nessuna lettura in più da Instagram, nessun costo Apify.
//
// Le misure, e cosa NON dicono:
//   view a 24 h e a 7 giorni   la fotografia del giorno dopo l'uscita e del settimo giorno;
//   × il solito                view a 7 giorni contro la mediana dei BASE_REELS reel precedenti dello stesso
//                              profilo (almeno MIN_BASE, altrimenti niente confronto). Per numero di reel e non per
//                              giorni: un profilo che pubblica poco (@fishballla: 2 reel in 60 giorni) avrebbe un
//                              «solito» vuoto o fatto di mesi diversi;
//   visite al link, iscritti   del PROFILO nel giorno dell'uscita e in quello dopo: Instagram non dice
//                              da quale reel arriva un clic, quindi è un segnale, non un'attribuzione.
//                              Se in quei giorni esce un altro reel il numero è condiviso e lo si dice.
// Il formato è la cartella del Banco da cui viene il video: si confrontano formati solo con almeno
// MIN_FORMAT reel collegati.

export const ESITI_VERSION = "esiti-2";
export const WINDOW_DAYS = 150;   // reel letti dal magazzino (anche quelli vecchi servono da confronto)
export const SHOW_DAYS = 90;      // reel mostrati in tabella
export const BASE_REELS = 10;     // reel precedenti che fanno il «solito»
export const MIN_BASE = 5;        // reel minimi per dire «il solito»
export const MIN_FORMAT = 3;      // reel collegati minimi per confrontare un formato
export const CLICK_DAYS = 2;      // giorno dell'uscita + il giorno dopo

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Id numerico di un media Instagram → codice del link (instagram.com/reel/{codice}). */
export function shortcodeOf(mediaId) {
  const s = String(mediaId || "").split("_")[0];
  if (!/^\d+$/.test(s)) return null;
  let n = BigInt(s);
  if (n === 0n) return null;
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 64n)] + out; n /= 64n; }
  return out;
}

export const reelUrl = (code) => (code ? `https://www.instagram.com/reel/${code}/` : null);

/** Giorno YYYY-MM-DD (UTC, come le fotografie del magazzino) spostato di n giorni. */
export function addDays(day, n) {
  const d = new Date(day + "T00:00:00Z");
  if (isNaN(d)) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayOfTs = (sec) => {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString().slice(0, 10);
};
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const dk = (v) => String(v?.value ?? v ?? "").slice(0, 10);

export function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * Fotografie giornaliere dei reel (una riga per reel per giorno) → un reel con la sua serie.
 * `lastDay` = l'ultimo giorno fotografato dal magazzino: una misura a N giorni esiste solo se quel
 * giorno è già passato (prima resta null = «non ancora»).
 */
export function buildReels(rows = [], lastDay) {
  const by = new Map();
  for (const r of rows) {
    const id = String(r.content_id || "");
    const day = dk(r.date_key);
    if (!id || !day) continue;
    if (!by.has(id)) by.set(id, { id, created: num(r.create_time), snaps: new Map(), thumb: null });
    const x = by.get(id);
    x.snaps.set(day, { views: num(r.play_count), likes: num(r.like_count), comments: num(r.comment_count) });
    if (r.thumbnail_url && (!x.thumbDay || day > x.thumbDay)) { x.thumb = r.thumbnail_url; x.thumbDay = day; }
    if (x.created == null) x.created = num(r.create_time);
  }
  const out = [];
  for (const x of by.values()) {
    const days = [...x.snaps.keys()].sort();
    const pubDay = dayOfTs(x.created) || days[0];
    if (!pubDay) continue;
    const at = (n) => {
      const d = addDays(pubDay, n);
      if (!lastDay || d > lastDay) return null;           // giorno non ancora fotografato
      const exact = x.snaps.get(d);
      if (exact) return exact.views;
      // buco di UN giorno: vale la foto del giorno prima. Buchi più lunghi → null: il magazzino a volte
      // smette di seguire un reel (su @fishballla un reel di agosto aveva la stessa foto a 24 h e a 7 g)
      const before = days.filter((k) => k <= d).pop();
      return before && before >= addDays(d, -1) ? x.snaps.get(before).views : null;
    };
    const last = x.snaps.get(days[days.length - 1]);
    const code = shortcodeOf(x.id);
    out.push({
      id: x.id, code, url: reelUrl(code), pubDay,
      pubAt: x.created ? Math.round(x.created * 1000) : null,
      views1: at(1), views7: at(7),
      due7: Boolean(lastDay && addDays(pubDay, 7) <= lastDay), // a 7 giorni ci è già arrivato: se manca, è un buco del magazzino
      views: last?.views ?? null, likes: last?.likes ?? null, comments: last?.comments ?? null,
      thumb: x.thumb || null,
    });
  }
  return out.sort((a, b) => (b.pubAt || 0) - (a.pubAt || 0) || b.pubDay.localeCompare(a.pubDay));
}

/** Righe giornaliere del profilo → mappa giorno → { visits, subs, followers }. */
export function buildAccountDays(rows = []) {
  const out = {};
  for (const r of rows) {
    const d = dk(r.date_key);
    if (!d) continue;
    out[d] = { visits: num(r.unique_visitors_count_diff), subs: num(r.subs_diff), followers: num(r.followed_by) };
  }
  return out;
}

/** Il «solito» di un reel: mediana delle view a 7 giorni dei BASE_REELS reel misurati usciti prima. */
export function baselineFor(reel, reels) {
  const before = (r) => (r.pubAt && reel.pubAt ? r.pubAt < reel.pubAt : r.pubDay < reel.pubDay);
  const vals = reels.filter((r) => r.id !== reel.id && before(r) && r.views7 != null)
    .sort((a, b) => (b.pubAt || 0) - (a.pubAt || 0) || b.pubDay.localeCompare(a.pubDay))
    .slice(0, BASE_REELS).map((r) => r.views7);
  return vals.length >= MIN_BASE ? { median: median(vals), n: vals.length } : null;
}

/** Visite al link e iscritti del profilo nel giorno dell'uscita e in quello dopo; quanti altri reel li condividono. */
export function clicksFor(reel, accountDays, reels) {
  const days = Array.from({ length: CLICK_DAYS }, (_, i) => addDays(reel.pubDay, i));
  const got = days.map((d) => accountDays?.[d]).filter(Boolean);
  if (got.length < CLICK_DAYS || got.some((g) => g.visits == null)) return { visits: null, subs: null, shared: 0 };
  const lo = addDays(reel.pubDay, -(CLICK_DAYS - 1)), hi = days[days.length - 1];
  const shared = reels.filter((r) => r.id !== reel.id && r.pubDay >= lo && r.pubDay <= hi).length;
  return {
    visits: got.reduce((s, g) => s + (g.visits || 0), 0),
    subs: got.every((g) => g.subs != null) ? got.reduce((s, g) => s + g.subs, 0) : null,
    shared,
  };
}

/**
 * Tutto insieme per la pagina: i reel recenti con le misure, il collegamento al video del Banco
 * (links: codice → { fileId }) e il titolo/cartella del video (banco: fileId → { title, path }).
 */
export function buildOutcomes({ reels = [], accountDays = {}, links = {}, banco = {}, lastDay, showDays = SHOW_DAYS }) {
  const from = lastDay ? addDays(lastDay, -showDays) : null;
  return reels
    .filter((r) => !from || r.pubDay >= from)
    .map((r) => {
      const base = baselineFor(r, reels);
      const link = links[r.code] || null;
      const video = link ? banco[link.fileId] || { title: "Video non più nel Banco", path: null, missing: true } : null;
      return {
        ...r,
        base: base?.median ?? null, baseN: base?.n ?? 0,
        ratio: base && r.views7 != null && base.median > 0 ? Math.round((r.views7 / base.median) * 100) / 100 : null,
        ...clicksFor(r, accountDays, reels),
        fileId: link?.fileId || null, video,
      };
    });
}

/** Per formato (cartella del Banco): quanti reel, la mediana di «× il solito», view e visite. */
export function byFormat(outcomes = []) {
  const groups = new Map();
  for (const o of outcomes) {
    if (!o.fileId || !o.video || o.video.missing) continue;
    const key = o.video.path || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  return [...groups].map(([path, list]) => {
    const ratios = list.map((o) => o.ratio).filter((x) => x != null);
    const v7 = list.map((o) => o.views7).filter((x) => x != null);
    return {
      path, label: path || "Cartella principale", n: list.length, measured: ratios.length,
      ratio: ratios.length >= MIN_FORMAT ? Math.round(median(ratios) * 100) / 100 : null,
      views7: v7.length ? Math.round(median(v7)) : null,
      enough: ratios.length >= MIN_FORMAT,
    };
  }).sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.n - a.n);
}

/** Collegamenti validi: un video del Banco esce come UN reel (l'ultimo collegamento vince). */
export function normalizeLinks(raw = {}) {
  const out = {};
  const seen = new Map(); // fileId → codice
  const entries = Object.entries(raw)
    .map(([code, v]) => [code, typeof v === "string" ? safeParse(v) : v])
    .filter(([, v]) => v && v.fileId)
    .sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  for (const [code, v] of entries) {
    const prev = seen.get(v.fileId);
    if (prev) delete out[prev];
    out[code] = v;
    seen.set(v.fileId, code);
  }
  return out;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

/** Reel usciti dopo il collegamento della cartella del Banco e ancora senza video: da collegare. */
export function toLink(outcomes = [], since) {
  return outcomes.filter((o) => !o.fileId && (!since || (o.pubAt || 0) >= since)).length;
}
