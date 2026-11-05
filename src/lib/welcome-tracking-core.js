// Benvenuto a pagamento (31/10/2026) — logica pura, testata in tests/welcome-tracking.mjs.
//
// PERCHÉ ESISTE: la tabella del warehouse `onlyfans.welcome_unlocks` (quella del Looker "Welcome mass
// unlocks") conta gli sblocchi solo al prezzo scritto A MANO in un foglio dell'altra parte ("price_tag").
// Quando una creator cambia prezzo e nessuno aggiorna il foglio, gli sblocchi vanno a zero: a fine ottobre
// 2026 Giulia Ottorini IT risultava a $8,99 con 2 sblocchi su ~4.600 iscritti, mentre dal 13/10 il
// benvenuto partiva a $6,19 e veniva comprato da ~5% dei nuovi; 29 creator dello split erano a zero.
//
// COME CONTA HOC PRO (lib/welcome-tracking-sql.js):
//   - per ogni NUOVO iscritto, il prezzo del benvenuto è quello del primo messaggio a pagamento che la
//     pagina gli manda entro 2 ore (stessa definizione del Chat Monitor) — si legge dalle chat, niente da
//     configurare; un cambio di prezzo diventa da solo una riga in più;
//   - PREZZO INSERITO A MANO (benvenuto mandato con un altro strumento, o che le chat non vedono): da quella
//     data il prezzo del benvenuto è quello indicato, per tutti i nuovi iscritti, e vince sulle chat;
//   - sbloccato = il fan compra un messaggio a quel prezzo esatto entro 72 ore dall'iscrizione.
//     Verificato su Giulia Ottorini IT (iscritti 15-27/10): 129 acquisti a $6,19 contro 130 benvenuti
//     risultati aperti nella chat in tempo reale. Resta un abbinamento DEDOTTO: un PPV a mano allo stesso
//     prezzo nelle prime 72 ore conterebbe come sblocco.

export const UNLOCK_WINDOW_H = 72;
export const WELCOME_WINDOW_H = 2;
export const MIN_PRICE = 0.5;
export const MAX_PRICE = 500;
const MAX_TOOL = 60;
const MAX_NOTE = 240;
// un prezzo visto su pochi iscritti è quasi sempre un PPV a mano mandato subito, non il benvenuto
export const MIN_GROUP_SUBS = 10;
export const MIN_GROUP_SHARE = 0.03;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s) => typeof s === "string" && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Valida un prezzo inserito a mano. Ritorna { ok, rule } oppure { ok:false, error }.
 * `to` vuoto = ancora in uso.
 */
export function validateRule(input = {}) {
  const creator_id = Number(input.creator_id);
  if (!Number.isInteger(creator_id) || creator_id <= 0) return { ok: false, error: "Scegli la pagina" };
  const price = Number(String(input.price ?? "").replace(",", "."));
  if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) return { ok: false, error: `Il prezzo va da $${MIN_PRICE} a $${MAX_PRICE}` };
  if (Math.round(price * 100) / 100 !== price) return { ok: false, error: "Il prezzo ha al massimo due decimali" };
  if (!isDay(input.from)) return { ok: false, error: "Indica da che giorno vale il prezzo" };
  const to = input.to ? String(input.to) : null;
  if (to && !isDay(to)) return { ok: false, error: "Data di fine non valida" };
  if (to && to < input.from) return { ok: false, error: "La fine viene prima dell'inizio" };
  return { ok: true, rule: { creator_id, price, from: input.from, to, tool: clean(input.tool, MAX_TOOL), note: clean(input.note, MAX_NOTE) } };
}

/**
 * Finestre effettive dei prezzi inseriti a mano, per pagina: senza sovrapposizioni.
 * Un prezzo nuovo chiude quello prima il giorno precedente (se quello era aperto o finiva dopo).
 * A parità di data d'inizio vince l'ultimo inserito.
 */
export function ruleWindows(rules = [], horizon) {
  const byCreator = new Map();
  for (const r of rules) {
    if (!r || !isDay(r.from)) continue;
    const k = Number(r.creator_id);
    if (!byCreator.has(k)) byCreator.set(k, []);
    byCreator.get(k).push(r);
  }
  const out = [];
  for (const list of byCreator.values()) {
    const sorted = [...list].sort((a, b) => a.from.localeCompare(b.from) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    // a parità di inizio tiene l'ultimo inserito
    const dedup = sorted.filter((r, i) => !(sorted[i + 1] && sorted[i + 1].from === r.from));
    dedup.forEach((r, i) => {
      const next = dedup[i + 1];
      let to = r.to || horizon;
      if (next && (!to || to >= next.from)) to = addDays(next.from, -1);
      if (to && to < r.from) return;
      out.push({ rule_id: r.id, creator_id: Number(r.creator_id), price: Number(r.price), from: r.from, to: to || null, tool: r.tool || "", note: r.note || "" });
    });
  }
  return out;
}

/**
 * Righe della query (pagina × giorno × prezzo) → periodi per pagina e prezzo, serie giornaliera, totali.
 * rows: { creator_id, day, price (null = nessun benvenuto a pagamento), manual, rule_id, subs, unlocks }
 * `today`: per dichiarare gli iscritti che hanno ancora tempo per sbloccare.
 */
export function summarize(rows = [], { names = {}, rules = [], today } = {}) {
  const nameOf = (id) => names[Number(id)] || `Creator ${id}`;
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const groups = new Map();
  const perCreator = new Map();
  const daily = new Map();
  for (const r of rows) {
    const cid = Number(r.creator_id);
    const subs = Number(r.subs) || 0, unlocks = Number(r.unlocks) || 0;
    const price = r.price == null ? null : r2(r.price);
    const manual = r.manual === true || r.manual === "true";
    const c = perCreator.get(cid) || { subs: 0, unpaid: 0 };
    c.subs += subs;
    if (price == null) c.unpaid += subs;
    perCreator.set(cid, c);
    if (price == null) continue;
    const key = `${cid}|${price}|${manual ? r.rule_id || "m" : "chat"}`;
    const g = groups.get(key) || { creator_id: cid, price, manual, rule_id: manual ? r.rule_id || null : null, from: r.day, to: r.day, subs: 0, unlocks: 0 };
    g.subs += subs; g.unlocks += unlocks;
    if (r.day < g.from) g.from = r.day;
    if (r.day > g.to) g.to = r.day;
    groups.set(key, g);
  }
  // prezzi rari = PPV a mano mandato subito, non il benvenuto: fuori dalle righe, contati a parte
  const rare = new Map();
  const kept = [];
  for (const g of groups.values()) {
    const tot = perCreator.get(g.creator_id)?.subs || 0;
    if (!g.manual && (g.subs < MIN_GROUP_SUBS || g.subs < tot * MIN_GROUP_SHARE)) {
      rare.set(g.creator_id, (rare.get(g.creator_id) || 0) + g.subs);
      continue;
    }
    kept.push(g);
  }
  const keptKeys = new Set(kept.map((g) => `${g.creator_id}|${g.price}|${g.manual ? g.rule_id || "m" : "chat"}`));
  for (const r of rows) {
    if (r.price == null) continue;
    const manual = r.manual === true || r.manual === "true";
    if (!keptKeys.has(`${Number(r.creator_id)}|${r2(r.price)}|${manual ? r.rule_id || "m" : "chat"}`)) continue;
    const d = daily.get(r.day) || { day: r.day, subs: 0, unlocks: 0 };
    d.subs += Number(r.subs) || 0; d.unlocks += Number(r.unlocks) || 0;
    daily.set(r.day, d);
  }
  const fresh = today ? addDays(today, -Math.ceil(UNLOCK_WINDOW_H / 24)) : null;
  const list = kept.map((g) => {
    const rule = g.rule_id ? ruleById.get(g.rule_id) : null;
    return {
      key: `${g.creator_id}-${g.price}-${g.rule_id || "chat"}-${g.from}`,
      creator_id: g.creator_id, name: nameOf(g.creator_id), amount: g.price,
      origin: g.manual ? "manual" : "chat", tool: rule?.tool || "", rule_id: g.rule_id,
      from: g.from, to: g.to, subs: g.subs, unlocks: g.unlocks,
      revenue: r2(g.price * g.unlocks), cr: g.subs ? g.unlocks / g.subs : null,
      maturing: Boolean(fresh && g.to > fresh),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "it") || a.from.localeCompare(b.from));
  // in uso adesso = i periodi che arrivano fino all'ultimo giorno visto della pagina (± 1 giorno):
  // due benvenuti che si alternano in parallelo sono in uso tutti e due
  const lastDay = new Map();
  for (const r of list) if (!lastDay.has(r.creator_id) || r.to > lastDay.get(r.creator_id)) lastDay.set(r.creator_id, r.to);
  for (const r of list) r.current = r.to >= addDays(lastDay.get(r.creator_id), -1);
  const withPaid = new Set(list.map((r) => r.creator_id));
  const unpaid = [...perCreator].filter(([cid, c]) => !withPaid.has(cid) && c.subs > 0)
    .map(([cid, c]) => ({ creator_id: cid, name: nameOf(cid), subs: c.subs }))
    .sort((a, b) => b.subs - a.subs);
  const subs = list.reduce((a, r) => a + r.subs, 0), unlocks = list.reduce((a, r) => a + r.unlocks, 0);
  return {
    rows: list,
    unpaid,
    rare: [...rare].map(([cid, n]) => ({ creator_id: cid, name: nameOf(cid), subs: n })),
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    total: { subs, unlocks, revenue: r2(list.reduce((a, r) => a + r.revenue, 0)), cr: subs ? unlocks / subs : null },
    maturingFrom: fresh,
  };
}
