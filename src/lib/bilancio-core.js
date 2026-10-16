// Bilancio del mese — logica pura (16/10/2026). È il foglio "Bilancio_unico_LIVE" di Nicholas
// portato in HOC Pro: la classifica di TUTTE le creator dello split, che ogni sales manager vede
// anche se gli è assegnata una creator sola ("crea competitività" — Nicholas). Niente Node qui:
// la usano l'API (src/lib/bilancio.js) e i test (tests/bilancio.mjs).
//
// v2 (16/10, stesso giorno, feedback Nicholas):
//   - si sceglie il GIORNO (asOf): tutto si legge "a fine giornata di quel giorno", anche nei mesi
//     passati — come scorrere il foglio. Oggi resta "in corso".
//   - creator raggruppate in ECOSISTEMI (gruppi di creator che condividono le persone): il totale
//     dell'ecosistema contro il suo goal, per spingere il lavoro di squadra dentro il gruppo.
//   - chi è indietro non legge "in perdita": legge quanto serve al giorno da qui a fine mese
//     (traguardo vicino e concreto). Stato: ci arriva / ci è vicina / serve +X al giorno.
//
// Definizioni (le stesse del foglio, dove il foglio è coerente):
//   venduto        = SUM(net) di onlyfans.attributed_transactions per DATE(created_at) (UTC) —
//                    verificato al centesimo contro "Entrate oggi" del foglio il 15/10/2026
//   giorni chiusi  = giorni finiti fino al giorno scelto (oggi non conta: è a metà)
//   target giorno  = goal ÷ giorni del mese                       (foglio: 125.000 ÷ 31 = 4.032,26)
//   % ideale       = giorni chiusi ÷ giorni del mese
//   % goal         = venduto fino al giorno scelto ÷ goal
//   fa al giorno   = venduto dei giorni chiusi ÷ giorni chiusi
//   proiezione     = fa al giorno × giorni del mese
//   serve al giorno= (goal − venduto) ÷ giorni che restano (giorni del mese − giorni chiusi)
//   stato          = ci arriva (proiezione ≥ goal) · vicina (fa al giorno ≥ 90% di quello che serve) · sotto
// Classifica: proiezione ÷ goal (ognuna misurata sul SUO goal). Senza goal in fondo, senza posizione.

export const COUNTRIES = ["IT", "EN", "ES"];
export const NEAR = 0.9; // "ci è vicina": fa almeno il 90% di quello che le serve al giorno

const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const div = (a, b) => (a == null || !b ? null : a / b);
const pad = (x) => String(x).padStart(2, "0");

/** "2026-10-16" → { month:"2026-10", day:16, daysInMonth:31, prevMonth:"2026-09" } */
export function calendarOf(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return {
    month: `${y}-${pad(m)}`,
    day: d,
    daysInMonth,
    prevMonth: `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}`,
  };
}

/** Data valida "AAAA-MM-GG" non oltre oggi e non prima di 24 mesi fa; altrimenti oggi. */
export function clampDay(raw, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw || ""))) return today;
  const t = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== raw) return today;
  if (raw > today) return today;
  const min = new Date(Date.parse(`${today}T00:00:00Z`));
  min.setUTCMonth(min.getUTCMonth() - 24);
  return raw < min.toISOString().slice(0, 10) ? today : raw;
}

/** Stato in parole, mai "in perdita": ci arriva / vicina / sotto. */
export function statusOf(r) {
  if (r.goal == null || r.projection == null) return null;
  if (r.projection >= r.goal) return "arriva";
  if (r.perDay != null && r.needPerDay != null && r.needPerDay > 0 && r.perDay >= r.needPerDay * NEAR) return "vicina";
  return "sotto";
}

/** Ecosistemi puliti: nomi brevi, ogni creator in UN solo gruppo, gruppi vuoti tolti. */
export function cleanGroups(raw, knownSlugs = null) {
  const seen = new Set();
  const out = [];
  for (const g of Array.isArray(raw) ? raw.slice(0, 30) : []) {
    const name = String(g?.name ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    const slugs = [];
    for (const s of Array.isArray(g?.slugs) ? g.slugs : []) {
      const k = String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
      if (!k || seen.has(k) || (knownSlugs && !knownSlugs.has(k))) continue;
      seen.add(k);
      slugs.push(k);
    }
    if (!name || !slugs.length) continue;
    const id = String(g?.id || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    out.push({ id, name, slugs });
  }
  return out;
}

/**
 * creators = [{ slug, name, accounts:[{ creator_id, country }] }]   (dallo split, live-creators)
 * daily    = [{ creator_id, date:"YYYY-MM-DD", net }]              (mese del giorno scelto)
 * prevTotals = { [creator_id]: net del mese precedente intero }
 * goals    = { [slug]: { [country]: { [month]: number } } }        (revenue:goals:{slug}, condivisi con Revenue e chat)
 * people   = { [slug]: { [country]: { am, sm } } }
 * groups   = [{ id, name, slugs[] }]                                (ecosistemi)
 * today    = "YYYY-MM-DD" (UTC, come le date del venduto) · asOf = giorno scelto (≤ today)
 */
export function buildBilancio({ creators = [], daily = [], prevTotals = {}, goals = {}, people = {}, groups = [], today, asOf }) {
  const day = asOf && asOf <= today ? asOf : today;
  const cal = calendarOf(day);
  const live = day === today;                       // il giorno scelto è oggi: in corso
  const closedDays = live ? cal.day - 1 : cal.day;  // giorni finiti fino al giorno scelto
  const daysLeft = cal.daysInMonth - closedDays;
  const idealPct = closedDays / cal.daysInMonth;
  const prevDay = cal.day > 1 ? `${cal.month}-${pad(cal.day - 1)}` : null;

  // venduto per account: giorno → net (solo il mese del giorno scelto, fino a quel giorno)
  const byId = new Map();
  for (const r of daily) {
    const date = String(r.date);
    if (!date.startsWith(cal.month) || date > day) continue;
    const id = Number(r.creator_id);
    if (!byId.has(id)) byId.set(id, new Map());
    const m = byId.get(id);
    m.set(date, (m.get(date) || 0) + n(r.net));
  }

  const derive = (o) => {
    o.pctActual = div(o.mtd, o.goal);
    o.perDay = closedDays > 0 && o.closed != null ? round2(o.closed / closedDays) : null;
    o.projection = o.perDay != null ? round2(o.perDay * cal.daysInMonth) : null;
    o.needPerDay = o.goal && daysLeft > 0 ? round2(Math.max(0, o.goal - n(o.mtd)) / daysLeft) : null;
    o.gap = o.projection != null && o.goal ? round2(o.projection - o.goal) : null;
    o.reach = o.projection != null && o.goal ? o.projection / o.goal : null;
    o.deltaPrev = o.projection != null && o.prev != null ? round2(o.projection - o.prev) : null;
    o.status = statusOf(o);
    return o;
  };

  const accountRow = (c, a) => {
    const days = byId.get(Number(a.creator_id)) || new Map();
    let mtd = 0, closed = 0;
    for (const [date, v] of days) {
      mtd += v;
      if (!(live && date === day)) closed += v;
    }
    const goalRaw = goals?.[c.slug]?.[a.country]?.[cal.month];
    const goal = goalRaw == null ? null : n(goalRaw);
    const p = people?.[c.slug]?.[a.country] || {};
    return derive({
      creator_id: Number(a.creator_id), country: a.country,
      am: p.am || null, sm: p.sm || null,
      day: round2(days.get(day) || 0),
      prevDay: prevDay ? round2(days.get(prevDay) || 0) : null,
      targetDay: goal ? round2(goal / cal.daysInMonth) : null,
      mtd: round2(mtd), closed: round2(closed),
      goal,
      prev: prevTotals[a.creator_id] == null ? null : round2(n(prevTotals[a.creator_id])),
    });
  };

  const sumRows = (rows, extra) => {
    const s = (f) => (rows.some((r) => r[f] != null) ? round2(rows.reduce((acc, r) => acc + n(r[f]), 0)) : null);
    return derive({
      day: s("day"), prevDay: s("prevDay"), targetDay: s("targetDay"),
      mtd: s("mtd"), closed: s("closed"),
      goal: rows.every((r) => r.goal == null) ? null : s("goal"),
      prev: s("prev"), ...extra,
    });
  };

  const byReach = (a, b) => (b.reach != null) - (a.reach != null) || (b.reach ?? 0) - (a.reach ?? 0) || n(b.mtd) - n(a.mtd);

  const list = creators
    .filter((c) => c.accounts?.length)
    .map((c) => {
      const accounts = [...c.accounts]
        .sort((x, y) => COUNTRIES.indexOf(x.country) - COUNTRIES.indexOf(y.country))
        .map((a) => accountRow(c, a));
      return { slug: c.slug, name: c.name, accounts, ...sumRows(accounts) };
    });
  list.sort(byReach);
  let rank = 0;
  for (const c of list) c.rank = c.reach != null ? ++rank : null;

  // Ecosistemi: le creator che non stanno in nessun gruppo finiscono in "Altre creator".
  const bySlug = new Map(list.map((c) => [c.slug, c]));
  const used = new Set();
  const eco = [];
  for (const g of cleanGroups(groups)) {
    const members = g.slugs.map((s) => bySlug.get(s)).filter(Boolean);
    if (!members.length) continue;
    members.forEach((c) => used.add(c.slug));
    members.sort(byReach);
    eco.push({ id: g.id, name: g.name, creators: members, ...sumRows(members.flatMap((c) => c.accounts)) });
  }
  const rest = list.filter((c) => !used.has(c.slug));
  eco.sort(byReach);
  let grank = 0;
  for (const g of eco) g.rank = g.reach != null ? ++grank : null;
  if (rest.length) eco.push({ id: "_altre", name: eco.length ? "Altre creator" : "Tutte le creator", other: true, rank: null, creators: rest, ...sumRows(rest.flatMap((c) => c.accounts)) });

  // Andamento del mese: una riga per giorno, colonne per paese.
  const countryOf = new Map();
  for (const c of creators) for (const a of c.accounts || []) countryOf.set(Number(a.creator_id), a.country);
  const days = [];
  for (let d = 1; d <= cal.daysInMonth; d++) {
    const date = `${cal.month}-${pad(d)}`;
    const row = { date, day: d, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), future: date > day, partial: live && date === day, selected: date === day, IT: 0, EN: 0, ES: 0, total: 0 };
    for (const [id, m] of byId) {
      const v = m.get(date);
      if (!v) continue;
      const k = countryOf.get(id);
      if (!k) continue; // pagina fuori dallo split
      row[k] += v;
      row.total += v;
    }
    for (const k of [...COUNTRIES, "total"]) row[k] = row.future ? null : round2(row[k]);
    days.push(row);
  }
  const countries = COUNTRIES.filter((k) => creators.some((c) => (c.accounts || []).some((a) => a.country === k)));

  const totals = sumRows(list.flatMap((c) => c.accounts));
  return { ...cal, asOf: day, today, live, closedDays, daysLeft, idealPct, prevDayDate: prevDay, countries, totals, creators: list, groups: eco, days };
}

/** Pulizia di AM/SM scritti a mano: testo breve, niente markup. */
export function cleanPerson(v) {
  const s = String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return s || null;
}
