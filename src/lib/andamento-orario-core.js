// Andamento per ora (19/11/2026) — calcoli puri sopra le righe delle query (lib/andamento-orario-sql.js).
// Niente rete, niente KV: tutto testato in tests/andamento-orario.mjs.
//
// UNITÀ: ogni numero orario è una MEDIA AL GIORNO del periodo («alle 23 entrano in media $X»), così periodi di
// lunghezza diversa si confrontano. La tabella settimanale divide per quante volte quel giorno della settimana
// cade nel periodo. I messaggi dividono per i giorni che il warehouse ha già (arrivano fino a ieri).
// ORE in ora italiana; finestre circolari (le 22–2 attraversano la mezzanotte).

const DAY = 86400e3;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DAYS = 120;
// sotto mezzo operatore in media l'ora è «quasi scoperta»: i rapporti per operatore lì sono artefatti
// (Giulia Ottorini 3-7: 0,07 operatori → 578 messaggi «a testa»), si dice che è scoperta e basta
export const MIN_STAFF = 0.5;
export const DEFAULT_DAYS = 28; // 4 settimane intere: ogni giorno della settimana pesa uguale
export const KINDS = [
  { key: "chat", label: "Chat 1:1" },
  { key: "mass", label: "Massivi" },
  { key: "tip", label: "Mance" },
  { key: "post", label: "Post" },
  { key: "subs", label: "Abbonamenti" },
  { key: "other", label: "Altro" },
];
export const BANDS = [
  { key: "notte", label: "notte", from: 0, to: 6 },
  { key: "mattina", label: "mattina", from: 6, to: 12 },
  { key: "pomeriggio", label: "pomeriggio", from: 12, to: 18 },
  { key: "sera", label: "sera", from: 18, to: 24 },
];
// DAYOFWEEK di BigQuery: 1 = domenica … 7 = sabato. Ordine di lettura: da lunedì.
export const WEEK = [
  { dow: 2, label: "Lunedì" }, { dow: 3, label: "Martedì" }, { dow: 4, label: "Mercoledì" }, { dow: 5, label: "Giovedì" },
  { dow: 6, label: "Venerdì" }, { dow: 7, label: "Sabato" }, { dow: 1, label: "Domenica" },
];
const WEEKDAY_NAME = { 1: "domenica", 2: "lunedì", 3: "martedì", 4: "mercoledì", 5: "giovedì", 6: "venerdì", 7: "sabato" };

const num = (v) => (v == null || !Number.isFinite(Number(v)) ? 0 : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;
const zeros = () => Array.from({ length: 24 }, () => 0);
const parse = (s) => Date.parse(`${s}T00:00:00Z`);

export const daysBetween = (from, to) => Math.max(0, Math.round((parse(to) - parse(from)) / DAY) + 1);
/** Quante volte cade ogni giorno della settimana (chiave DAYOFWEEK 1-7) tra from e to compresi. */
export function weekdayCounts(from, to) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  for (let t = parse(from); t <= parse(to); t += DAY) out[new Date(t).getUTCDay() + 1]++;
  return out;
}
export const dowOf = (s) => new Date(parse(s)).getUTCDay() + 1;
/** Variazione relativa; null se la base è zero o manca. */
export const delta = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);

/** "22–2": dalle 22:00 alle 02:00 (fine esclusa). */
export const windowLabel = (from, len) => `${from}–${(from + len) % 24}`;

/** Finestra di `len` ore consecutive (circolare) con la somma più alta (`max`) o più bassa. */
export function bestWindow(values, len = 4, { min = false } = {}) {
  const v = values.map(num);
  const total = v.reduce((a, b) => a + b, 0);
  let best = null;
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += v[(s + i) % 24];
    if (best == null || (min ? sum < best.sum : sum > best.sum)) best = { from: s, len, sum };
  }
  return { ...best, sum: r2(best.sum), share: total > 0 ? best.sum / total : null, label: windowLabel(best.from, len) };
}

const sumRange = (arr, from, to) => arr.slice(from, to).reduce((a, b) => a + num(b), 0);
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const fmtUsd = (v) => `$${Math.round(num(v)).toLocaleString("it-IT", { useGrouping: "always" })}`;
const fmtPct = (v) => `${Math.round(Math.abs(v) * 100)}%`;
const fmtX = (v) => v.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Data e ora in Italia adesso. */
export function romeNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
export const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const len = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** Periodo valido: fino a ieri (oggi è a metà e sporcherebbe le medie), al massimo MAX_DAYS giorni. */
export function normalizePeriod(q = {}, now = new Date()) {
  const { day: today } = romeNow(now);
  const max = addDays(today, -1);
  let to = DAY_RE.test(q.to || "") && q.to <= max ? q.to : max;
  let from = DAY_RE.test(q.from || "") ? q.from : addDays(to, -(DEFAULT_DAYS - 1));
  if (from > to) [from, to] = [to, from];
  if (len(from, to) > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
  const n = len(from, to);
  return { cur: { from, to }, prev: { from: addDays(from, -n), to: addDays(from, -1) } };
}

/**
 * Costruisce tutto ciò che la pagina mostra.
 * input: { tx, act, today } righe delle query; meta: { cur, prev, chatTo, names: {id: alias}, personOf,
 *   todayDay: 'YYYY-MM-DD' (Roma), nowHour: 0-23 (Roma) }
 */
export function buildAndamento({ tx = [], act = [], today = [] }, meta) {
  const { cur, prev, names = {}, personOf = (s) => s } = meta;
  const days = daysBetween(cur.from, cur.to);
  const prevDays = daysBetween(prev.from, prev.to);
  const chatEnd = meta.chatTo && meta.chatTo < cur.to ? meta.chatTo : cur.to;
  const chatDays = chatEnd >= cur.from ? daysBetween(cur.from, chatEnd) : 0;
  const wd = weekdayCounts(cur.from, cur.to);

  // ── incasso per ora e per voce ───────────────────────────────────────────────
  const net = { cur: zeros(), prev: zeros() };
  const txs = { cur: zeros(), prev: zeros() };
  const payers = { cur: zeros(), prev: zeros() };
  const kinds = Object.fromEntries(KINDS.map((k) => [k.key, zeros()]));
  const week = Object.fromEntries(WEEK.map((w) => [w.dow, zeros()]));
  const byCreator = new Map();
  const tot = { cur: { net: 0, tx: 0, payers: 0 }, prev: { net: 0, tx: 0, payers: 0 } };
  for (const r of tx) {
    const per = r.per === "prev" ? "prev" : "cur";
    const h = num(r.h);
    if (r.k === "h") {
      net[per][h] += num(r.net);
      txs[per][h] += num(r.tx);
      if (per === "cur") (kinds[r.kind] || kinds.other)[h] += num(r.net);
    } else if (r.k === "hp") payers[per][h] = num(r.payers);
    else if (r.k === "dh" && week[num(r.dow)]) week[num(r.dow)][h] += num(r.net);
    else if (r.k === "ch") {
      const id = Number(r.creator_id);
      if (!byCreator.has(id)) byCreator.set(id, zeros());
      byCreator.get(id)[h] += num(r.net);
    } else if (r.k === "tot") tot[per] = { net: num(r.net), tx: num(r.tx), payers: num(r.payers) };
  }

  // ── attività: messaggi, nuovi abbonati, operatori in turno ───────────────────
  const msg = { fan_msgs: zeros(), fan_writers: zeros(), page_msgs: zeros(), ppv_sent: zeros() };
  const subs = { cur: zeros(), prev: zeros() };
  const staff = { cur: zeros(), prev: zeros() };
  const staffWeek = Object.fromEntries(WEEK.map((w) => [w.dow, zeros()]));
  for (const r of act) {
    const per = r.per === "prev" ? "prev" : "cur";
    const h = num(r.h);
    if (r.k === "msg") for (const k of Object.keys(msg)) msg[k][h] += num(r[k]);
    else if (r.k === "subs") subs[per][h] += num(r.new_subs);
    else if (r.k === "staff") {
      staff[per][h] += num(r.staff_hours);
      if (per === "cur" && staffWeek[num(r.dow)]) staffWeek[num(r.dow)][h] += num(r.staff_hours);
    }
  }
  const hasStaff = staff.cur.some((v) => v > 0);
  const hasChat = chatDays > 0 && msg.fan_msgs.some((v) => v > 0);

  const perDay = (arr, n) => arr.map((v) => (n > 0 ? v / n : 0));
  const netDay = perDay(net.cur, days);
  const netPrevDay = perDay(net.prev, prevDays);
  const dayTotal = netDay.reduce((a, b) => a + b, 0);
  const dayTotalPrev = netPrevDay.reduce((a, b) => a + b, 0);

  const hours = Array.from({ length: 24 }, (_, h) => {
    const staffDay = days ? staff.cur[h] / days : 0;
    const fanMsgsDay = chatDays ? msg.fan_msgs[h] / chatDays : null;
    return {
      h,
      net: r2(netDay[h]),
      net_prev: r2(netPrevDay[h]),
      delta: delta(netDay[h], netPrevDay[h]),
      share: dayTotal > 0 ? netDay[h] / dayTotal : null,
      tx: days ? r2(txs.cur[h] / days) : 0,
      payers: days ? r2(payers.cur[h] / days) : 0, // fan distinti che pagano in quell'ora, media al giorno
      ticket: txs.cur[h] ? r2(net.cur[h] / txs.cur[h]) : null,
      kinds: Object.fromEntries(KINDS.map((k) => [k.key, r2(days ? kinds[k.key][h] / days : 0)])),
      new_subs: days ? r2(subs.cur[h] / days) : 0,
      new_subs_prev: prevDays ? r2(subs.prev[h] / prevDays) : 0,
      fan_msgs: hasChat ? r2(fanMsgsDay) : null,
      fan_writers: hasChat ? r2(msg.fan_writers[h] / chatDays) : null,
      page_msgs: hasChat ? r2(msg.page_msgs[h] / chatDays) : null,
      ppv_sent: hasChat ? r2(msg.ppv_sent[h] / chatDays) : null,
      staff: hasStaff ? r2(staffDay) : null,
      staff_prev: hasStaff && prevDays ? r2(staff.prev[h] / prevDays) : null,
      net_per_staff: hasStaff && staffDay >= MIN_STAFF ? r2(netDay[h] / staffDay) : null,
      fan_msgs_per_staff: hasStaff && hasChat && staffDay >= MIN_STAFF ? r2(fanMsgsDay / staffDay) : null,
      uncovered: hasStaff && staffDay < MIN_STAFF,
    };
  });

  const bands = BANDS.map((b) => {
    const c = sumRange(netDay, b.from, b.to);
    const p = sumRange(netPrevDay, b.from, b.to);
    return { ...b, net: r2(c), net_prev: r2(p), share: dayTotal > 0 ? c / dayTotal : null, delta: delta(c, p) };
  });

  const weekRows = WEEK.map((w) => {
    const n = wd[w.dow] || 0;
    const hrs = week[w.dow].map((v) => (n ? r2(v / n) : null));
    const st = staffWeek[w.dow].map((v) => (n && hasStaff ? r2(v / n) : null));
    return { dow: w.dow, label: w.label, occurrences: n, net: hrs, staff: st, total: n ? r2(week[w.dow].reduce((a, b) => a + b, 0) / n) : null };
  });

  // ── creator-persona (IT + EN della stessa persona insieme) ───────────────────
  const persons = new Map();
  for (const [id, arr] of byCreator) {
    const alias = names[id] || `Creator ${id}`;
    const p = personOf(alias);
    if (!persons.has(p)) persons.set(p, { person: p, ids: [], hours: zeros() });
    const x = persons.get(p);
    x.ids.push(id);
    arr.forEach((v, h) => { x.hours[h] += v; });
  }
  const creators = [...persons.values()]
    .map((x) => {
      const hrs = x.hours.map((v) => r2(days ? v / days : 0));
      const t = hrs.reduce((a, b) => a + b, 0);
      const w = bestWindow(hrs, 4);
      return {
        person: x.person, ids: x.ids.sort((a, b) => a - b), net: r2(t), hours: hrs,
        best: t > 0 ? { label: w.label, from: w.from, share: w.share } : null,
        peak_hour: t > 0 ? hrs.indexOf(Math.max(...hrs)) : null,
        shares: Object.fromEntries(BANDS.map((b) => [b.key, t > 0 ? sumRange(hrs, b.from, b.to) / t : null])),
      };
    })
    .filter((c) => c.net > 0)
    .sort((a, b) => b.net - a.net);

  // ── oggi contro lo stesso giorno della settimana delle 4 settimane prima ─────
  const todayBlock = buildToday(today, meta);

  const gold = bestWindow(netDay, 4);
  const weak = bestWindow(netDay, 4, { min: true });
  const out = {
    range: { cur, prev, days, prevDays, chatTo: hasChat ? chatEnd : null, chatDays },
    totals: {
      net_day: r2(dayTotal), net_prev_day: r2(dayTotalPrev), delta: delta(dayTotal, dayTotalPrev),
      net: r2(tot.cur.net), net_prev: r2(tot.prev.net), tx: tot.cur.tx, payers: tot.cur.payers,
      new_subs_day: r2(hours.reduce((a, h) => a + h.new_subs, 0)),
      staff_hours_day: hasStaff ? r2(hours.reduce((a, h) => a + h.staff, 0)) : null,
    },
    gold: dayTotal > 0 ? { label: gold.label, from: gold.from, share: gold.share, net: gold.sum } : null,
    weak: dayTotal > 0 ? { label: weak.label, from: weak.from, share: weak.share, net: weak.sum } : null,
    hours, bands, week: weekRows, creators, today: todayBlock,
    kinds: KINDS.filter((k) => hours.some((h) => h.kinds[k.key] !== 0)).map((k) => ({ ...k, net: r2(hours.reduce((a, h) => a + h.kinds[k.key], 0)) })),
    has: { staff: hasStaff, chat: hasChat },
  };
  out.reading = reading(out);
  return out;
}

// il flusso dal vivo arriva in 1-2 minuti: oltre 15 minuti senza transazioni nell'organizzazione è fermo
export const STALE_MIN = 15;

export function buildToday(rows, { todayDay, nowHour, now } = {}) {
  if (!todayDay || nowHour == null) return null;
  const byAgo = new Map();
  let lastAt = null;
  for (const r of rows || []) {
    const a = num(r.ago);
    if (a < 0) { lastAt = r.last_at || null; continue; }
    if (!byAgo.has(a)) byAgo.set(a, zeros());
    byAgo.get(a)[num(r.h)] += num(r.net);
  }
  // settimane di riferimento con dati (una settimana senza incasso non è un giorno tipico: manca il dato)
  const refs = [7, 14, 21, 28].filter((a) => byAgo.has(a) && byAgo.get(a).some((v) => v > 0));
  const td = byAgo.get(0) || zeros();
  const typical = zeros().map((_, h) => (refs.length ? refs.reduce((s, a) => s + byAgo.get(a)[h], 0) / refs.length : null));
  // ore concluse: 0..nowHour-1 (nowHour è in corso). Se il flusso è fermo, l'ora dell'ultima transazione e le
  // successive non sono complete: si confronta solo fino all'ultima ora arrivata per intero.
  const staleMin = lastAt && now ? Math.max(0, Math.round((now.getTime() - Date.parse(lastAt)) / 60000)) : null;
  const stale = staleMin != null && staleMin > STALE_MIN;
  let done = Math.max(0, Math.min(24, nowHour));
  if (stale) {
    const l = romeNow(new Date(lastAt));
    done = l.day < todayDay ? 0 : Math.min(done, l.hour);
  }
  const cumToday = sumRange(td, 0, done);
  const cumTypical = refs.length ? sumRange(typical, 0, done) : null;
  return {
    day: todayDay, weekday: WEEKDAY_NAME[dowOf(todayDay)], now_hour: nowHour, weeks: refs.length,
    hours: Array.from({ length: 24 }, (_, h) => ({ h, today: h <= nowHour ? r2(td[h]) : null, typical: typical[h] == null ? null : r2(typical[h]), partial: h === nowHour })),
    done_hours: done,
    last_at: lastAt, stale, stale_minutes: staleMin,
    cum_today: r2(cumToday), cum_typical: cumTypical == null ? null : r2(cumTypical),
    delta: cumTypical ? delta(cumToday, cumTypical) : null,
    in_progress: r2(td[nowHour] || 0),
    typical_day: refs.length ? r2(typical.reduce((a, b) => a + b, 0)) : null,
  };
}

/**
 * Le ore di fila (anche a cavallo della mezzanotte) con meno di MIN_STAFF operatori in media ma con fan che
 * scrivono o comprano; tra più tratti, quello con più domanda. null se non ce ne sono.
 */
export function uncoveredRun(hours) {
  const bad = (h) => h.uncovered && ((h.fan_msgs || 0) > 0 || (h.net || 0) > 0);
  if (!hours?.length || hours.every(bad) || !hours.some(bad)) return null;
  const start = hours.findIndex((h) => !bad(h)); // si parte da un'ora coperta: i tratti non si spezzano a mezzanotte
  const runs = [];
  let cur = null;
  for (let i = 1; i <= 24; i++) {
    const h = hours[(start + i) % 24];
    if (bad(h)) {
      if (!cur) cur = { from: h.h, len: 0, fan_msgs: 0, net: 0, staff: 0 };
      cur.len++; cur.fan_msgs += h.fan_msgs || 0; cur.net += h.net || 0; cur.staff += h.staff || 0;
    } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.sort((a, b) => (b.fan_msgs - a.fan_msgs) || (b.net - a.net))[0] || null;
}

/** Lettura in parole: frasi fisse che citano il numero, nessuna senza dato sotto. */
export function reading(d) {
  const out = [];
  if (!d.gold || !(d.totals.net_day > 0)) return out;
  out.push(`Le ore d'oro sono le ${d.gold.label}: in 4 ore entra il ${fmtPct(d.gold.share)} dell'incasso del giorno (${fmtUsd(d.gold.net)} su ${fmtUsd(d.totals.net_day)} al giorno). Le più deboli sono le ${d.weak.label}, con il ${fmtPct(d.weak.share)}.`);

  // si sposta = almeno ±10% E almeno $100 al giorno (su una pagina piccola il 10% è rumore)
  const pct = d.bands.filter((b) => b.delta != null && Math.abs(b.delta) >= 0.1);
  const moved = pct.filter((b) => Math.abs(b.net - b.net_prev) >= 100);
  const prevLabel = `${d.range.prevDays} giorni prima`;
  if (moved.length) {
    const parts = moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((b) => `la ${b.label} ${b.delta > 0 ? "cresce" : "cala"} del ${fmtPct(b.delta)} (${fmtUsd(b.net_prev)} → ${fmtUsd(b.net)} al giorno)`);
    out.push(`Rispetto ai ${prevLabel}: ${parts.join(", ")}.`);
  } else if (d.totals.net_prev_day > 0 && !pct.length) {
    out.push(`Rispetto ai ${prevLabel} la forma della giornata non cambia: nessuna fascia si sposta di più del 10%.`);
  }

  const gap = uncoveredRun(d.hours);
  if (gap) {
    const what = d.has.chat ? `i fan mandano ${Math.round(gap.fan_msgs).toLocaleString("it-IT")} messaggi e entrano ${fmtUsd(gap.net)} al giorno` : `entrano ${fmtUsd(gap.net)} al giorno`;
    out.push(`${gap.len === 1 ? `Alle ${gap.from}` : `Dalle ${gap.from} alle ${(gap.from + gap.len) % 24}`} le pagine sono quasi scoperte (${gap.staff / gap.len < 0.1 ? "quasi mai qualcuno in turno" : `in media ${fmtX(gap.staff / gap.len)} operatori in turno`}) mentre ${what}.`);
  }
  if (d.has.staff && d.has.chat) {
    const ratios = d.hours.map((h) => h.fan_msgs_per_staff).filter((v) => v != null);
    const med = median(ratios);
    const top = d.hours.filter((h) => h.fan_msgs_per_staff != null).sort((a, b) => b.fan_msgs_per_staff - a.fan_msgs_per_staff)[0];
    if (med > 0 && top && top.fan_msgs_per_staff / med >= 1.25) {
      out.push(`Alle ${top.h} ogni operatore in turno riceve ${fmtX(top.fan_msgs_per_staff / med)} volte i messaggi dei fan di un'ora tipica (${Math.round(top.fan_msgs_per_staff)} contro ${Math.round(med)}): lì il presidio è più sottile rispetto alla domanda.`);
    } else if (med > 0) {
      out.push(`Il presidio segue la domanda: in ogni ora un operatore in turno riceve tra ${Math.round(Math.min(...ratios))} e ${Math.round(Math.max(...ratios))} messaggi dei fan.`);
    }
  }

  const t = d.today;
  if (t?.stale) {
    const l = romeNow(new Date(t.last_at));
    out.push(`Attenzione: le transazioni dal vivo sono ferme da ${t.stale_minutes} minuti (ultima registrata alle ${String(l.hour).padStart(2, "0")}:${new Date(t.last_at).toISOString().slice(14, 16)}). Il confronto di oggi si ferma all'ultima ora arrivata per intero.`);
  }
  if (t && t.done_hours > 0 && t.cum_typical > 0 && t.delta != null) {
    const verb = Math.abs(t.delta) < 0.05 ? "in linea con" : t.delta > 0 ? `sopra del ${fmtPct(t.delta)}` : `sotto del ${fmtPct(t.delta)}`;
    out.push(`Oggi fino alle ${t.done_hours}:00 sono entrati ${fmtUsd(t.cum_today)}: ${verb} ${verb === "in linea con" ? "un" : "rispetto a un"} ${t.weekday} tipico (${fmtUsd(t.cum_typical)} alla stessa ora).`);
  }
  return out;
}
