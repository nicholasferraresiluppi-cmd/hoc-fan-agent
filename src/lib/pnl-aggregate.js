// Aggregazione del venduto e del costo operatori per alias creator, dalle wage CP del mese.
// Unica definizione, usata dal P&L live e dalla città (prima viveva dentro la route P&L).
// takes esatti per alias; turno mono-creator senza takes → tutto il venduto a quell'alias;
// costo operatori = compenso del turno × quota del venduto di quell'alias.
export function aggregateWagesByAlias(wages) {
  const byAlias = new Map();
  for (const w of wages || []) {
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const earnings = Number(s.total_earnings) || 0;
      const isMono = aliases.length <= 1;
      const salesByAlias = new Map();
      for (const t of takes) {
        if (!t.creator_alias) continue;
        salesByAlias.set(t.creator_alias, (salesByAlias.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
      }
      if (salesByAlias.size === 0 && isMono && aliases[0]) salesByAlias.set(aliases[0], salesTotal);
      for (const [alias, aliasSales] of salesByAlias.entries()) {
        if (!byAlias.has(alias)) byAlias.set(alias, { sales: 0, cost: 0, shifts: 0 });
        const agg = byAlias.get(alias);
        const share = salesTotal > 0 ? aliasSales / salesTotal : (isMono ? 1 : 0);
        agg.sales += aliasSales;
        agg.cost += earnings * share;
        agg.shifts += 1;
      }
    }
  }
  return byAlias;
}
