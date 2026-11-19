// Dentro un'ora (20/11/2026) — funzioni pure: dalle righe di insideHourSql alla vista e alla lettura in parole.
//
// Domanda d'origine (Nicholas, 19/11, guardando Alessandra Sparagno il 18/11): il picco di $544 tra le 19 e le 20
// è un fan grosso o una massa che ha funzionato? La risposta sta in tre numeri: quanto pesa il fan più grande,
// da che voce viene l'incasso (chat 1:1, massivi, mance…), e se i fan sono clienti vecchi o nuovi. Caso vero da
// cui è nata: un solo fan, 5 PPV in chat a prezzo crescente in mezz'ora ($16 → $30 → $80 → $135 → $200) = 68%.

import { KINDS, daysBetween } from "./andamento-orario-core.js";

export const BIG_FAN = 0.5; // sopra questa quota l'ora «è» di un fan solo
export const FEW_FANS = 0.6; // sopra questa quota i primi 3 fan fanno l'ora
export const NEW_SUB_DAYS = 7; // iscritto da al massimo 7 giorni = fan nuovo

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const usd = (v) => `$${Math.round(Number(v) || 0).toLocaleString("it-IT", { useGrouping: "always" })}`;
const price = (v) => {
  const n = Number(v) || 0;
  return `$${Number.isInteger(n) ? n.toLocaleString("it-IT", { useGrouping: "always" }) : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
// numeri che si leggono con la vocale davanti (uno, otto, undici, ottanta…, ottocento…): «l'81%», «degli 8»
export const vowelNumber = (n) => {
  const x = String(Math.round(Math.abs(Number(n) || 0)));
  return x === "1" || x === "11" || x.startsWith("8") || /^11\d{3}$/.test(x);
};
const ilPct = (v) => { const n = Math.round((Number(v) || 0) * 100); return `${vowelNumber(n) ? "l'" : "il "}${n}%`; };
const deiN = (n) => `${vowelNumber(n) ? "degli" : "dei"} ${n}`;
const hh = (h) => String(h).padStart(2, "0");
const parseRows = (rows) => (rows || []).map((r) => {
  try { return { k: r.k, ...JSON.parse(r.j) }; } catch { return null; }
}).filter(Boolean);

/** Acquisti a prezzo che non scende mai, almeno 3: la scala di prezzi della vendita in chat. */
export function isRising(prices) {
  if (!prices || prices.length < 3) return false;
  for (let i = 1; i < prices.length; i++) if (prices[i] < prices[i - 1]) return false;
  return prices[prices.length - 1] > prices[0];
}

/** Da quanti giorni è iscritto (o compra) rispetto al primo giorno del periodo. */
export function daysBefore(day, from) {
  if (!day) return null;
  return daysBetween(day, from) - 1;
}

/**
 * rows: righe di insideHourSql · meta: { h, from, to, names: {creator_id: nome pagina}, personOf }
 */
export function buildInsideHour(rows, { h, from, to, names = {}, personOf = (s) => s } = {}) {
  const all = parseRows(rows);
  const days = daysBetween(from, to);
  const tot = all.find((r) => r.k === "tot") || { net: 0, tx: 0, fans: 0, days: 0 };
  const net = r2(tot.net);
  const pages = new Set(all.filter((r) => r.k === "fan").map((r) => r.creator_id));

  const kinds = KINDS.map((k) => {
    const r = all.find((x) => x.k === "kind" && x.kind === k.key);
    return r ? { key: k.key, label: k.label, net: r2(r.net), tx: r.tx, fans: r.fans, share: net > 0 ? r.net / net : 0 } : null;
  }).filter(Boolean).sort((a, b) => b.net - a.net);

  const fans = all.filter((r) => r.k === "fan").map((r) => {
    const buys = (r.buys || []).map((b) => ({ ts: b.ts, price: r2(b.price), net: r2(b.net), kind: b.kind }));
    // la scala si legge dentro la stessa ora dello stesso giorno: su più giorni non si mescolano gli acquisti
    const byDay = new Map();
    for (const b of buys) { const k = b.ts.slice(0, 10); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(b); }
    const ladderDay = [...byDay.values()].filter((g) => isRising(g.map((b) => b.price))).sort((a, b) => b.length - a.length)[0] || null;
    const subDays = daysBefore(r.sub_from, from);
    const firstInPeriod = r.first_buy != null && r.first_buy >= from;
    return {
      key: `${r.creator_id}|${r.user_id}`,
      handle: r.handle || null,
      page: personOf(names[r.creator_id] || String(r.creator_id)),
      tx: r.tx, net: r2(r.net), share: net > 0 ? r.net / net : 0, days: r.days,
      buys, rising: Boolean(ladderDay), ladder: ladderDay ? ladderDay.map((b) => b.price) : null,
      sub_from: r.sub_from || null, sub_days: subDays,
      first_buy: r.first_buy || null, first_in_period: firstInPeriod,
      before_net: r2(r.before_net),
      new_sub: subDays != null && subDays <= NEW_SUB_DAYS,
    };
  }).sort((a, b) => b.net - a.net);

  const top1 = fans[0]?.share || 0;
  const top3 = fans.slice(0, 3).reduce((a, f) => a + f.share, 0);
  const firstTimers = fans.filter((f) => f.first_in_period);
  const out = {
    h, from, to, days, active_days: tot.days || 0,
    totals: { net, tx: tot.tx || 0, fans: tot.fans || 0, net_day: days ? r2(net / days) : 0, tx_day: days ? r2((tot.tx || 0) / days) : 0 },
    kinds, fans, top1_share: top1, top3_share: top3,
    multi_page: pages.size > 1,
    first_timers: firstTimers.length,
    new_subs: fans.filter((f) => f.new_sub).length,
  };
  out.reading = readInsideHour(out);
  return out;
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const dayLabel = (s) => (s ? `${Number(s.slice(8, 10))} ${MESI[Number(s.slice(5, 7)) - 1]}` : "—");
const fanName = (f) => (f.handle ? f.handle : "un fan");
const ladder = (f) => (f.ladder || f.buys.map((b) => b.price)).map(price).join(" → ");

/** La lettura in parole: prima il totale, poi chi lo fa, poi da che voce, poi se sono clienti vecchi o nuovi. */
export function readInsideHour(d) {
  const out = [];
  const one = d.days === 1;
  const span = `tra le ${hh(d.h)} e le ${hh((d.h + 1) % 24)}`;
  if (!(d.totals.net > 0)) {
    out.push(one ? `${span[0].toUpperCase()}${span.slice(1)} non è entrato niente.` : `Nelle ore ${hh(d.h)} di questi ${d.days} giorni non è entrato niente.`);
    return out;
  }
  out.push(one
    ? `${span[0].toUpperCase()}${span.slice(1)} sono entrati ${usd(d.totals.net)} da ${d.totals.tx} ${d.totals.tx === 1 ? "acquisto" : "acquisti"} di ${d.totals.fans} ${d.totals.fans === 1 ? "fan" : "fan diversi"}.`
    : `Nelle ore ${hh(d.h)} di questi ${d.days} giorni sono entrati ${usd(d.totals.net)} (${usd(d.totals.net_day)} al giorno) da ${d.totals.tx} acquisti di ${d.totals.fans} fan diversi; ${d.active_days} giorni su ${d.days} con almeno un acquisto.`);

  const f = d.fans[0];
  if (f && d.top1_share >= BIG_FAN) {
    const how = f.rising ? (one ? `${f.tx} acquisti a prezzo crescente (${ladder(f)})` : `${f.tx} acquisti, tra cui una scala di prezzi nella stessa ora (${ladder(f)})`) : `${f.tx} ${f.tx === 1 ? "acquisto" : "acquisti"}${f.buys.length > 1 && f.buys.length <= 8 ? ` (${ladder(f)})` : ""}`;
    const past = f.first_in_period ? (one ? "è il suo primo acquisto in assoluto su questa pagina" : "il suo primo acquisto in assoluto su questa pagina è di questo periodo") : f.first_buy ? `compra dal ${dayLabel(f.first_buy)} e prima ${one ? "di quel giorno" : "del periodo"} aveva speso ${usd(f.before_net)} in tutto` : null;
    out.push(`È l'ora di un fan solo: ${fanName(f)} vale ${ilPct(d.top1_share)} (${usd(f.net)}) con ${how}${!one && f.days > 1 ? `, in ${f.days} giorni diversi` : ""}${past ? `; ${past}` : ""}.`);
  } else if (d.fans.length >= 3 && d.top3_share >= FEW_FANS) {
    out.push(`La fanno pochi fan: i primi 3 valgono ${ilPct(d.top3_share)}; il più grande, ${fanName(f)}, ${ilPct(d.top1_share)}.`);
  } else if (f) {
    out.push(`È distribuita: il fan più grande (${fanName(f)}) vale ${ilPct(d.top1_share)}${d.fans.length >= 3 ? `, i primi 3 ${ilPct(d.top3_share)}` : ""}.`);
  }
  const rising = d.fans.filter((x) => x.rising);
  if (rising.length && !(f && d.top1_share >= BIG_FAN && f.rising && rising.length === 1)) {
    out.push(`${rising.length} ${rising.length === 1 ? "fan ha" : "fan hanno"} comprato almeno 3 volte a prezzo crescente nella stessa ora${one ? "" : " dello stesso giorno"}: la scala dei prezzi in chat.`);
  }

  const k = d.kinds[0];
  if (k) {
    const mass = d.kinds.find((x) => x.key === "mass");
    if (k.key === "mass" && k.share >= 0.5) out.push(`Viene soprattutto dai massivi (${pct(k.share)}, ${k.tx} acquisti di ${k.fans} fan): è un invio di massa che ha funzionato.`);
    else if (k.share >= 0.8) out.push(`Viene quasi tutta da ${k.label.toLowerCase()} (${pct(k.share)}).`);
    else out.push(`Da dove viene: ${d.kinds.slice(0, 3).map((x) => `${x.label.toLowerCase()} ${pct(x.share)}`).join(", ")}.`);
    // la quota dei massivi si dice a parte solo se la riga «Da dove viene» non l'ha già detta
    if (mass && k.key !== "mass" && mass.share >= 0.15 && k.share >= 0.8) out.push(`I massivi pesano ${ilPct(mass.share)} (${mass.tx} acquisti).`);
  }

  if (d.fans.length) {
    const old = d.fans.filter((x) => x.sub_days != null && x.sub_days > 30).length;
    const bits = [];
    if (d.first_timers) bits.push(one ? `${d.first_timers} ${d.first_timers === 1 ? "compra" : "comprano"} per la prima volta` : `${d.first_timers} ${d.first_timers === 1 ? "ha fatto" : "hanno fatto"} il primo acquisto di sempre in questo periodo`);
    if (d.new_subs) bits.push(`${d.new_subs} ${d.new_subs === 1 ? "è iscritto" : "sono iscritti"} da meno di ${NEW_SUB_DAYS + 1} giorni`);
    if (old) bits.push(`${old} ${old === 1 ? "è cliente" : "sono clienti"} da più di un mese`);
    if (bits.length) out.push(`${deiN(d.fans.length)[0].toUpperCase()}${deiN(d.fans.length).slice(1)} fan più grandi: ${bits.join(", ")}.`);
  }
  return out;
}

/** L'ora con più incasso (per scegliere da dove partire). */
export function peakHour(hours) {
  let best = null;
  for (const x of hours || []) if (x && Number(x.net) > 0 && (best == null || Number(x.net) > Number(best.net))) best = x;
  return best ? best.h : null;
}

