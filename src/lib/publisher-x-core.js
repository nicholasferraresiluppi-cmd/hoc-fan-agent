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
  return { settings, fees, rates, links };
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
 * Conto di un mese. fans = righe { creatorId, linkName, userId, username, subStart, d0, d7, d30 }
 * (già filtrate sul mese e sui fan nuovi). Il link decide il publisher; `from` esclude
 * i fan entrati prima che il publisher prendesse il link.
 * → { publishers: [{ name, fans:[...], subs, spend30, value, bonus, base, total, immature, final }], unassigned }
 */
export function computeMonth({ fans = [], config, dataUntil }) {
  const settings = config?.settings || DEFAULT_SETTINGS;
  const byLink = new Map((config?.links || []).map((l) => [linkKey(l.creatorId, l.linkName), l]));
  const pubs = new Map();
  let unassigned = 0;
  for (const f of fans) {
    const l = byLink.get(linkKey(f.creatorId, f.linkName));
    if (!l) { unassigned += 1; continue; }
    if (l.from && String(f.subStart).slice(0, 10) < l.from) continue;
    const fee = feeFor(config, f.creatorId);
    const { clean, rate } = splitDollar(fee, rateFor(config, f.creatorId), settings);
    const mature = isMature(f.subStart, dataUntil);
    const d30 = Number(f.d30) || 0;
    const row = { ...f, mature, fee, rate, value: r2(d30 * clean), bonus: r2(d30 * rate) };
    if (!pubs.has(l.publisher)) pubs.set(l.publisher, []);
    pubs.get(l.publisher).push(row);
  }
  const publishers = [...pubs.entries()].map(([name, rows]) => {
    rows.sort((a, b) => (b.d30 || 0) - (a.d30 || 0) || String(a.subStart).localeCompare(String(b.subStart)));
    const sum = (k) => r2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
    const bonus = sum("bonus");
    const base = settings.baseUsd || 0;
    const immature = rows.filter((r) => !r.mature).length;
    const spend30 = sum("d30");
    // un solo fan grosso fa sembrare bravo chi l'ha beccato: si dichiara, non si corregge
    const topShare = spend30 > 0 ? (Number(rows[0]?.d30) || 0) / spend30 : null;
    return {
      name, fans: rows, subs: rows.length,
      spend30, topShare, value: sum("value"), bonus, base,
      total: r2(bonus + base), margin: r2(sum("value") - bonus - base),
      immature, final: immature === 0,
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "it"));
  return { publishers, unassigned };
}

/** I 30 giorni sono chiusi per tutto il mese quando l'ultimo giorno del mese + 30 è passato. */
export function monthClosesOn(month) {
  const [y, m] = String(month).split("-").map(Number);
  if (!y || !m) return null;
  const last = new Date(Date.UTC(y, m, 0)); // ultimo giorno del mese
  return new Date(last.getTime() + (WINDOW_DAYS + 1) * DAY).toISOString().slice(0, 10);
}
