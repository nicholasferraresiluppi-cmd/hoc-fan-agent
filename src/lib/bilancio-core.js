// Bilancio del mese — logica pura (16/10/2026). È il foglio "Bilancio_unico_LIVE" di Nicholas
// portato in HOC Pro: la classifica di TUTTE le creator dello split, che ogni sales manager vede
// anche se gli è assegnata una creator sola ("crea competitività" — Nicholas). Niente Node qui:
// la usano l'API (src/lib/bilancio.js) e i test (tests/bilancio.mjs).
//
// Definizioni (le stesse del foglio, dove il foglio è coerente):
//   venduto        = SUM(net) di onlyfans.attributed_transactions per DATE(created_at) (UTC) —
//                    verificato al centesimo contro "Entrate oggi" del foglio il 15/10/2026
//   target oggi    = goal ÷ giorni del mese                       (foglio: 125.000 ÷ 31 = 4.032,26)
//   % ideale       = giorni chiusi ÷ giorni del mese              (oggi è a metà: non conta)
//   % attuale      = venduto del mese ÷ goal
//   proiezione     = venduto dei giorni chiusi ÷ giorni chiusi × giorni del mese
//                    (il foglio contava anche il giorno in corso, che a metà giornata abbassa la stima)
//   scostamento    = proiezione − goal                            (foglio: 123.822,80 − 125.000 = −1.177,20)
//   Δ mese prima   = proiezione − venduto del mese precedente intero
// Classifica: proiezione ÷ goal (chi arriva più lontano rispetto al SUO goal). Senza goal in fondo.

export const COUNTRIES = ["IT", "EN", "ES"];

const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const div = (a, b) => (a == null || !b ? null : a / b);

/** "2026-10-16" → { month:"2026-10", day:16, daysInMonth:31, prevMonth:"2026-09" } */
export function calendarOf(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return {
    month: `${y}-${String(m).padStart(2, "0")}`,
    day: d,
    daysInMonth,
    prevMonth: `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

/**
 * creators = [{ slug, name, accounts:[{ creator_id, country }] }]   (dallo split, live-creators)
 * daily    = [{ creator_id, date:"YYYY-MM-DD", net }]              (mese corrente)
 * prevTotals = { [creator_id]: net del mese precedente intero }
 * goals    = { [slug]: { [country]: { [month]: number } } }        (revenue:goals:{slug}, condivisi con Revenue e chat)
 * people   = { [slug]: { [country]: { am, sm } } }
 * today    = "YYYY-MM-DD" (UTC, come le date del venduto)
 */
export function buildBilancio({ creators = [], daily = [], prevTotals = {}, goals = {}, people = {}, today }) {
  const cal = calendarOf(today);
  const closedDays = cal.day - 1;
  const idealPct = closedDays / cal.daysInMonth;

  // venduto per account: giorno → net
  const byId = new Map();
  for (const r of daily) {
    if (!String(r.date).startsWith(cal.month)) continue;
    const id = Number(r.creator_id);
    if (!byId.has(id)) byId.set(id, new Map());
    const m = byId.get(id);
    m.set(r.date, (m.get(r.date) || 0) + n(r.net));
  }

  const accountRow = (c, a) => {
    const days = byId.get(Number(a.creator_id)) || new Map();
    let mtd = 0, closed = 0, todayNet = 0, yesterdayNet = 0;
    for (const [date, v] of days) {
      const d = Number(date.slice(8, 10));
      mtd += v;
      if (d < cal.day) closed += v;
      if (d === cal.day) todayNet += v;
      if (d === cal.day - 1) yesterdayNet += v;
    }
    const goalRaw = goals?.[c.slug]?.[a.country]?.[cal.month];
    const goal = goalRaw == null ? null : n(goalRaw);
    const projection = closedDays > 0 ? (closed / closedDays) * cal.daysInMonth : null;
    const prev = prevTotals[a.creator_id] == null ? null : n(prevTotals[a.creator_id]);
    const p = people?.[c.slug]?.[a.country] || {};
    return {
      creator_id: Number(a.creator_id), country: a.country,
      am: p.am || null, sm: p.sm || null,
      today: round2(todayNet),
      yesterday: cal.day > 1 ? round2(yesterdayNet) : null,
      targetToday: goal ? round2(goal / cal.daysInMonth) : null,
      mtd: round2(mtd),
      goal,
      pctActual: div(mtd, goal),
      projection: round2(projection),
      prev: round2(prev),
      deltaPrev: projection != null && prev != null ? round2(projection - prev) : null,
      gap: projection != null && goal ? round2(projection - goal) : null,
      reach: projection != null && goal ? projection / goal : null,
    };
  };

  const sumRows = (rows, extra) => {
    const s = (f) => (rows.some((r) => r[f] != null) ? round2(rows.reduce((a, r) => a + n(r[f]), 0)) : null);
    const goal = rows.every((r) => r.goal == null) ? null : s("goal");
    const out = { today: s("today"), yesterday: s("yesterday"), targetToday: s("targetToday"), mtd: s("mtd"), goal, projection: s("projection"), prev: s("prev"), ...extra };
    out.pctActual = div(out.mtd, goal);
    out.deltaPrev = out.projection != null && out.prev != null ? round2(out.projection - out.prev) : null;
    out.gap = out.projection != null && goal ? round2(out.projection - goal) : null;
    out.reach = out.projection != null && goal ? out.projection / goal : null;
    return out;
  };

  const list = creators
    .filter((c) => c.accounts?.length)
    .map((c) => {
      const accounts = [...c.accounts]
        .sort((x, y) => COUNTRIES.indexOf(x.country) - COUNTRIES.indexOf(y.country))
        .map((a) => accountRow(c, a));
      return { slug: c.slug, name: c.name, accounts, ...sumRows(accounts) };
    });

  // Classifica: proiezione ÷ goal; senza goal in fondo, tra loro per venduto.
  list.sort((a, b) => (b.reach != null) - (a.reach != null) || (b.reach ?? 0) - (a.reach ?? 0) || n(b.mtd) - n(a.mtd));
  let rank = 0;
  for (const c of list) c.rank = c.reach != null ? ++rank : null;

  // Andamento del mese: una riga per giorno, colonne per paese.
  const countryOf = new Map();
  for (const c of creators) for (const a of c.accounts || []) countryOf.set(Number(a.creator_id), a.country);
  const days = [];
  for (let d = 1; d <= cal.daysInMonth; d++) {
    const date = `${cal.month}-${String(d).padStart(2, "0")}`;
    const row = { date, day: d, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), future: d > cal.day, partial: d === cal.day, IT: 0, EN: 0, ES: 0, total: 0 };
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
  return { ...cal, closedDays, idealPct, today, countries, totals, creators: list, days };
}

/** Pulizia di AM/SM scritti a mano: testo breve, niente markup. */
export function cleanPerson(v) {
  const s = String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return s || null;
}
