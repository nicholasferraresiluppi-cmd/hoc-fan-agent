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
