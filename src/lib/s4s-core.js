// S4S (scambio di promozione tra pagine) — logica pura, senza I/O.
// Testata in tests/s4s.mjs. Orchestrazione (KV + BigQuery) in s4s.js.
//
// CALENDARIO
// Le pagine di uno split si dividono per lingua (IT con IT, EN con EN: un
// pubblico inglese non si abbona a una pagina italiana). Dentro ogni gruppo un
// girone all'italiana (metodo del cerchio): in un giro ogni pagina scambia una
// volta con tutte le altre; con un numero dispari ogni giorno una riposa, a
// turno. A ogni giro l'ordine si rimescola (PRNG con seme fisso → calendario
// riproducibile, nessun dato da salvare giorno per giorno), con due vincoli al
// passaggio tra un giro e l'altro: nessuna coppia ripetuta il giorno dopo e
// nessuna pagina che riposa due volte di fila (difetto visto nella v0 su
// foglio: Giulia Amici a riposo il 12 e il 16/11).
// Un gruppo di 2 pagine scambia una volta a settimana (tre volte a settimana
// tra le stesse due pagine brucia il pubblico); un gruppo di 1 non scambia.
//
// SEGMENTI: quando cambiano le pagine o i giorni, il calendario NON si
// ricalcola all'indietro — si apre un segmento nuovo dal prossimo giorno di
// S4S. I giorni passati restano quelli che erano (lo storico non si sposta).
//
// MISURA
// Ogni scambio passa da un link di tracciamento creato sulla pagina che riceve
// ("S4S Fish Mass", "SFS_anastasia", "s4s laura 23/07"). Dal nome del link si
// ricavano il partner e il formato (massa / post / Telegram). Il partner si
// abbina a una pagina solo se l'alias è UNIVOCO su tutta HOC: "Elisa" da solo
// è Elisa Vimercati o Elisa Esposito → resta testo, non si indovina.

export const S4S_VERSION = "s4s-1";

export const WEEKDAYS = [
  [1, "lunedì"], [2, "martedì"], [3, "mercoledì"], [4, "giovedì"], [5, "venerdì"], [6, "sabato"], [0, "domenica"],
];
const WD_NAME = Object.fromEntries(WEEKDAYS);
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

// ── Date (sempre stringhe YYYY-MM-DD, aritmetica in UTC: niente fusi) ────────
export const toDate = (s) => new Date(`${s}T00:00:00Z`);
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * 86400000));
export const weekday = (s) => toDate(s).getUTCDay();
export function dayLabel(s, { year = false } = {}) {
  const d = toDate(s);
  return `${WD_NAME[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ""}`;
}
export const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
// lunedì della settimana di s (chiave settimana per i gruppi da 2)
export const weekKey = (s) => addDays(s, -((weekday(s) + 6) % 7));

// ── Nomi e lingua ───────────────────────────────────────────────────────────
const LANG_RE = /\s*[-–|]\s*(IT|ITA|EN|ENG|ES|ESP|DE|FR)\s*$/i;
const LANG_CANON = { ita: "it", eng: "en", esp: "es" };
export function langOf(name) {
  const m = LANG_RE.exec(String(name || ""));
  if (!m) return { lang: "it", guessed: true };
  const l = m[1].toLowerCase();
  return { lang: LANG_CANON[l] || l, guessed: false };
}
export const baseName = (name) => String(name || "").replace(LANG_RE, "").trim();
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── PRNG deterministico ─────────────────────────────────────────────────────
export function hashSeed(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Girone ──────────────────────────────────────────────────────────────────
// Un giro completo: n-1 turni (n pari) o n turni (n dispari, uno riposa).
export function circleRounds(players) {
  const p = [...players];
  if (p.length % 2) p.push(null);
  const n = p.length;
  const out = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    let rest = null;
    for (let i = 0; i < n / 2; i++) {
      const a = p[i], b = p[n - 1 - i];
      if (a == null || b == null) rest = a ?? b;
      else pairs.push([a, b]);
    }
    out.push({ pairs, rest });
    p.splice(1, 0, p.pop()); // ruota tutti tranne il primo
  }
  return out;
}

const pairKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);

// Sequenza infinita (pigra) di turni: giri rimescolati con i vincoli di confine.
export function roundStream(players, seed) {
  const rnd = mulberry32(seed);
  let prev = null;
  let buf = [];
  return {
    next() {
      if (!buf.length) {
        let cycle = null;
        for (let attempt = 0; attempt < 300; attempt++) {
          const rounds = shuffle(circleRounds(shuffle(players, rnd)), rnd).map((r) => ({ ...r, pairs: shuffle(r.pairs, rnd) }));
          cycle = rounds;
          if (!prev) break;
          const first = rounds[0];
          const prevKeys = new Set(prev.pairs.map(([a, b]) => pairKey(a, b)));
          const pairClash = first.pairs.some(([a, b]) => prevKeys.has(pairKey(a, b)));
          const restClash = first.rest != null && first.rest === prev.rest;
          if (!pairClash && !restClash) break;
        }
        buf = cycle;
      }
      const r = buf.shift();
      prev = r;
      return r;
    },
  };
}

// ── Piano → giorni ──────────────────────────────────────────────────────────
// segment = { from, weekdays:[1,2,4], groups:{ it:[ids], en:[ids] }, seed }
// Restituisce i giorni attivi tra [from, to] (inclusi) del solo segmento.
export function segmentDays(segment, to) {
  const days = [];
  const wd = new Set(segment.weekdays);
  for (let d = segment.from; d <= to; d = addDays(d, 1)) if (wd.has(weekday(d))) days.push(d);
  return days;
}

// Calendario di un segmento fino a `to`. Ogni giorno: { day, groups:{ lang:{pairs,rest} } }.
// sameBase(a,b) → true se due pagine sono la stessa creator (non si scambiano).
export function segmentSchedule(segment, to, { sameBase = () => false } = {}) {
  const days = segmentDays(segment, to);
  const out = days.map((day) => ({ day, groups: {} }));
  for (const [lang, ids] of Object.entries(segment.groups || {})) {
    const players = [...ids].sort((a, b) => a - b);
    if (players.length < 2) continue;
    const stream = roundStream(players, hashSeed(`${segment.seed}:${lang}`));
    const weekly = players.length === 2;
    const usedWeeks = new Set();
    for (const d of out) {
      if (weekly) {
        const wk = weekKey(d.day);
        if (usedWeeks.has(wk)) continue;
        usedWeeks.add(wk);
      }
      const r = stream.next();
      const pairs = [];
      const rest = r.rest != null ? [r.rest] : [];
      for (const [a, b] of r.pairs) {
        if (sameBase(a, b)) rest.push(a, b);
        else pairs.push([a, b]);
      }
      d.groups[lang] = { pairs, rest };
    }
  }
  return out;
}

// Calendario completo del piano tra [from, to].
export function planSchedule(plan, from, to, opts) {
  const segs = [...(plan?.segments || [])].sort((a, b) => (a.from < b.from ? -1 : 1));
  const out = [];
  segs.forEach((s, i) => {
    const end = i + 1 < segs.length ? addDays(segs[i + 1].from, -1) : to;
    const last = end < to ? end : to;
    if (last < s.from) return;
    for (const d of segmentSchedule(s, last, opts)) if (d.day >= from) out.push(d);
  });
  return out;
}

// Prossimo giorno attivo STRETTAMENTE dopo `after` (per aprire un segmento nuovo
// senza toccare oggi).
export function nextActiveDay(weekdays, after) {
  const wd = new Set(weekdays);
  for (let i = 1; i <= 14; i++) {
    const d = addDays(after, i);
    if (wd.has(weekday(d))) return d;
  }
  return null;
}

// Gruppi di lingua dalla lista pagine.
// pages: [{id, name}], lang override {id: 'it'|'en'}, paused: [ids]
export function groupPages(pages, { langOverride = {}, paused = [] } = {}) {
  const off = new Set(paused.map(Number));
  const groups = {};
  for (const p of pages) {
    if (off.has(Number(p.id))) continue;
    const lang = langOverride[p.id] || langOf(p.name).lang;
    (groups[lang] ||= []).push(Number(p.id));
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a - b);
  return groups;
}

export function sameGroups(a, b) {
  const ka = Object.keys(a || {}).filter((k) => a[k].length).sort();
  const kb = Object.keys(b || {}).filter((k) => b[k].length).sort();
  if (ka.join() !== kb.join()) return false;
  return ka.every((k) => [...a[k]].sort().join() === [...b[k]].sort().join());
}
const sameDays = (a, b) => [...a].sort().join() === [...b].sort().join();

// Riconcilia il piano con lo stato voluto. Ritorna { plan, changed }.
// Il primo segmento parte da `start`; i successivi dal prossimo giorno attivo dopo `today`.
export function reconcilePlan(plan, { splitId, groups, weekdays, start, today }) {
  const segs = [...(plan?.segments || [])];
  const last = segs[segs.length - 1];
  if (!last) {
    const from = start || nextActiveDay(weekdays, addDays(today, -1));
    return { plan: { segments: [{ from, weekdays, groups, seed: hashSeed(`${splitId}:${from}`) }] }, changed: true };
  }
  if (sameGroups(last.groups, groups) && sameDays(last.weekdays, weekdays)) return { plan: { ...plan, segments: segs }, changed: false };
  // cambio: se l'ultimo segmento non è ancora iniziato lo si sostituisce, altrimenti se ne apre uno nuovo
  const from = last.from > today ? nextActiveDay(weekdays, addDays(last.from, -1)) : nextActiveDay(weekdays, today);
  const seg = { from, weekdays, groups, seed: hashSeed(`${splitId}:${from}`) };
  if (last.from > today) segs[segs.length - 1] = seg;
  else segs.push(seg);
  return { plan: { ...plan, segments: segs }, changed: true };
}

// ── Nome del link da creare ─────────────────────────────────────────────────
// Sulla pagina che RICEVE si crea il link; il partner lo pubblica.
// Formato fisso così la misura si aggancia da sola: "S4S <Partner> <dd/mm>".
export const linkNameFor = (partnerName, day) => `S4S ${baseName(partnerName)} ${ddmm(day)}`;

// ── Lettura dei link esistenti ──────────────────────────────────────────────
const S4S_RE = /s4s|sfs|shout/i;
export const isS4SLink = (name) => S4S_RE.test(String(name || ""));
const FORMAT_RULES = [
  ["massa", /\bmass\b|mass message|\bmassa\b|\bdm\b/i],
  ["telegram", /\btg\b|telegram/i],
  ["post", /\bhome\b|\bpost\b|\bwall\b|\bstory\b|\bstories\b/i],
];
export function linkFormat(name) {
  const s = String(name || "").replace(/_/g, " ");
  for (const [f, re] of FORMAT_RULES) if (re.test(s)) return f;
  return null;
}
const NOISE = /\b(s4s|sfs|shout(out)?|of|home|post|mass|massa|message|tg|telegram|eng|en|it|interna|interne|wall|story|stories|ultimi|ultmi|fan|1k|\d+)\b/gi;
// Testo del partner ricavato dal nome del link: "S4S Fish Mass 13/07" → "Fish"
export function partnerLabel(name) {
  return String(name || "")
    .replace(/\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?/g, " ")
    .replace(/[_|]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(NOISE, " ")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Alias univoci su TUTTA HOC: { alias → creatorKey } con creatorKey = nome base.
// allNames: [name] di tutte le pagine dell'organizzazione.
export function buildAliasIndex(allNames) {
  const bases = [...new Set(allNames.map(baseName).filter(Boolean))];
  const cand = new Map(); // alias → Set(base)
  const add = (alias, base) => {
    if (!alias || alias.length < 4) return;
    if (!cand.has(alias)) cand.set(alias, new Set());
    cand.get(alias).add(base);
  };
  for (const b of bases) {
    const words = norm(b).split(/[^a-z0-9]+/).filter(Boolean);
    add(words.join(""), b);
    for (const w of words) { add(w, b); add(w.slice(0, 4), b); }
    if (words.length > 1) add(words[0] + words[1].slice(0, 1), b); // "elisav"
  }
  const idx = new Map();
  for (const [a, set] of cand) if (set.size === 1) idx.set(a, [...set][0]);
  return idx;
}

// Partner (nome base) dal nome del link, solo se univoco; altrimenti null.
export function matchPartner(linkName, aliasIdx, { exclude } = {}) {
  const label = norm(partnerLabel(linkName));
  if (!label) return null;
  const words = label.split(/[^a-z0-9]+/).filter(Boolean);
  const hits = new Set();
  const tryAlias = (a) => { const b = aliasIdx.get(a); if (b && b !== exclude) hits.add(b); };
  tryAlias(words.join(""));
  for (let i = 0; i < words.length; i++) {
    tryAlias(words[i]);
    if (words[i + 1]) { tryAlias(words[i] + words[i + 1]); tryAlias(words[i] + words[i + 1].slice(0, 1)); }
    // nomi incollati: "alesparagno", "michelamucciante"
    for (const [a, b] of aliasIdx) if (a.length >= 5 && words[i].length > a.length && words[i].includes(a) && b !== exclude) hits.add(b);
  }
  if (!hits.size) for (const w of words) tryAlias(w.slice(0, 4));
  return hits.size === 1 ? [...hits][0] : null;
}

// Chiave degli alias assegnati a mano: il testo del partner normalizzato
// ("S4S Camilla 15/07" e "sfs camilla" → "camilla").
export const labelKey = (linkName) => norm(partnerLabel(linkName)).replace(/[^a-z0-9]+/g, " ").trim();

// ── Risultati ───────────────────────────────────────────────────────────────
// rows dalla query: { creator_id, link_name, subs, first_day, last_day, mature_subs, mature_net30, mature_payers }
// names: { id → nome }, aliasIdx da buildAliasIndex
// manual: { labelKey → nome base } assegnati a mano (vincono sull'automatico)
export function enrichResults(rows, names, aliasIdx, manual = {}) {
  return rows.map((r) => {
    const page = names[String(r.creator_id)] || String(r.creator_id);
    const lk = labelKey(r.link_name);
    const manualHit = lk && Object.prototype.hasOwnProperty.call(manual, lk) ? manual[lk] : undefined;
    const partner = manualHit !== undefined ? manualHit || null : matchPartner(r.link_name, aliasIdx, { exclude: baseName(page) });
    const mature = Number(r.mature_subs) || 0;
    const net30 = Number(r.mature_net30) || 0;
    return {
      key: `${r.creator_id}|${r.link_name}`,
      creator_id: Number(r.creator_id),
      page,
      link_name: r.link_name,
      label_key: lk,
      partner,
      partner_source: manualHit !== undefined ? "manuale" : partner ? "auto" : null,
      partner_label: partner || partnerLabel(r.link_name) || "—",
      format: linkFormat(r.link_name),
      subs: Number(r.subs) || 0,
      first_day: String(r.first_day).slice(0, 10),
      mature_subs: mature,
      net30: mature ? net30 : null,
      net30_per_sub: mature >= MIN_MATURE ? net30 / mature : null,
      payers_rate: mature >= MIN_MATURE ? (Number(r.mature_payers) || 0) / mature : null,
    };
  });
}
// Sotto questa soglia di abbonati "maturi" (≥30 giorni) il $/abbonato è rumore.
export const MIN_MATURE = 20;

// Riepilogo per pagina.
export function summarizeByPage(results) {
  const m = new Map();
  for (const r of results) {
    const p = m.get(r.creator_id) || { creator_id: r.creator_id, page: r.page, links: 0, subs: 0, mature_subs: 0, net30: 0, best: null };
    p.links++;
    p.subs += r.subs;
    p.mature_subs += r.mature_subs;
    p.net30 += r.net30 || 0;
    if (!p.best || r.subs > p.best.subs) p.best = { subs: r.subs, partner: r.partner_label, day: r.first_day };
    m.set(r.creator_id, p);
  }
  return [...m.values()].map((p) => ({
    ...p,
    avg_subs: p.links ? p.subs / p.links : 0,
    net30_per_sub: p.mature_subs >= MIN_MATURE ? p.net30 / p.mature_subs : null,
  }));
}

// Reciprocità tra pagine dello stesso split: quanto ha dato A a B e B ad A.
// pages: [{id, name}] dello split.
export function reciprocity(results, pages) {
  const byBase = new Map(pages.map((p) => [baseName(p.name), p]));
  const pairs = new Map();
  for (const r of results) {
    if (!r.partner || !byBase.has(r.partner)) continue;
    const giver = byBase.get(r.partner);
    const recvBase = baseName(r.page);
    if (!byBase.has(recvBase) || recvBase === r.partner) continue;
    const [x, y] = [recvBase, r.partner].sort();
    const k = `${x}|${y}`;
    const e = pairs.get(k) || { a: x, b: y, to_a: 0, to_b: 0, links: 0 };
    if (recvBase === x) e.to_a += r.subs; else e.to_b += r.subs;
    e.links++;
    pairs.set(k, e);
  }
  return [...pairs.values()].map((e) => {
    const hi = Math.max(e.to_a, e.to_b), lo = Math.min(e.to_a, e.to_b);
    return { ...e, ratio: lo > 0 ? hi / lo : null, one_way: lo === 0 };
  });
}

// Risultato di uno scambio pianificato: link sulla pagina che riceve, partner
// giusto, partito tra 2 giorni prima e 7 dopo il giorno previsto.
export function resultFor(results, receiverId, partnerName, day) {
  const base = baseName(partnerName);
  const lo = addDays(day, -2), hi = addDays(day, 7);
  const hit = results.filter((r) => r.creator_id === Number(receiverId) && r.partner === base && r.first_day >= lo && r.first_day <= hi);
  if (!hit.length) return null;
  return { subs: hit.reduce((s, r) => s + r.subs, 0), links: hit.map((r) => r.link_name) };
}

// Ultimo scambio storico tra due pagine (in una direzione), per dare contesto al calendario.
export function lastExchange(results, receiverId, partnerName, beforeDay) {
  const base = baseName(partnerName);
  const hit = results
    .filter((r) => r.creator_id === Number(receiverId) && r.partner === base && r.first_day < beforeDay)
    .sort((a, b) => (a.first_day < b.first_day ? 1 : -1));
  if (!hit.length) return null;
  const day = hit[0].first_day;
  const same = hit.filter((r) => Math.abs(toDate(r.first_day) - toDate(day)) <= 3 * 86400000);
  return { day, subs: same.reduce((s, r) => s + r.subs, 0) };
}

// Testo del giorno da incollare in WhatsApp.
export function whatsappText(dayEntry, names, langLabel = { it: "IT", en: "EN" }) {
  const nm = (id) => baseName(names[String(id)] || String(id));
  const lines = [`S4S · ${dayLabel(dayEntry.day)}`];
  const langs = Object.keys(dayEntry.groups);
  for (const lang of langs) {
    const g = dayEntry.groups[lang];
    if (langs.length > 1) lines.push("", `Pagine ${langLabel[lang] || lang.toUpperCase()}`);
    for (const [a, b] of g.pairs) {
      lines.push(`• ${nm(a)} ⇄ ${nm(b)}`);
      lines.push(`   link su ${nm(a)}: ${linkNameFor(nm(b), dayEntry.day)}`);
      lines.push(`   link su ${nm(b)}: ${linkNameFor(nm(a), dayEntry.day)}`);
    }
    if (g.rest.length) lines.push(`Riposa: ${g.rest.map(nm).join(", ")}`);
  }
  return lines.join("\n");
}

// ── Link incollati a mano (13/10/2026) ──────────────────────────────────────
// Flusso scelto da Nicholas: chi crea il link su OnlyFans lo incolla qui, sullo
// scambio giusto. L'abbinamento diventa per URL (certo), non più per nome.
// Formato OnlyFans: https://onlyfans.com/<username>/c<numero>
const OF_LINK_RE = /^(?:https?:\/\/)?(?:www\.)?onlyfans\.com\/([a-z0-9._-]+)\/c(\d+)\/?(?:[?#].*)?$/i;
export function normalizeLinkUrl(url) {
  const m = OF_LINK_RE.exec(String(url || "").trim());
  return m ? `onlyfans.com/${m[1].toLowerCase()}/c${m[2]}` : null;
}
export const handleFromUrl = (url) => {
  const n = normalizeLinkUrl(url);
  return n ? n.split("/")[1] : null;
};
// chiave di una metà dello scambio: il giorno, la pagina che riceve (dove sta il link), il partner
export const sideKey = (day, receiverId, partnerId) => `${day}|${receiverId}|${partnerId}`;

// Stato di una metà dello scambio, dalla meno alla più avanzata.
// stat = riga di links_stats del link incollato ({clicks, subs}) o null
export function sideStatus({ day, today, url, stat, result }) {
  if (url) {
    if (stat && stat.subs > 0) return { code: "misurato", label: `${stat.subs} abbonati` };
    if (stat && stat.clicks > 0) return { code: "pubblicato", label: `pubblicato · ${stat.clicks} click` };
    return { code: "pronto", label: day > today ? "link pronto" : "in attesa dei dati" };
  }
  if (result) return { code: "misurato", label: `${result.subs} abbonati` }; // trovato per nome
  if (day > today) return { code: "futuro", label: "da creare" };
  if (day === today) return { code: "da-fare", label: "link da incollare" };
  return { code: "mancante", label: "nessun link" };
}

// ── Accordi (13/10/2026, punto 1 del ridisegno) ─────────────────────────────
// Uno scambio non è più solo "A con B": è un ACCORDO con giorno, ora, formato di
// ciascuna pagina, durata del post fissato e stato. Il girone resta come generatore
// di PROPOSTE ("dal giro"); un accordo salvato in KV vince sulla proposta con lo
// stesso id. Gli accordi extra (fuori giro) si aggiungono a mano.
export const FORMATS = { post: "post fissato", mass: "mass message", post_mass: "post + mass", telegram: "Telegram" };
export const FORMAT_SHORT = { post: "post", mass: "mass", post_mass: "post + mass", telegram: "Telegram" };
export const DEAL_STATUS = { proposto: "proposto", confermato: "confermato", annullato: "annullato" };
export const DEAL_DEFAULTS = { time: "21:00", mass_time: "21:30", fmt: "post_mass", pin_hours: 24 };
export const MAX_PER_DAY = 3; // regola di Infloww (policy OnlyFans sui contenuti promozionali)
export const dealId = (day, a, b) => `${day}|${Math.min(Number(a), Number(b))}|${Math.max(Number(a), Number(b))}`;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Pulisce e valida un accordo in ingresso. pageIds = pagine dello split.
export function cleanDeal(input, pageIds) {
  const ids = new Set(pageIds.map(Number));
  const a = Number(input.a), b = Number(input.b);
  if (!ids.has(a) || !ids.has(b)) throw new Error("Scegli due pagine dello split");
  if (a === b) throw new Error("Una pagina non può fare S4S con sé stessa");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.day || ""))) throw new Error("Giorno non valido");
  const time = TIME_RE.test(String(input.time || "")) ? input.time : DEAL_DEFAULTS.time;
  const mass_time = TIME_RE.test(String(input.mass_time || "")) ? input.mass_time : DEAL_DEFAULTS.mass_time;
  const fmt = (f) => (FORMATS[f] ? f : DEAL_DEFAULTS.fmt);
  const pin = Number(input.pin_hours);
  const status = DEAL_STATUS[input.status] ? input.status : "proposto";
  // a/b in ordine canonico (id minore = a), i formati seguono la pagina
  const swap = a > b;
  return {
    id: dealId(input.day, a, b),
    day: input.day,
    a: swap ? b : a, b: swap ? a : b,
    fmt_a: fmt(swap ? input.fmt_b : input.fmt_a), // cosa PUBBLICA la pagina a (la promo di b)
    fmt_b: fmt(swap ? input.fmt_a : input.fmt_b),
    time, mass_time,
    pin_hours: [0, 12, 24, 48].includes(pin) ? pin : DEAL_DEFAULTS.pin_hours,
    status,
    note: String(input.note || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300),
  };
}

const virtualDeal = (day, a, b, lang) => ({
  id: dealId(day, a, b), day, a: Math.min(a, b), b: Math.max(a, b), lang,
  fmt_a: DEAL_DEFAULTS.fmt, fmt_b: DEAL_DEFAULTS.fmt, time: DEAL_DEFAULTS.time, mass_time: DEAL_DEFAULTS.mass_time,
  pin_hours: DEAL_DEFAULTS.pin_hours, status: "proposto", note: "", source: "giro",
});

// Unisce il calendario del giro (planSchedule) con gli accordi salvati.
// days: [{day, groups:{lang:{pairs:[[a,b]], rest:[ids]}}}]; stored: {id → accordo}
// Ritorna [{day, deals:[...], rest:[ids]}] per i giorni del giro più quelli con accordi extra in [from, to].
export function mergeDeals(days, stored = {}, { from, to, langOf = () => null } = {}) {
  const out = new Map();
  const used = new Set();
  for (const d of days) {
    const deals = [];
    const rest = new Set();
    for (const [lang, g] of Object.entries(d.groups || {})) {
      for (const [a, b] of g.pairs) {
        const v = virtualDeal(d.day, a, b, lang);
        const s = stored[v.id];
        if (s) used.add(v.id);
        deals.push(s ? { ...v, ...s, source: "giro" } : v);
      }
      for (const r of g.rest) rest.add(r);
    }
    out.set(d.day, { day: d.day, deals, rest });
  }
  for (const s of Object.values(stored)) {
    if (used.has(s.id) || (from && s.day < from) || (to && s.day > to)) continue;
    if (!out.has(s.day)) out.set(s.day, { day: s.day, deals: [], rest: new Set() });
    const e = out.get(s.day);
    if (e.deals.some((x) => x.id === s.id)) continue;
    e.deals.push({ ...s, lang: s.lang || langOf(s.a), source: "extra" });
  }
  return [...out.values()]
    .map((e) => {
      const busy = new Set(e.deals.filter((x) => x.status !== "annullato").flatMap((x) => [x.a, x.b]));
      return { day: e.day, deals: e.deals.sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0)), rest: [...e.rest].filter((r) => !busy.has(r)) };
    })
    .sort((x, y) => (x.day < y.day ? -1 : 1));
}

// Quanti accordi attivi ha una pagina in un giorno (escluso eventualmente un id).
export function dealsOnDay(dayEntry, pageId, exceptId) {
  if (!dayEntry) return 0;
  return dayEntry.deals.filter((x) => x.status !== "annullato" && x.id !== exceptId && (x.a === Number(pageId) || x.b === Number(pageId))).length;
}
