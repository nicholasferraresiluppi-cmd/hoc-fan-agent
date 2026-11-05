// Trend modelle, livello 1 — logica pura (3/11/2026). La usano lib, API, pagina e test.
//
// Richiesta di Nicholas: uno strumento che riconosca i trend dei reel e li passi alle modelle.
// Studio fatto prima di costruire (memoria «strumento-trend»): nessun tool sul mercato riconosce
// i FORMAT (solo audio e hashtag); il metodo comune (CrowdTangle, Chartmetric, WGSN) è confrontare
// ogni video con il SOLITO DEL SUO PROFILO e contare quanti profili DIVERSI fanno la stessa cosa.
// Due casi veri lo hanno confermato: «vai così conciata da lui?» = stesso format su 8+ profili
// stranieri settimane prima di Alessandra (trend); la GTR di Giulia = spinta da una collab con un
// profilo enorme, nessun altro lo faceva (non un trend).
//
// Livello 1 = solo dati che il warehouse ha già, niente Apify:
//   «da fuori»   trendfinder (tf.raw_reels): foto giornaliera di ~130 profili Instagram stranieri
//                della nicchia, seguiti da chi gestisce il warehouse;
//   «le nostre»  ig.raw_reels filtrato sulla nostra organizzazione: i profili delle nostre creator.
// Ogni notte: i reel «esplosi» (≥3 volte il solito del profilo), l'AI ne descrive il format dalla
// copertina, e qui si raggruppano A MANO in format (la ricerca dice che il raggruppamento
// automatico dei meme è inaffidabile). Un format diventa trend quando lo fanno almeno 3 profili
// stranieri diversi; le nostre non contano nel conteggio (le «sorelle» della stessa creator
// rifanno lo stesso reel e lo farebbero sembrare un trend) ma si dice se l'abbiamo già fatto.
import { SMALL_BASE } from "./clip-radar-core.js";

export const TREND_MODELLE_VERSION = "trendmod-1";
export const LANES = { int: "Da fuori", ours: "Le nostre" };
export const BASE_MIN_DAYS = 7;   // un reel entra nel «solito» quando ha finito di crescere
export const BASE_MAX_DAYS = 60;
export const MIN_BASE = 5;        // reel minimi per avere un solito
export const FRESH_DAYS = 21;     // un reel esploso più vecchio di così non è più notizia
export const HIT_TIMES = 3;       // volte il solito
export const HIT_VIEWS = 20_000;  // e almeno queste visualizzazioni
export const YOUNG_H = 72;        // sotto, il reel sta ancora crescendo
export const WATCH_ACCOUNTS = 2;  // profili stranieri diversi: «in osservazione»
export const TREND_ACCOUNTS = 3;  // «trend»
export const MAX_HITS = 400;      // esplosi tenuti in archivio (i più recenti)
export const DESC_PER_NIGHT = 25; // descrizioni AI a notte
export const AI_MODEL = "claude-sonnet-5";
export const AI_CAP_USD = 10;     // tetto mensile delle descrizioni
export const BQ_MAX_GB = 40;      // fusibile della lettura notturna (misurata ~27 GB)

const DAY = 86_400_000;
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v, max = 300) => (v == null ? "" : String(v).trim().slice(0, max));
const ts = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  const n = Number(v);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(String(v).replace(" ", "T").replace(/\+00(:00)?$/, "Z").replace(/ UTC$/, "Z"));
  return Number.isFinite(t) ? t : null;
};

/** Una riga del warehouse → reel comune. null se manca qualcosa di essenziale. */
export function normalizeRow(r) {
  if (!r || !r.code) return null;
  const lane = r.src === "tf" ? "int" : r.src === "ig" ? "ours" : null;
  const postedAt = ts(r.taken_at);
  if (!lane || !postedAt) return null;
  const coauthors = (Array.isArray(r.coauthors) ? r.coauthors : String(r.coauthors || "").split(","))
    .map((x) => str(x, 40).replace(/^@/, "")).filter(Boolean);
  const handle = str(r.username, 40).toLowerCase() || null;
  return {
    id: String(r.code),
    lane,
    owner: String(r.owner_id || handle || ""),
    handle,
    postedAt,
    views: num(r.views),
    likes: num(r.likes),
    comments: num(r.comments),
    caption: str(r.caption, 220) || null,
    audioId: r.audio_id ? String(r.audio_id) : null,
    audioTitle: str(r.audio_title, 80) || null,
    templateId: r.template_id ? String(r.template_id) : null,
    coauthors: coauthors.filter((c) => c !== handle),
    cover: r.cover ? String(r.cover) : null,
    pinned: r.pinned === true || r.pinned === "true",
    base: num(r.base),
    baseN: num(r.base_n),
  };
}

const median = (arr) => {
  const a = arr.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Il solito di ogni profilo: mediana dei reel di 7-60 giorni (fissati esclusi), almeno 5. */
export function baselines(reels, now = Date.now()) {
  const by = new Map();
  for (const r of reels) {
    const age = (now - r.postedAt) / DAY;
    if (r.pinned || r.views == null || age < BASE_MIN_DAYS || age > BASE_MAX_DAYS) continue;
    const k = `${r.lane}:${r.owner}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r.views);
  }
  const out = new Map();
  for (const [k, v] of by) if (v.length >= MIN_BASE) out.set(k, { median: median(v), n: v.length });
  return out;
}

/**
 * I reel esplosi: ≤21 giorni, ≥3 volte il solito, ≥20 mila visualizzazioni, profilo non piccolo.
 * Il solito arriva già calcolato dal warehouse (`base`) o si calcola qui dalle righe.
 * Le collab restano nell'elenco ma segnate: la spinta può venire dal pubblico dell'altro profilo.
 */
export function findHits(reels, now = Date.now(), bases = null) {
  const b = bases || baselines(reels, now);
  const hits = [];
  for (const r of reels) {
    if (r.pinned || r.views == null) continue;
    const ageH = Math.max(0, Math.round((now - r.postedAt) / 3_600_000));
    if (ageH > FRESH_DAYS * 24) continue;
    const base = r.base ?? b.get(`${r.lane}:${r.owner}`)?.median ?? null;
    if (base == null || base < SMALL_BASE) continue;
    const times = Math.round((r.views / base) * 10) / 10;
    if (times < HIT_TIMES || r.views < HIT_VIEWS) continue;
    hits.push({ ...r, base, times, ageH, young: ageH < YOUNG_H, collab: r.coauthors.length > 0 });
  }
  return hits.sort((x, y) => y.postedAt - x.postedAt).slice(0, MAX_HITS);
}

/** Stato di un insieme di reel (un format o un gruppo automatico): chi lo fa, da quando, a che punto. */
export function groupStatus(items) {
  const clean = items.filter((h) => !h.collab);
  const int = new Set(clean.filter((h) => h.lane === "int").map((h) => h.owner));
  const ours = new Set(items.filter((h) => h.lane === "ours").map((h) => h.handle || h.owner));
  const firstOf = (lane) => {
    const t = items.filter((h) => h.lane === lane).map((h) => h.postedAt).filter(Boolean);
    return t.length ? Math.min(...t) : null;
  };
  const firstInt = firstOf("int");
  const firstOurs = firstOf("ours");
  const level = int.size >= TREND_ACCOUNTS ? "trend" : int.size >= WATCH_ACCOUNTS ? "watch" : "single";
  return {
    intAccounts: int.size,
    oursAccounts: ours.size,
    firstInt,
    firstOurs,
    // giorni fra il primo straniero e la prima delle nostre: l'anticipo che misuriamo noi
    leadDays: firstInt && firstOurs ? Math.round((firstOurs - firstInt) / DAY) : null,
    level,
    collabOnly: items.length > 0 && clean.length === 0,
  };
}

export const LEVEL_LABEL = { trend: "Trend", watch: "In osservazione", single: "Un caso solo" };
export function levelHint(st) {
  if (st.collabOnly) return "Solo reel in collab: la spinta può venire dal pubblico dell'altro profilo";
  if (st.level === "trend") return `${st.intAccounts} profili stranieri diversi lo fanno`;
  if (st.level === "watch") return `2 profili stranieri: ne serve un terzo per chiamarlo trend`;
  return st.intAccounts === 1 ? "Un solo profilo straniero: può essere un caso" : "Nessun profilo straniero ancora";
}

/**
 * Gruppi che i dati danno gratis: stesso audio (gruppo audio di Instagram, unisce gli «audio
 * originali» che sono la stessa canzone) o stesso modello («usa modello» di Instagram).
 * Si mostrano solo con almeno 2 profili stranieri diversi, collab escluse.
 */
export function autoGroups(hits) {
  const groups = new Map();
  const add = (key, kind, label, h) => {
    if (!groups.has(key)) groups.set(key, { key, kind, label, items: [] });
    groups.get(key).items.push(h);
  };
  for (const h of hits) {
    if (h.collab) continue;
    if (h.audioId) add(`audio:${h.audioId}`, "audio", h.audioTitle || "Audio", h);
    if (h.templateId) add(`tmpl:${h.templateId}`, "template", "Stesso modello di Instagram", h);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, status: groupStatus(g.items), ids: g.items.map((h) => h.id) }))
    .filter((g) => g.status.intAccounts >= WATCH_ACCOUNTS)
    .sort((a, b) => b.status.intAccounts - a.status.intAccounts || b.items.length - a.items.length)
    .map(({ items, ...g }) => g);
}

// ---------- format fatti a mano ----------

/** Nome di un format: 3-80 caratteri. */
export function parseFormatName(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length >= 3 && t.length <= 80 ? t : null;
}

/** La copia di un reel che resta nel format anche quando esce dall'archivio degli esplosi. */
export function snapshotHit(h) {
  return {
    id: h.id, lane: h.lane, owner: h.owner, handle: h.handle, postedAt: h.postedAt, views: h.views,
    base: h.base, times: h.times, collab: Boolean(h.collab), cover: h.cover || null, caption: h.caption || null,
  };
}

/** Un format con i suoi reel (aggiornati dall'archivio quando ci sono ancora) e il suo stato. */
export function formatView(format, hitsById) {
  const items = Object.values(format.items || {}).map((s) => ({ ...s, ...(hitsById.get(s.id) || {}) }))
    .sort((a, b) => a.postedAt - b.postedAt);
  return { ...format, items, status: groupStatus(items) };
}

/** Ordine dei format: prima i trend, poi quelli in osservazione, poi per novità. */
export function sortFormats(views) {
  const rank = { trend: 0, watch: 1, single: 2 };
  return [...views].sort((a, b) => rank[a.status.level] - rank[b.status.level]
    || (b.status.firstInt || 0) - (a.status.firstInt || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

// ---------- descrizione AI ----------

/** Lo schema della risposta dell'AI: poche voci fisse, così le descrizioni si confrontano. */
export const DESC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["formato", "scritta", "situazione", "svolta", "adatto", "perche"],
  properties: {
    formato: { type: "string", description: "Il format in una riga, generico e riusabile da un'altra creator (es. «domanda giudicante in sovrimpressione + reveal dell'outfit sotto la tuta»). Non descrivere la persona." },
    scritta: { type: ["string", "null"], description: "Il testo in sovrimpressione letto nella copertina, parola per parola; null se non c'è." },
    situazione: { type: "string", description: "Dove e cosa si vede, in poche parole." },
    svolta: { type: ["string", "null"], description: "Il colpo di scena o la battuta che il format promette, se si capisce; null se dalla copertina non si capisce." },
    adatto: { type: "string", enum: ["si", "forse", "no"], description: "Se una creator glamour/lifestyle italiana può rifarlo sul suo profilo Instagram." },
    perche: { type: "string", description: "Una frase sul perché di «adatto»." },
  },
};

export const DESC_SYSTEM = `Leggi la copertina di un reel Instagram che ha fatto molte più visualizzazioni del solito per il suo profilo.
Serve a un team social italiano che cerca FORMAT da far rifare alle sue creator (profili glamour e lifestyle).
Descrivi il format, non la persona: niente giudizi sul corpo, niente nomi.
Se la copertina non basta per capire la svolta, dillo (svolta = null) invece di inventare.
Rispondi in italiano.`;

export function descPrompt(h) {
  return [
    `Profilo: @${h.handle || "?"} (${h.lane === "int" ? "straniero" : "una nostra creator"})`,
    `Visualizzazioni: ${h.views} (di solito ${Math.round(h.base)}: ${h.times} volte il solito)`,
    h.caption ? `Didascalia: ${h.caption}` : "Didascalia: nessuna",
    h.audioTitle ? `Audio: ${h.audioTitle}` : null,
  ].filter(Boolean).join("\n");
}

/** Ripulisce la risposta dell'AI. null se non ha la voce principale. */
export function normalizeDesc(raw) {
  if (!raw || typeof raw !== "object") return null;
  const formato = str(raw.formato, 200);
  if (!formato) return null;
  const adatto = ["si", "forse", "no"].includes(raw.adatto) ? raw.adatto : "forse";
  return {
    formato,
    scritta: str(raw.scritta, 200) || null,
    situazione: str(raw.situazione, 200) || null,
    svolta: str(raw.svolta, 200) || null,
    adatto,
    perche: str(raw.perche, 240) || null,
  };
}

/** Quali esplosi descrivere stanotte: senza descrizione, con copertina, prima i più forti e recenti. */
export function pickToDescribe(hits, described, max = DESC_PER_NIGHT) {
  return hits
    .filter((h) => !described.has(h.id) && h.cover)
    .sort((a, b) => (a.lane === b.lane ? 0 : a.lane === "int" ? -1 : 1) || b.times - a.times)
    .slice(0, max);
}

/** Chiave del mese per la spesa: «2026-11». */
export const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
