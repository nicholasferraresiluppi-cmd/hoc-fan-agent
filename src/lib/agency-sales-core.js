/**
 * Il venduto UFFICIALE dell'agenzia (03/10/2026, proposta 2 della prova d'uso).
 *
 * Prima l'hub mostrava il venduto dei soli operatori in classifica (score > 0), il P&L quello di tutti i
 * turni, la pagina Creator un terzo totale: tre numeri per "quanto abbiamo venduto", e il Board non si
 * fidava di nessuno. Ufficiale = tutti i turni CreatorsPro del mese (la stessa somma del P&L Live:
 * quote per creator dei takes, o il totale del turno se mono-creator — vedi pnl-aggregate.js).
 *
 * E il confronto onesto a inizio mese (proposta 3): non "2 giorni contro settembre intero" (−37% falso),
 * ma lo STESSO NUMERO DI GIORNI del mese prima, contando i turni per data di inizio (ora di Roma).
 *
 * Logica pura: niente KV, testabile (tests/agency-sales.test.mjs).
 */

const ROME = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" del giorno di Roma di un istante ISO (o null). */
export function romeDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ROME.format(d);
}

/** Venduto di un turno per creator: Map alias → $ (stessa regola del P&L). */
export function shiftSalesByAlias(s) {
  const aliases = s?.creator_aliases || [];
  const out = new Map();
  for (const t of s?.takes || []) {
    if (!t?.creator_alias) continue;
    out.set(t.creator_alias, (out.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
  }
  if (out.size === 0 && aliases.length <= 1 && aliases[0]) out.set(aliases[0], Number(s?.total_attributed) || 0);
  return out;
}

/**
 * Totali del mese da `wages` (cp:wages:{period}).
 * @param {object} o
 * @param {number|null} o.untilDay  conta solo i turni iniziati nei giorni 1..untilDay del mese (null = tutto)
 * @param {(alias:string)=>boolean} o.allow  filtro creator (perimetro di chi guarda); default tutte
 * @returns {{ sales, shifts, operators, creators, lastDay }}  lastDay = ultimo giorno (1-31) con venduto > 0
 */
export function agencySales(wages, { periodId, untilDay = null, allow = () => true } = {}) {
  let sales = 0, shifts = 0, lastDay = 0;
  const ops = new Set(), creators = new Set();
  for (const w of wages || []) {
    for (const s of w?.shifts || []) {
      const day = romeDay(s.started_at);
      // turni fuori dal mese (bordi di fuso) restano nel mese in cui CP li ha messi, ma senza giorno non si tagliano
      const dnum = day && (!periodId || day.startsWith(periodId)) ? Number(day.slice(8, 10)) : null;
      if (untilDay != null && dnum != null && dnum > untilDay) continue;
      let shiftSales = 0;
      for (const [alias, v] of shiftSalesByAlias(s)) {
        if (!allow(alias)) continue;
        shiftSales += v;
        if (v > 0) creators.add(alias);
      }
      if (shiftSales <= 0) continue;
      sales += shiftSales;
      shifts += 1;
      ops.add(w.member_id ?? w.member_name ?? w.id);
      if (dnum != null && dnum > lastDay) lastDay = dnum;
    }
  }
  return { sales: Math.round(sales), shifts, operators: ops.size, creators: creators.size, lastDay };
}

/**
 * Fino a che giorno confrontare: l'ultimo giorno CHIUSO (ieri, ora di Roma) se il mese è quello in corso,
 * altrimenti il mese intero (null). Mai oltre l'ultimo giorno con dati: se il sync è indietro, il confronto
 * si ferma dove si fermano i dati (e non sembra un crollo).
 */
export function compareUntilDay(periodId, todayRome, lastDayWithData) {
  if (!todayRome || !todayRome.startsWith(periodId)) return null; // mese passato: intero
  const yesterday = Number(todayRome.slice(8, 10)) - 1;
  if (yesterday < 1) return 0; // il primo del mese non c'è ancora un giorno chiuso
  return Math.max(0, Math.min(yesterday, lastDayWithData || 0));
}

/** Alert aperti che rendono incompleto il venduto CP di questi mesi (prefisso fingerprint → mese o globale). */
const DATA_ALERTS = ["wage-gap", "cp-sync-stale", "cp-promotion-blocked", "cp-month-shrink", "cp-day-holes", "cron-chain-broken"];
export function dataWarnings(alerts, periodIds = []) {
  return (alerts || []).filter((a) => {
    if (!a || a.status === "resolved") return false;
    const fp = String(a.fingerprint || "");
    const base = fp.split(":")[0];
    if (!DATA_ALERTS.includes(base)) return false;
    const m = fp.split(":")[1];
    return !m || !/^\d{4}-\d{2}$/.test(m) || periodIds.includes(m);
  }).map((a) => ({ fingerprint: a.fingerprint, title: a.title, severity: a.severity, href: a.cta?.href || "/admin/alerts" }));
}

/** Δ% arrotondato a 1 decimale, null se il confronto non ha senso. */
export const pctDelta = (cur, prev) => (prev > 0 && cur != null ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
