/**
 * Controlli di sanità sui dati CP — logica PURA (testabile).
 *
 * Nati dal caso Alessandra Sparagno (25/09/2026): un mese mostrato a metà è
 * arrivato fino a Nicholas, che l'ha notato a occhio. Regola: un numero
 * sospetto lo deve trovare il sistema, non la persona. Questi controlli
 * NON decidono se il dato è sbagliato (una creator può davvero fermarsi):
 * lo segnalano con il confronto, perché qualcuno guardi prima di usarlo.
 */

/** turni per creator in un array di wage CP normalizzate */
export function shiftsByCreator(wages) {
  const out = {};
  // turni programmati e non ancora iniziati esclusi (gonfiavano il mese in corso)
  const now = Date.now();
  for (const w of wages || []) for (const s of w.shifts || []) {
    const t = Date.parse(s?.started_at);
    if (Number.isFinite(t) && t > now) continue;
    for (const a of new Set(s.creator_aliases || [])) out[a] = (out[a] || 0) + 1;
  }
  return out;
}

/**
 * Creator con attività crollata rispetto al mese prima.
 * Mese corrente: il mese prima viene riproporzionato ai giorni trascorsi.
 * @returns [{ creator, current, expected, previous, ratio }]
 */
export function creatorDrops({ current, previous, dayOfMonth, daysInMonth, isCurrentMonth, minExpected = 20, maxRatio = 0.3 }) {
  const factor = isCurrentMonth ? Math.max(0, Math.min(1, dayOfMonth / daysInMonth)) : 1;
  const out = [];
  for (const [creator, prev] of Object.entries(previous || {})) {
    const expected = prev * factor;
    if (expected < minExpected) continue;
    const cur = current?.[creator] || 0;
    const ratio = cur / expected;
    if (ratio < maxRatio) out.push({ creator, current: cur, expected: Math.round(expected), previous: prev, ratio: Math.round(ratio * 100) / 100 });
  }
  return out.sort((a, b) => a.ratio - b.ratio);
}

/** Il mese ha molte meno wage (≈ operatori pagati) del precedente? */
export function monthShrink({ currentCount, previousCount, minRatio = 0.7 }) {
  if (!previousCount || previousCount < 50) return null;
  const ratio = currentCount / previousCount;
  return ratio < minRatio ? { currentCount, previousCount, ratio: Math.round(ratio * 100) / 100 } : null;
}

/**
 * Venduto CP di persone NON collegate a un operatore (cp:member_mapping).
 * Queste persone spariscono da Sales CP, Creator, Action/Coaching Center:
 * a set 2026 erano 168 persone e $126k (7% del mese) — trovato per caso
 * confrontando i totali di tre pagine. Pura: wages + mapping → sintesi.
 */
export function unmappedSales(wages, mapping) {
  const map = mapping || {};
  let total = 0, unmapped = 0;
  const byMember = new Map();
  for (const w of wages || []) {
    const s = Number(w.total_attributed_from_takes) || 0;
    total += s;
    if (map[w.member_id]) continue;
    unmapped += s;
    const cur = byMember.get(w.member_id) || { member_id: w.member_id, name: w.member_name || String(w.member_id), sales: 0, shifts: 0 };
    cur.sales += s;
    cur.shifts += Number(w.total_worked_shifts) || 0;
    byMember.set(w.member_id, cur);
  }
  const people = [...byMember.values()].filter((p) => p.sales > 0).sort((a, b) => b.sales - a.sales);
  return { total, unmapped, share: total > 0 ? unmapped / total : 0, people };
}

/**
 * Giorni "bucati" di un mese CP: venduto giornaliero < 30% della mediana del mese.
 * Caso reale (set 2026): luglio aveva 20-26/07 quasi a zero e 5 giorni mancanti —
 * il controllo sul NUMERO di wage non lo vedeva (le wage c'erano, i turni no).
 * `lastFullDay` (YYYY-MM-DD) esclude oggi/ieri del mese in corso, che arrivano in ritardo.
 */
export function dayHoles(wages, periodId, { lastFullDay = null, minRatio = 0.3 } = {}) {
  const days = {};
  for (const w of wages || []) for (const s of w.shifts || []) {
    const d = String(s?.started_at || "").slice(0, 10);
    if (d.slice(0, 7) !== periodId) continue;
    if (lastFullDay && d > lastFullDay) continue;
    days[d] = (days[d] || 0) + (Number(s.total_attributed) || 0);
  }
  const [y, m] = periodId.split("-").map(Number);
  const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const all = [];
  for (let i = 1; i <= nDays; i++) {
    const d = `${periodId}-${String(i).padStart(2, "0")}`;
    if (lastFullDay && d > lastFullDay) break;
    all.push([d, days[d] || 0]);
  }
  const vals = all.map(([, v]) => v).filter((v) => v > 0).sort((a, b) => a - b);
  if (vals.length < 7) return [];
  const med = vals[Math.floor(vals.length / 2)];
  return all.filter(([, v]) => v < med * minRatio).map(([d, v]) => ({ day: d, sales: Math.round(v), median: Math.round(med) }));
}
