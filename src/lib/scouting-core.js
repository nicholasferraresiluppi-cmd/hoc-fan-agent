// Radar creator (scouting) — logica pura, senza KV né rete. Testata in tests/scouting.mjs.
//
// Modello (10/10/2026, richiesta di Nicholas: "un CRM gigante" delle creator italiane):
//   - PROFILO = un account Instagram (handle), con i numeri della settimana e lo storico.
//   - CREATOR = la persona: uno o più profili collegati. Il CRM (fase, note, chi la segue)
//     vive sulla creator, non sul singolo account. Un profilo senza creator esplicita è
//     una creator "implicita" di un solo account (id "h:<handle>"), così nessuna scrittura
//     è necessaria finché nessuno tocca la scheda.
//   - I collegamenti tra account si PROPONGONO (stesso link, stessa radice del nome,
//     citazione in bio) ma li conferma una persona: un collegamento sbagliato mescola
//     due persone diverse, che è peggio di una scheda doppia.

export const STAGES = [
  { id: "da_valutare", label: "Da valutare" },
  { id: "interessante", label: "Interessante" },
  { id: "contattata", label: "Contattata" },
  { id: "trattativa", label: "In trattativa" },
  { id: "firmata", label: "Firmata" },
  { id: "scartata", label: "Scartata" },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const DEFAULT_STAGE = "da_valutare";

const SIG_RANK = { forte: 2, debole: 1, nessuno: 0 };
export const HISTORY_MAX = 104; // due anni di settimane

/** Settimana ISO "2026-W41" di una data (UTC). */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - y0) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

export function normHandle(h) {
  return String(h || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase();
}

const num = (v) => {
  if (v == null || v === "" || v === "N/A") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Riga del giro settimanale (output Apify "analyzeSpecificAccounts") → numeri del profilo. */
/** Toglie dalla bio email e numeri di telefono: non li teniamo (docs/SCOUTING_PRIVACY.md). Gli @handle restano, servono ai collegamenti. */
export function scrubContacts(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "")
    .replace(/\+?\d[\d\s.\-/]{7,}\d/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Foto profilo: solo il LINK al server di Instagram (nessuna copia, come i reel). Si accetta
 * solo un indirizzo https dei CDN di Instagram/Facebook.
 */
export function igPicUrl(u) {
  if (typeof u !== "string" || !/^https:\/\//.test(u)) return null;
  try {
    const host = new URL(u).hostname;
    return /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(host) ? u : null;
  } catch { return null; }
}

/** Scadenza del link firmato di Instagram (parametro oe= in esadecimale, secondi); null se manca. */
export function picExpiry(u) {
  const m = /[?&]oe=([0-9a-f]{6,10})/i.exec(String(u || ""));
  return m ? parseInt(m[1], 16) * 1000 : null;
}

/** Il link della foto se è ancora valido (con un'ora di margine), altrimenti null → si mostrano le iniziali. */
export function livePic(u, now = Date.now()) {
  if (!igPicUrl(u)) return null;
  const exp = picExpiry(u);
  return exp && exp - 3600000 > now ? u : null;
}

export function parseRefreshItem(it) {
  if (!it?.Account || it.Account === "N/A") return null;
  const h = normHandle(it.Account);
  if (!h || it["Analysis Status"] === "not_analyzed") return null;
  const url = it["External URL"];
  return {
    h,
    fol: num(it["Followers Count"]),
    medv: num(it["Median Views"]),
    vf: num(it["Views.Followers Ratio"]),
    er: num(it["Median ER"]),
    url: url && url !== "N/A" ? String(url) : "",
    bio: typeof it.Biography === "string" ? scrubContacts(it.Biography).slice(0, 300) : undefined,
    pic: igPicUrl(it["Profile Picture"]),
  };
}

/** Storico [settimana, follower, view mediane]: una riga per settimana (l'ultima vince), al massimo HISTORY_MAX. */
export function appendHistory(hist, week, fol, medv) {
  const out = (Array.isArray(hist) ? hist : []).filter((p) => p[0] !== week);
  out.push([week, fol ?? null, medv ?? null]);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out.slice(-HISTORY_MAX);
}

/** Variazione % dei follower tra l'ultima misura e quella di `back` misure prima; null se non c'è abbastanza storia. */
export function growthPct(hist, back = 1) {
  const pts = (hist || []).filter((p) => p[1] != null && p[1] > 0);
  if (pts.length < back + 1) return null;
  const last = pts[pts.length - 1][1];
  const prev = pts[pts.length - 1 - back][1];
  return Math.round(((last - prev) / prev) * 1000) / 10;
}

/** Somma degli storici di più account per settimana (per la scheda della creator). */
export function sumHistories(hists) {
  const by = new Map();
  for (const h of hists) for (const [w, f] of h || []) {
    if (f == null) continue;
    by.set(w, (by.get(w) || 0) + f);
  }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([w, f]) => [w, f, null]);
}

/**
 * Applica i numeri di un giro settimanale ai profili. Chi non torna nel giro (account
 * chiuso, rinominato, privato) tiene gli ultimi numeri e conta un "mancato" in più.
 */
export function applyRefresh(profiles, items, now = new Date()) {
  const week = weekKey(now);
  const by = new Map();
  for (const it of items) {
    const p = parseRefreshItem(it);
    if (p) by.set(p.h, p);
  }
  let updated = 0;
  const out = profiles.map((p) => {
    const r = by.get(p.h);
    if (!r) return { ...p, missing: (p.missing || 0) + 1 };
    updated++;
    return {
      ...p,
      fol: r.fol ?? p.fol,
      medv: r.medv ?? p.medv,
      vf: r.vf ?? p.vf,
      url: r.url || p.url,
      ...(r.bio !== undefined ? { bio: r.bio } : {}),
      ...(r.pic ? { pic: r.pic } : {}),
      hist: appendHistory(p.hist, week, r.fol, r.medv),
      lastSeen: now.getTime(),
      missing: 0,
    };
  });
  return { profiles: out, updated, missing: profiles.length - updated };
}

// ---------- collegamenti tra account ----------

const NOISE = /(official|officiale|real|the|its|im|iam|private|privato|privata|backup|back|up|reel|reels|of|vip|ita|italy|xx|xo|_)/g;
/** Radice del nome: "serena.incabina" → "serena", "debbie_cyber_back_up" → "debbiecyber". */
export function handleStem(h) {
  const parts = normHandle(h).split(/[._]+/).filter(Boolean);
  const first = (parts[0] || "").replace(/\d+/g, "");
  const joined = normHandle(h).replace(/[._\d]+/g, "").replace(NOISE, "");
  return { first, joined };
}

// Siti dove il link NON identifica una persona (una canzone, un prodotto, un video): mai prova di identità.
const GENERIC_HOSTS = /(^|\.)(spotify\.com|apple\.com|amzn\.[a-z.]+|amazon\.[a-z.]+|youtube\.com|youtu\.be|google\.[a-z.]+|facebook\.com|fb\.me|x\.com|twitter\.com|threads\.net|shein\.com|zalando\.[a-z.]+|bit\.ly|tinyurl\.com|ngl\.link|forms\.gle|docs\.google\.com|orcd\.co|prozis\.[a-z.]+|myprotein\.[a-z.]+|gymbeam\.[a-z.]+|bombafit\.it|vinted\.[a-z.]+|paypal\.me)$/;
// Siti condivisi da migliaia di persone dove CONTA il percorso (t.me/<canale>, linktr.ee/<nome>…).
const SHARED_HOSTS = /(^|\.)(t\.me|telegram\.me|linktr\.ee|link\.me|beacons\.ai|allmylinks\.com|heylink\.me|lovemylink\.me|hoo\.be|bio\.site|ko-fi\.com|patreon\.com|onlyfans\.com|fanvue\.com|fansly\.com|tiktok\.com|instagram\.com|whatsapp\.com|wa\.me|twitch\.tv|getmysocial\.com|clickylo\.co|snipfeed\.co|taplink\.cc|beacons\.page|moreofme\.vip|throne\.com|linkin\.bio|solo\.to|tap\.bio|lnk\.bio)$/;
const SKIP_SEG = new Set(["channel", "m", "s", "c", "joinchat", "share", "invite", "u", "p", "products", "product"]);

/**
 * La "firma" di un link per confrontarlo tra account, o null se il link non identifica nessuno.
 * Dominio personale → il dominio; sito condiviso → dominio + primo pezzo significativo del percorso.
 */
export function linkKey(url) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:/.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (GENERIC_HOSTS.test(host)) return null;
    if (SHARED_HOSTS.test(host)) {
      const seg = u.pathname.split("/").filter(Boolean).map((x) => x.toLowerCase()).find((x) => !SKIP_SEG.has(x) && x.length >= 3);
      return seg ? `${host}/${seg}` : null;
    }
    return host;
  } catch {
    return null;
  }
}

const NIC_STOP = new Set(["estetica", "generica", "lifestyle", "ragazza", "creator", "italiana", "anni", "con", "della", "del", "and", "the"]);
const nicWords = (t) => new Set(String(t || "").toLowerCase().split(/[^a-zà-ù0-9]+/).filter((w) => w.length >= 4 && !NIC_STOP.has(w)));

/**
 * Proposte di collegamento tra account che oggi stanno in creator diverse.
 * Ragioni (in ordine di forza): stesso link → stesso nome (o stesso nome di battesimo E una parola di nicchia rara in comune) → citazione in bio.
 * Il solo nome di battesimo NON basta: "martina", "sofia", "claudia" sono di centinaia di persone diverse.
 * `creatorOf(h)` dà l'id creator corrente; `dismissed` = coppie già scartate ("a|b").
 */
export function suggestLinks(profiles, creatorOf, dismissed = new Set(), { max = 200 } = {}) {
  const out = [];
  const seen = new Set();
  const push = (a, b, reason, strength) => {
    if (a === b) return;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}|${y}`;
    if (seen.has(key) || dismissed.has(key)) return;
    if (creatorOf(x) === creatorOf(y)) return;
    seen.add(key);
    out.push({ a: x, b: y, reason, strength });
  };
  const byLink = new Map();
  const byJoined = new Map();
  const byFirst = new Map();
  const handles = new Set(profiles.map((p) => p.h));
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const p of profiles) {
    for (const k of new Set([p.url, ...(p.hlLinks || [])].map(linkKey).filter(Boolean))) add(byLink, k, p.h);
    const { first, joined } = handleStem(p.h);
    if (joined.length >= 6) add(byJoined, joined, p.h);
    if (first.length >= 4) add(byFirst, first, p);
  }
  for (const [k, hs] of byLink) if (hs.length > 1 && hs.length <= 8) for (let i = 1; i < hs.length; i++) push(hs[0], hs[i], `stesso link (${k})`, 3);
  for (const [k, hs] of byJoined) if (hs.length > 1 && hs.length <= 8) for (let i = 1; i < hs.length; i++) push(hs[0], hs[i], `stesso nome ("${k}")`, 2);
  // parole di nicchia RARE (≤ 2% dei profili, almeno 3): "camionista" distingue, "fitness" no
  const df = new Map();
  for (const p of profiles) for (const w of nicWords(p.nic)) df.set(w, (df.get(w) || 0) + 1);
  const rareMax = Math.max(3, Math.round(profiles.length * 0.02));
  for (const [k, ps] of byFirst) {
    if (ps.length < 2 || ps.length > 60) continue;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const wb = nicWords(ps[j].nic);
      const common = [...nicWords(ps[i].nic)].filter((w) => wb.has(w) && df.get(w) <= rareMax);
      if (common.length >= 1) push(ps[i].h, ps[j].h, `stesso nome ("${k}") e stessa nicchia (${common.slice(0, 3).join(", ")})`, 2);
    }
  }
  for (const p of profiles) {
    for (const m of String(p.bio || "").matchAll(/@([a-z0-9._]{3,30})/gi)) {
      const t = normHandle(m[1]).replace(/\.$/, "");
      if (handles.has(t)) push(p.h, t, `@${p.h} cita @${t} in bio`, 1);
    }
  }
  return out.sort((x, y) => y.strength - x.strength).slice(0, max);
}

// ---------- vista per creator ----------

/**
 * Raggruppa i profili per creator e calcola la riga della tabella.
 * crm = { creators: { id: { name, handles[], stage, owner, notes[], updatedAt } } }
 */
export function buildCreators(profiles, crm) {
  const creators = crm?.creators || {};
  const owner = new Map();
  for (const [id, c] of Object.entries(creators)) for (const h of c.handles || []) owner.set(h, id);
  const groups = new Map();
  for (const p of profiles) {
    const id = owner.get(p.h) || `h:${p.h}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(p);
  }
  const rows = [];
  for (const [id, ps] of groups) {
    const c = creators[id] || {};
    ps.sort((a, b) => (b.fol || 0) - (a.fol || 0));
    const main = ps[0];
    const hist = ps.length > 1 ? sumHistories(ps.map((p) => p.hist)) : main.hist || [];
    const sig = ps.reduce((best, p) => (SIG_RANK[p.sig] > SIG_RANK[best] ? p.sig : best), "nessuno");
    const fmts = [...new Set(ps.map((p) => p.fmt).filter((f) => f && f !== "nessuno"))];
    rows.push({
      id,
      name: c.name || `@${main.h}`,
      handles: ps.map((p) => p.h),
      n: ps.length,
      fol: ps.reduce((s, p) => s + (p.fol || 0), 0) || null,
      medv: Math.max(...ps.map((p) => p.medv || 0)) || null,
      vf: main.vf ?? null,
      g1: growthPct(hist, 1),
      g4: growthPct(hist, 4),
      sig,
      hl: ps.some((p) => p.hl),
      fmt: fmts[0] || "nessuno",
      fmts,
      u: Math.max(...ps.map((p) => p.u || 0)),
      nic: main.nic || "",
      g: main.g || "Altro",
      ours: ps.some((p) => p.ours),
      ag: ps.some((p) => p.ag),
      stage: STAGE_IDS.includes(c.stage) ? c.stage : DEFAULT_STAGE,
      owner: c.owner || null,
      notes: c.notes?.length || 0,
      updatedAt: c.updatedAt || null,
      missing: ps.every((p) => p.missing),
      link: bestLink(ps),
      ita: ps.some((p) => p.ita === "si") ? "si" : ps.some((p) => p.ita === "forse") ? "forse" : null,
      firstSeen: Math.min(...ps.map((p) => p.firstSeen || Infinity)) || null,
      reels: ps.flatMap((p) => (p.reels || []).map((r) => ({ ...r, h: p.h }))).sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 9),
      pic: ps.map((p) => livePic(p.pic)).find(Boolean) || null,
    });
  }
  return rows;
}

/** Conteggi per fase (sempre tutte le fasi, anche a zero). */
export function stageCounts(rows) {
  const out = Object.fromEntries(STAGE_IDS.map((s) => [s, 0]));
  for (const r of rows) out[r.stage] = (out[r.stage] || 0) + 1;
  return out;
}

// ---------- modifiche al CRM (pure: ricevono e restituiscono un nuovo oggetto) ----------

function ensureCreator(crm, id, handles) {
  const next = { creators: { ...(crm?.creators || {}) }, dismissed: [...(crm?.dismissed || [])] };
  if (!next.creators[id]) next.creators[id] = { handles: handles || [], stage: DEFAULT_STAGE, notes: [], createdAt: Date.now() };
  else next.creators[id] = { ...next.creators[id] };
  return next;
}

/** Id creator stabile di un handle nel CRM ("h:<handle>" se non è mai stato toccato). */
export function creatorIdOf(crm, h) {
  for (const [id, c] of Object.entries(crm?.creators || {})) if ((c.handles || []).includes(h)) return id;
  return `h:${h}`;
}

export function setStage(crm, id, stage, by) {
  if (!STAGE_IDS.includes(stage)) throw new Error("fase non valida");
  const handles = id.startsWith("h:") ? [id.slice(2)] : undefined;
  const next = ensureCreator(crm, id, handles);
  next.creators[id] = { ...next.creators[id], stage, updatedAt: Date.now(), updatedBy: by || null };
  return next;
}

export function addNote(crm, id, text, by) {
  const t = String(text || "").trim().slice(0, 2000);
  if (!t) throw new Error("nota vuota");
  const handles = id.startsWith("h:") ? [id.slice(2)] : undefined;
  const next = ensureCreator(crm, id, handles);
  const notes = [...(next.creators[id].notes || []), { at: Date.now(), by: by || null, text: t }].slice(-100);
  next.creators[id] = { ...next.creators[id], notes, updatedAt: Date.now() };
  return next;
}

export function setField(crm, id, field, value) {
  if (!["name", "owner"].includes(field)) throw new Error("campo non modificabile");
  const handles = id.startsWith("h:") ? [id.slice(2)] : undefined;
  const next = ensureCreator(crm, id, handles);
  next.creators[id] = { ...next.creators[id], [field]: String(value || "").trim().slice(0, 120) || null, updatedAt: Date.now() };
  return next;
}

/**
 * Collega l'account `h` alla creator di `target`. Se `h` aveva già una creator
 * con altri account, si porta dietro tutti (fusione); note e fasi si uniscono
 * (vince la fase più avanzata, le note si accodano in ordine di tempo).
 */
export function linkHandles(crm, targetHandle, h) {
  const tId = creatorIdOf(crm, targetHandle);
  const sId = creatorIdOf(crm, h);
  if (tId === sId) return crm;
  let next = ensureCreator(crm, tId, tId.startsWith("h:") ? [targetHandle] : undefined);
  const src = next.creators[sId] || { handles: [h], stage: DEFAULT_STAGE, notes: [] };
  const dst = next.creators[tId];
  const stage = STAGE_IDS.indexOf(src.stage) > STAGE_IDS.indexOf(dst.stage) && src.stage !== "scartata" ? src.stage : dst.stage;
  const newId = tId.startsWith("h:") ? `c:${targetHandle}` : tId;
  const merged = {
    ...dst,
    handles: [...new Set([...(dst.handles || [targetHandle]), ...(src.handles || [h])])],
    stage,
    notes: [...(dst.notes || []), ...(src.notes || [])].sort((a, b) => a.at - b.at).slice(-100),
    name: dst.name || src.name || null,
    owner: dst.owner || src.owner || null,
    updatedAt: Date.now(),
  };
  delete next.creators[sId];
  delete next.creators[tId];
  next.creators[newId] = merged;
  return next;
}

/** Stacca un account dalla sua creator: torna una creator di un solo account. */
export function unlinkHandle(crm, h) {
  const id = creatorIdOf(crm, h);
  if (id.startsWith("h:")) return crm;
  const next = ensureCreator(crm, id);
  const c = next.creators[id];
  const rest = (c.handles || []).filter((x) => x !== h);
  if (rest.length === 0) delete next.creators[id];
  else next.creators[id] = { ...c, handles: rest, updatedAt: Date.now() };
  return next;
}

export function dismissSuggestion(crm, a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const next = { creators: { ...(crm?.creators || {}) }, dismissed: [...new Set([...(crm?.dismissed || []), `${x}|${y}`])] };
  return next;
}

/** Cancellazione su richiesta: toglie l'account dal CRM (la creator resta se ha altri account). */
export function forgetHandle(crm, h) {
  const next = unlinkHandle(crm, h);
  const out = { creators: { ...(next.creators || {}) }, dismissed: (next.dismissed || []).filter((k) => !k.split("|").includes(h)) };
  delete out.creators[`h:${h}`];
  return out;
}


// ---------- dove porta il profilo (link in bio o nelle storie in evidenza) ----------

const LINK_KINDS = [
  { re: /(^|\.)onlyfans\.com$/, label: "OnlyFans", strength: 3 },
  { re: /(^|\.)(fanvue|fansly|mym\.fans|loyalfans|fanplace)\.[a-z.]+$/, label: "Piattaforma a pagamento", strength: 3 },
  { re: /(^|\.)(t\.me|telegram\.me)$/, label: "Telegram", strength: 2 },
  { re: /(^|\.)(linktr\.ee|link\.me|beacons\.ai|beacons\.page|allmylinks\.com|heylink\.me|heyliiink\.com|lovemylink\.me|hoo\.be|bio\.site|snipfeed\.co|getmysocial\.com|solo\.to|taplink\.cc|linkin\.bio|tap\.bio|lnk\.bio|taap\.it|[a-z0-9-]+\.link)$/, label: "Pagina di link", strength: 1 },
];

/** Che cosa c'è dietro un link: { label, strength } (3 piattaforma a pagamento, 2 Telegram, 1 pagina di link, 0 altro) o null. */
export function classifyUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:/.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.toLowerCase();
    for (const k of LINK_KINDS) if (k.re.test(host)) {
      const priv = k.label === "Telegram" && (path.startsWith("/+") || path.startsWith("/joinchat") || /priv|vip|spicy|segret|secret/.test(path));
      return { label: priv ? "Telegram privato" : k.label, strength: priv ? 3 : k.strength };
    }
    if (/\.vip$/.test(host) || /priv|vip|spicy|segret|secret/.test(host + path)) return { label: "Profilo privato", strength: 3 };
    if (GENERIC_HOSTS.test(host)) return null;
    return { label: "Sito", strength: 0 };
  } catch {
    return null;
  }
}

/** Il link più "parlante" tra quelli degli account di una creator: { label, where: "bio"|"evidenza", url }. */
export function bestLink(ps) {
  let best = null;
  for (const p of ps) {
    const cands = [...(p.hlLinks || []).map((u) => [u, "evidenza"]), ...(p.url ? [[p.url, "bio"]] : [])];
    for (const [url, where] of cands) {
      const c = classifyUrl(url);
      if (!c) continue;
      if (!best || c.strength > best.strength) best = { ...c, where, url };
    }
  }
  return best;
}

const DAY = 86400000;

/**
 * Da quando una creator conta come "nuova": ultimi 8 giorni, ma mai la prima grande ricerca
 * (tutto ciò che è entrato nei primi 3 giorni del radar è la base, non una novità).
 */
export function newCutoff(creators, now = Date.now()) {
  const first = Math.min(...creators.map((c) => c.firstSeen || Infinity));
  return Math.max(Number.isFinite(first) ? first + 3 * DAY : 0, now - 8 * DAY);
}

/** Perché guardarla, in parole, solo da fatti che il radar ha. */
export function whyLines(c, { newCut = Date.now() - 8 * DAY } = {}) {
  const out = [];
  if (c.fmt && c.fmt !== "nessuno") out.push(`Ha un format che si ripete: ${c.fmt}.`);
  if (c.link && c.link.strength >= 2) out.push(`${c.link.label} ${c.link.where === "evidenza" ? "nella prima storia in evidenza" : "in bio"}.`);
  else if (c.sig === "forte") out.push("Ha un profilo a pagamento.");
  if (c.g4 != null && c.g4 >= 5) out.push(`Cresce: +${String(c.g4).replace(".", ",")}% di follower in 4 settimane.`);
  if (c.medv && c.fol && c.medv / c.fol >= 0.3) out.push("I reel arrivano ben oltre i suoi follower.");
  if (c.firstSeen && c.firstSeen >= newCut) out.push("Nuova nel radar questa settimana.");
  return out;
}

/** Le creator da guardare oggi: profilo a pagamento + qualcosa di riconoscibile, ancora da valutare, non nostre. */
export function attentionScore(c, newCut = Date.now() - 8 * DAY) {
  return (c.sig === "forte" ? 4 : c.sig === "debole" ? 1 : 0) +
    (c.fmt && c.fmt !== "nessuno" ? 2 : 0) + (c.u || 0) +
    (c.g4 != null ? Math.max(-2, Math.min(4, c.g4 / 3)) : 0) +
    (c.firstSeen && c.firstSeen >= newCut ? 1.5 : 0) +
    (c.medv ? Math.log10(c.medv) / 2 : 0);
}

/** Il gancio della riga: il motivo più specifico per guardarla (format > link forte > crescita > portata). */
export function hookLine(c, opts) {
  const w = whyLines(c, opts).filter((x) => x !== "Ha un profilo a pagamento.");
  return w[0] || null;
}

export function pickToday(creators, { n = 3, newCut = Date.now() - 8 * DAY } = {}) {
  const score = (c) => attentionScore(c, newCut);
  return creators
    .filter((c) => !c.ours && c.stage === DEFAULT_STAGE && c.sig !== "nessuno" && !c.missing)
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(({ c }) => c);
}

/** Chi cresce di più (4 settimane) tra chi ha un profilo a pagamento; serve storico di almeno 5 settimane. */
export function movers(creators, n = 5) {
  return creators.filter((c) => c.g4 != null && c.sig === "forte" && !c.ours).sort((a, b) => b.g4 - a.g4).slice(0, n);
}

/** Per nicchia: quante creator, quante col profilo a pagamento evidente. */
export function marketByGroup(creators) {
  const by = new Map();
  for (const c of creators) {
    const g = c.g || "Altro";
    const x = by.get(g) || { g, n: 0, paid: 0 };
    x.n++;
    if (c.sig === "forte") x.paid++;
    by.set(g, x);
  }
  return [...by.values()].sort((a, b) => b.n - a.n).map((x) => ({ ...x, pct: x.n ? Math.round((x.paid / x.n) * 100) : 0 }));
}

// ---------- segnalazioni (link incollato o condiviso dal telefono) ----------

/** Da un link di Instagram: { handle } per un profilo, { code } per un reel o un post; null se non è Instagram. */
export function parseInstagramLink(text) {
  const m = String(text || "").match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s]+/i) || String(text || "").match(/(?:^|\s)(?:www\.)?instagram\.com\/[^\s]+/i);
  const raw = m ? m[0].trim() : String(text || "").trim();
  if (/^@?[a-z0-9._]{2,30}$/i.test(raw)) return { handle: raw.replace(/^@/, "").toLowerCase() };
  let u;
  try { u = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
  const seg = u.pathname.split("/").filter(Boolean);
  if (!seg.length) return null;
  if (["reel", "reels", "p", "tv"].includes(seg[0].toLowerCase())) return seg[1] ? { code: seg[1] } : null;
  if (seg[1] && ["reel", "p"].includes(seg[1].toLowerCase()) && seg[2]) return { code: seg[2], handle: seg[0].toLowerCase() };
  if (["stories"].includes(seg[0].toLowerCase()) && seg[1]) return { handle: seg[1].toLowerCase() };
  if (/^[a-z0-9._]{2,30}$/i.test(seg[0]) && !["explore", "accounts", "direct"].includes(seg[0].toLowerCase())) return { handle: seg[0].toLowerCase() };
  return null;
}
