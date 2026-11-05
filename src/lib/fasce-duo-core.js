/**
 * Fasce e turni → «Due operatori»: quando serve il secondo operatore in turno (26/10/2026).
 * Logica pura, nessun I/O. Testata in tests/fasce-duo.mjs.
 *
 * DOMANDA (Nicholas, 26/10): "come valuto se c'è bisogno del doppio operatore in turno
 * sui profili? utenza attiva, traffico…". Risposta: confrontare le ore della STESSA
 * pagina, nella STESSA fascia, con lo STESSO traffico, fatte da uno solo e da due.
 *
 * MISURATO PRIMA DI COSTRUIRE (12 settimane, 27/07-23/10, 30k ore di turno HOC):
 *   - in due la pagina incassa in media +$20/h (+24%) rispetto a uno solo, a parità di
 *     pagina × fascia × traffico; tenendo fisso anche il giorno della settimana +23%;
 *   - il guadagno in percentuale è simile a ogni livello di traffico (+19-34%), in dollari
 *     cresce col traffico (+$10/h sotto 5 fan nuovi all'ora, +$35/h sopra 25);
 *   - per pagina cambia molto: Gaja +$99/h, Elisa Esposito +$65/h, Alice Cappella e
 *     Stormy negativi, Venere Battisti e Mikyymouse ≈ 0 → la risposta è pagina per pagina.
 *   - gli operatori sono pagati SOLO a percentuale (~13% del venduto attribuito, paga
 *     oraria ≈ 0 nelle buste CP): il secondo operatore non ha un costo fisso, ma chi lavora
 *     in due guadagna meno all'ora (la torta cresce del ~24% e si divide in due).
 *
 * SCELTE:
 *   - Fonte: tutto dal warehouse. Turni = `onlyfans.cache_members` (soli chatter HOC);
 *     un'ora conta per una persona se ci ha lavorato almeno 45 minuti. Incasso = netto
 *     message+tip della pagina nell'ora. Traffico = fan che INIZIANO a scrivere nell'ora
 *     (messaggio del fan dopo ≥60 minuti di silenzio della conversazione): è la domanda
 *     che arriva da fuori. I "fan che scrivono" in totale no: dipendono anche da quanto
 *     scrivono gli operatori, cioè proprio da quanti sono.
 *   - Confronto dentro celle pagina × fascia × traffico; ogni cella pesa 1/(1/n_solo +
 *     1/n_due) (le celle sbilanciate contano poco). Errore standard dalle varianze di
 *     cella → il verdetto si dà solo se il dato regge (±2 errori standard).
 *
 * LIMITI (scritti in pagina): correlazione, non esperimento — in due si mettono a volte
 * persone diverse o nelle giornate attese migliori (il traffico e il giorno della
 * settimana sono tenuti fissi, il resto no). Non entra in score né compensi.
 */

import { SLOTS, SLOT_IDS, slotOfHour } from "./fasce-core.js";

export const FASCE_DUO_VERSION = "duo-1";
export const WINDOW_WEEKS = 12;

export const LOAD_BANDS = [
  { id: "0-4", label: "0–4", max: 4 },
  { id: "5-9", label: "5–9", max: 9 },
  { id: "10-14", label: "10–14", max: 14 },
  { id: "15-24", label: "15–24", max: 24 },
  { id: "25+", label: "25 e più", max: Infinity },
];

export const MIN_CELL = 8; // ore minime di ciascun tipo (solo / due) in una cella per confrontarla
export const MIN_SIDE_H = 40; // ore confrontabili di ciascun tipo per dare un verdetto
export const GAIN_ABS = 15; // $/h: sotto questo il secondo operatore "aggiunge poco"
export const GAIN_REL = 0.15; // …o sotto il 15% dell'incasso di uno solo
export const HIGH_LOAD = 20; // fan nuovi all'ora: traffico alto
export const RARE_DUO = 0.15; // quota di ore in due sotto cui "quasi mai in due"
export const USUAL_DUO = 0.3; // quota di ore in due sopra cui "spesso in due"

export function bandOf(starts) {
  const s = Number(starts) || 0;
  return LOAD_BANDS.find((b) => s <= b.max).id;
}

/**
 * Righe orarie del warehouse → celle compatte (quelle che si salvano in KV).
 * Riga: { cid, rh (ora di Roma 0-23), staff, starts, net }.
 * Cella: { cid, slot, band, s:[n, Σnet, Σnet², Σstarts], d:[…] } (s = uno solo, d = due o più).
 */
export function toCells(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const staff = Number(r.staff) || 0;
    if (staff < 1 || r.cid == null) continue;
    const cid = String(r.cid);
    const slot = slotOfHour(Number(r.rh));
    const band = bandOf(r.starts);
    const k = `${cid}|${slot}|${band}`;
    const c = m.get(k) || { cid, slot, band, s: [0, 0, 0, 0], d: [0, 0, 0, 0] };
    const side = staff >= 2 ? c.d : c.s;
    const net = Number(r.net) || 0;
    side[0] += 1;
    side[1] += net;
    side[2] += net * net;
    side[3] += Number(r.starts) || 0;
    m.set(k, c);
  }
  return [...m.values()].map((c) => ({ ...c, s: c.s.map(round2), d: c.d.map(round2) }));
}

const round2 = (x) => Math.round(x * 100) / 100;
const variance = ([n, s, ss]) => (n > 1 ? Math.max(0, (ss - (s * s) / n) / (n - 1)) : 0);

/**
 * Confronto pesato su un insieme di celle. null se nessuna cella ha abbastanza ore di
 * entrambi i tipi. Restituisce incasso/ora di uno solo, guadagno del secondo ($/h),
 * errore standard, ore confrontate e traffico medio.
 */
export function matched(cells, { minCell = MIN_CELL } = {}) {
  let W = 0, wDiff = 0, wSolo = 0, wStarts = 0, var_ = 0, ns = 0, nd = 0;
  for (const c of cells) {
    const [a, sa] = c.s;
    const [b, sb] = c.d;
    if (a < minCell || b < minCell) continue;
    const w = 1 / (1 / a + 1 / b);
    const solo = sa / a;
    const duo = sb / b;
    W += w;
    wDiff += w * (duo - solo);
    wSolo += w * solo;
    wStarts += w * ((c.s[3] + c.d[3]) / (a + b));
    var_ += w * w * (variance(c.s) / a + variance(c.d) / b);
    ns += a;
    nd += b;
  }
  if (!W) return null;
  const solo = wSolo / W;
  const gain = wDiff / W;
  return {
    solo_sph: Math.round(solo),
    gain: Math.round(gain),
    gain_pct: solo > 0 ? Math.round((gain / solo) * 100) / 100 : null,
    se: Math.round(Math.sqrt(var_) / W),
    starts_h: Math.round((wStarts / W) * 10) / 10,
    solo_h: ns,
    duo_h: nd,
  };
}

/** Ore totali (anche non confrontabili), quota in due e traffico medio di un insieme di celle. */
export function coverage(cells) {
  let s = 0, d = 0, st = 0;
  for (const c of cells) { s += c.s[0]; d += c.d[0]; st += c.s[3] + c.d[3]; }
  const h = s + d;
  return { h, duo_share: h ? Math.round((d / h) * 100) / 100 : null, starts_h: h ? Math.round((st / h) * 10) / 10 : null };
}

/**
 * Verdetto per una pagina × fascia.
 *   conviene      il secondo aggiunge, e il dato regge (guadagno − 2 errori > 0, sopra soglia)
 *   non_aggiunge  anche nel caso migliore (guadagno + 2 errori) aggiunge poco, e il margine
 *                 d'errore non è più largo della soglia
 *   da_provare    traffico alto ma quasi mai in due: non si può misurare, vale una prova
 *   incerto       c'è un confronto ma non abbastanza netto
 *   pochi_dati    troppe poche ore confrontabili
 */
export function verdictOf(m, cov) {
  const enough = m && m.solo_h >= MIN_SIDE_H && m.duo_h >= MIN_SIDE_H;
  if (!enough) {
    if (cov && cov.h >= MIN_SIDE_H && (cov.duo_share ?? 0) < RARE_DUO && (cov.starts_h ?? 0) >= HIGH_LOAD) return "da_provare";
    return "pochi_dati";
  }
  const bar = Math.max(GAIN_ABS, GAIN_REL * m.solo_sph);
  if (m.gain - 2 * m.se > 0 && m.gain >= bar) return "conviene";
  // «aggiunge poco» solo se il dato è anche preciso: con un margine più largo della
  // soglia (es. −$25 ± $60 su Fishball 22–3) è un «non si capisce», non un via libera
  if (m.gain + 2 * m.se < bar && 2 * m.se <= bar) return "non_aggiunge";
  return "incerto";
}

/**
 * Cosa fare su una fascia, dato il verdetto e quanto è già coperta in due.
 *   aggiungi    conviene ma oggi è in due meno di metà delle ore
 *   tieni       conviene ed è già spesso in due
 *   libera      il secondo non aggiunge ma oggi c'è spesso → ore da usare altrove
 *   prova       da_provare
 *   null        niente da fare
 */
export function actionOf(verdict, duoShare) {
  const sh = duoShare ?? 0;
  if (verdict === "conviene") return sh < 0.5 ? "aggiungi" : "tieni";
  if (verdict === "non_aggiunge") return sh >= USUAL_DUO ? "libera" : null;
  if (verdict === "da_provare") return "prova";
  return null;
}

/**
 * Documento per la pagina. `cells` = celle salvate; `only` = Set di cid (split) o null;
 * `names` = cid → nome; `commission` = quota del venduto pagata agli operatori.
 */
export function buildDuo(cells, { only = null, names = {}, commission = null } = {}) {
  const list = (cells || []).filter((c) => !only || only.has(String(c.cid)));
  const overall = matched(list);
  const byBand = LOAD_BANDS.map((b) => ({ id: b.id, label: b.label, ...coverage(list.filter((c) => c.band === b.id)), m: matched(list.filter((c) => c.band === b.id)) }));
  const bySlot = SLOTS.map((s) => ({ id: s.id, label: s.label, ...coverage(list.filter((c) => c.slot === s.id)), m: matched(list.filter((c) => c.slot === s.id)) }));

  const byPage = new Map();
  for (const c of list) {
    const l = byPage.get(c.cid) || [];
    l.push(c);
    byPage.set(c.cid, l);
  }
  const pages = [];
  for (const [cid, pc] of byPage) {
    const slots = {};
    for (const id of SLOT_IDS) {
      const sc = pc.filter((c) => c.slot === id);
      if (!sc.length) continue;
      const cov = coverage(sc);
      const m = matched(sc);
      const verdict = verdictOf(m, cov);
      slots[id] = { ...cov, m, verdict, action: actionOf(verdict, cov.duo_share) };
    }
    const cov = coverage(pc);
    const m = matched(pc);
    pages.push({ cid, name: names[cid] || cid, ...cov, m, verdict: verdictOf(m, cov), slots });
  }
  // prima le pagine con qualcosa da fare, poi per ore
  const weight = (p) => Object.values(p.slots).filter((s) => s.action && s.action !== "tieni").length;
  pages.sort((a, b) => weight(b) - weight(a) || b.h - a.h);

  // quanto guadagna un operatore all'ora, da solo e in due (stima: pagato a percentuale)
  const pay = commission > 0 && overall
    ? { solo: Math.round(overall.solo_sph * commission * 10) / 10, duo: Math.round(((overall.solo_sph + overall.gain) / 2) * commission * 10) / 10 }
    : null;
  return { overall, coverage: coverage(list), byBand, bySlot, pages, pay, commission };
}
