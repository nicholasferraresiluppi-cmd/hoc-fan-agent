/**
 * Publisher X — logica pura (27/10/2026). Archivio e query in publisher-x.js.
 *
 * Il publisher su X porta fan con un link tracciato OnlyFans. Il deal che VEDE lui:
 *
 *   tariffa publisher (es. 10%) × spesa dei suoi fan nei loro primi 30 giorni + base fissa
 *
 * La tariffa NON deriva dalla fee: Nicholas (27/10) non vuole che il publisher possa
 * risalire a quanto l'agenzia prende dalla creator. Fee e provvigione chatter servono
 * solo al controllo INTERNO: quanto resta all'agenzia su ogni profilo con quella tariffa
 * (spesa × (fee − chatter − tariffa)), per vedere dove si va in perdita.
 *
 * Ogni fan si conta dal SUO giorno di ingresso per 30 giorni (colonna spend_d30 di
 * hoc.newsubs_spending): niente link mensili o settimanali, niente fan contati 60 giorni.
 * Un fan entrato da meno di 30 giorni ha ancora una spesa parziale: il mese si
 * paga a conto definitivo solo quando tutti i suoi fan hanno chiuso i 30 giorni.
 * Si contano solo i fan NUOVI sulla pagina (is_first_sub): chi si riabbona non è merito del link.
 */

export const DEFAULT_SETTINGS = { chatterPct: 0.15, pubRate: 0.1, baseUsd: 0 };
export const DEFAULT_FEE = 0.45;
export const WINDOW_DAYS = 30;
export const WHALE_SHARE = 0.4; // sopra il 40% della spesa da un solo fan = mese che dipende da uno
const DAY = 86400000;

/**
 * Nomi di link che parlano di X/Twitter: "Linkscale_X", "twitter_sara", "LINKSCALE_tw.laura", "@nome.x".
 * La X conta solo MAIUSCOLA come parola a sé (o ".x" in fondo, o un nome che è solo "x"): la "x" minuscola nei nomi
 * vuol dire "per" ("TG Pacela x TG Ads"). Stessa regola in SQL (publisher-x-sql.js, X_RE).
 */
export function isXLink(name) {
  const s = String(name || "");
  return /^\s*x\s*$/i.test(s) || /(^|[^A-Za-z0-9])X([^A-Za-z0-9]|$)/.test(s) || /\.x$/.test(s) || /(^|[^a-z0-9])(twitter|tw)([^a-z0-9]|$)/i.test(s);
}

export const linkKey = (creatorId, linkName) => `${Number(creatorId)}|${String(linkName || "")}`;

const clampPct = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
};

/** Config dal client → config pulita. Le percentuali sono frazioni (0,45 = 45%). */
export function sanitizeConfig(input = {}) {
  const s = input.settings || {};
  const settings = {
    chatterPct: clampPct(s.chatterPct, DEFAULT_SETTINGS.chatterPct),
    pubRate: clampPct(s.pubRate, DEFAULT_SETTINGS.pubRate),
    baseUsd: Math.max(0, Math.round(Number(s.baseUsd) || 0)),
  };
  const fees = {};
  for (const [k, v] of Object.entries(input.fees || {})) {
    const id = Number(k);
    if (Number.isInteger(id) && id > 0 && Number.isFinite(Number(v))) fees[id] = clampPct(v, DEFAULT_FEE);
  }
  // tariffa diversa su un profilo (es. fee bassa): resta una percentuale sulla spesa, mai la fee
  const rates = {};
  for (const [k, v] of Object.entries(input.rates || {})) {
    const id = Number(k);
    if (Number.isInteger(id) && id > 0 && v !== null && v !== "" && Number.isFinite(Number(v))) rates[id] = clampPct(v, settings.pubRate);
  }
  const seen = new Set();
  const links = [];
  for (const l of Array.isArray(input.links) ? input.links : []) {
    const creatorId = Number(l?.creatorId);
    const linkName = String(l?.linkName || "").trim().slice(0, 200);
    const publisher = String(l?.publisher || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!Number.isInteger(creatorId) || creatorId <= 0 || !linkName || !publisher) continue;
    const k = linkKey(creatorId, linkName);
    if (seen.has(k)) continue;
    seen.add(k);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(l.from || "")) ? l.from : null;
    links.push({ creatorId, linkName, publisher, from });
  }
  // chi è il publisher in HOC Pro: l'email con cui lo si invita e lo si riconosce
  const people = {};
  const names = new Set(links.map((l) => l.publisher));
  for (const [name, v] of Object.entries(input.people || {})) {
    if (!names.has(name)) continue;
    const email = String(v?.email || "").trim().toLowerCase().slice(0, 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    // niente userId salvato: il publisher si riconosce ogni volta dall'email VERIFICATA dell'account
    people[name] = { email: email || null, invitedAt: Number(v?.invitedAt) || null };
  }
  return { settings, fees, rates, links, people };
}

export const feeFor = (config, creatorId) => {
  const f = config?.fees?.[Number(creatorId)];
  return f === undefined || f === null ? DEFAULT_FEE : f;
};

/** La tariffa del publisher su un profilo: quella del profilo se c'è, altrimenti quella di tutti. */
export const rateFor = (config, creatorId) => {
  const r = config?.rates?.[Number(creatorId)];
  return r === undefined || r === null ? (config?.settings?.pubRate ?? DEFAULT_SETTINGS.pubRate) : r;
};

/**
 * Per ogni dollaro speso dal fan: al publisher `rate`; all'agenzia, dopo creator e chatter,
 * `clean` (fee − chatter) e, tolto il publisher, `agency` (può essere negativo: profilo in perdita).
 */
export function splitDollar(fee, rate, settings = DEFAULT_SETTINGS) {
  const clean = (Number(fee) || 0) - Math.min(Number(fee) || 0, Number(settings.chatterPct) || 0);
  const r = Number(rate) || 0;
  return { clean, rate: r, agency: clean - r };
}

/** Il fan ha chiuso i suoi 30 giorni entro il giorno dei dati? */
export function isMature(subStartIso, dataUntilIso) {
  const start = Date.parse(subStartIso);
  const until = Date.parse(dataUntilIso);
  if (!Number.isFinite(start) || !Number.isFinite(until)) return false;
  return start + WINDOW_DAYS * DAY <= until;
}

/** "YYYY-MM" del giorno di ingresso, ora di Roma (il mese del lavoro del publisher). */
export function monthOf(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Le BUSTE (27/10, idea di Nicholas): ogni fan portato è una busta che si apre il giorno in
 * cui entra e si chiude al 30° giorno. Finché è aperta mostra quanto il fan sta spendendo;
 * chiusa, il suo valore si sblocca e va nel conto del MESE IN CUI SI CHIUDE. Così ogni mese
 * paga solo buste chiuse (niente conti provvisori) e il publisher vede la missione compiersi.
 * fans = righe { creatorId, creatorName, linkName, userId, username, subStart, d0, d7, d30 }
 * (solo fan nuovi). `from` del link esclude i fan entrati prima che il publisher lo prendesse.
 */
export function toEnvelopes({ fans = [], config, dataUntil }) {
  const settings = config?.settings || DEFAULT_SETTINGS;
  const byLink = new Map((config?.links || []).map((l) => [linkKey(l.creatorId, l.linkName), l]));
  const until = Date.parse(dataUntil);
  const out = [];
  for (const f of fans) {
    const l = byLink.get(linkKey(f.creatorId, f.linkName));
    if (!l) continue;
    if (l.from && String(f.subStart).slice(0, 10) < l.from) continue;
    const start = Date.parse(f.subStart);
    if (!Number.isFinite(start)) continue;
    const closeAt = new Date(start + WINDOW_DAYS * DAY).toISOString();
    const closed = Number.isFinite(until) && start + WINDOW_DAYS * DAY <= until;
    const day = closed ? WINDOW_DAYS : Math.max(1, Math.min(WINDOW_DAYS, Math.floor(((Number.isFinite(until) ? until : start) - start) / DAY) + 1));
    const fee = feeFor(config, f.creatorId);
    const { clean, rate } = splitDollar(fee, rateFor(config, f.creatorId), settings);
    const d30 = Number(f.d30) || 0; // busta aperta: speso FINORA
    out.push({ ...f, publisher: l.publisher, closeAt, closeMonth: monthOf(closeAt), closed, day, fee, rate, spent: r2(d30), value: r2(d30 * clean), bonus: r2(d30 * rate) });
  }
  return out;
}

/**
 * Conto del mese per publisher: buste CHIUSE in quel mese (definitive) + buste ancora aperte
 * (in corso, valore che sta maturando). La base è per mese. → { publishers: [...] }
 */
export function monthPayout({ envelopes = [], config, month }) {
  const base = config?.settings?.baseUsd || 0;
  const pubs = new Map();
  const get = (name) => { if (!pubs.has(name)) pubs.set(name, { closed: [], open: [] }); return pubs.get(name); };
  for (const e of envelopes) {
    if (e.closed && e.closeMonth === month) get(e.publisher).closed.push(e);
    else if (!e.closed) get(e.publisher).open.push(e);
  }
  for (const l of config?.links || []) get(l.publisher); // chi ha un link compare anche a zero
  const publishers = [...pubs.entries()].map(([name, { closed, open }]) => {
    closed.sort((a, b) => b.spent - a.spent || String(a.subStart).localeCompare(String(b.subStart)));
    const sum = (rows, k) => r2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    const bonus = sum(closed, "bonus");
    const spend30 = sum(closed, "spent");
    // un solo fan grosso fa sembrare bravo chi l'ha beccato: si dichiara, non si corregge
    const topShare = spend30 > 0 ? (Number(closed[0]?.spent) || 0) / spend30 : null;
    return {
      name, fans: closed, subs: closed.length, spend30, topShare,
      value: sum(closed, "value"), bonus, base, total: r2(bonus + base), margin: r2(sum(closed, "value") - bonus - base),
      openCount: open.length, openSpent: sum(open, "spent"), openBonus: sum(open, "bonus"),
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "it"));
  return { publishers };
}

/** Storico per mese di chiusura di un insieme di buste (per la pagina del publisher). */
export function monthsHistory(envelopes = [], base = 0) {
  const m = new Map();
  for (const e of envelopes) {
    if (!e.closed) continue;
    const k = e.closeMonth;
    if (!m.has(k)) m.set(k, { month: k, closed: 0, spent: 0, bonus: 0 });
    const x = m.get(k);
    x.closed += 1; x.spent = r2(x.spent + e.spent); x.bonus = r2(x.bonus + e.bonus);
  }
  return [...m.values()].map((x) => ({ ...x, base, total: r2(x.bonus + base) })).sort((a, b) => b.month.localeCompare(a.month));
}

/** Il publisher di un account: quello la cui email è tra le email VERIFICATE dell'account (una sola). */
export function publisherForEmails(config, emails = []) {
  const set = new Set(emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean));
  const hits = Object.entries(config?.people || {}).filter(([, v]) => v.email && set.has(v.email)).map(([name]) => name);
  return hits.length === 1 ? hits[0] : null;
}
