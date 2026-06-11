/**
 * GET /api/admin/profiles-compare?period_id=YYYY-MM
 *
 * Confronto cross-creator degli scaglioni e del costo operatori:
 * per ogni creator alias del mese (da KV, percorso provato):
 *  - scaglioni (set più comune sui turni MONO del creator — segnale pulito)
 *  - venduto totale, pagato operatori attribuito, % costo
 *  - turni, operatori distinti, mismatch % attesa vs reale
 *
 * Risponde alla domanda board: "perché creator X paga il 15% sopra $700 e
 * creator Y il 12% sopra $1.100? C'è una logica o è storia?"
 *
 * Solo lettura KV. I mesi non ri-sincronizzati post-Fase B mostrano
 * thresholds vuoti (la UI lo segnala).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 30;

function bracketPct(total, thresholds) {
  const valid = (thresholds || []).filter((t) => t.percentage != null);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  let winning = sorted[0];
  for (const t of sorted) if ((t.threshold ?? 0) <= total) winning = t;
  return winning.percentage;
}

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  const wages = (await kv.get(`cp:wages:${periodId}`)) || [];
  if (!Array.isArray(wages) || wages.length === 0) {
    return Response.json({
      error: `Nessuna wage in KV per ${periodId}. Sincronizza il mese da /admin/creatorspro-sync-history.`,
    }, { status: 404 });
  }

  // Aggregazione per creator alias
  const byAlias = new Map();
  const get = (alias) => {
    if (!byAlias.has(alias)) {
      byAlias.set(alias, {
        alias,
        sales: 0, earn_attr: 0, shifts: 0, mono_shifts: 0,
        operators: new Set(), thresholdSets: new Map(), profileNames: new Set(),
        mismatches: 0, checked: 0,
        // dataset compatto per il simulatore multi-creator client-side:
        // coppie [venduto_totale_turno, venduto_su_questo_creator]
        shift_pairs: [],
      });
    }
    return byAlias.get(alias);
  };

  for (const w of wages) {
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const earnings = Number(s.total_earnings) || 0;
      const isMono = aliases.length <= 1;

      // sales per alias dai takes (attribuzione esatta)
      const salesByAlias = new Map();
      for (const t of takes) {
        if (!t.creator_alias) continue;
        salesByAlias.set(t.creator_alias, (salesByAlias.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
      }
      // fallback mono senza takes
      if (salesByAlias.size === 0 && isMono && aliases[0]) {
        salesByAlias.set(aliases[0], salesTotal);
      }
      // alias toccati senza takes (registrati a 0 per contare il turno)
      for (const a of aliases) if (!salesByAlias.has(a)) salesByAlias.set(a, 0);

      const ths = Array.isArray(s.thresholds) ? s.thresholds.filter((t) => t.percentage != null) : [];
      const effPct = salesTotal > 0 ? earnings / salesTotal : null;
      const expPct = ths.length > 0 ? bracketPct(salesTotal, ths) : null;
      const isMismatch = effPct != null && expPct != null && Math.abs(effPct - expPct) > 0.005;

      for (const [alias, aliasSales] of salesByAlias.entries()) {
        const agg = get(alias);
        const share = salesTotal > 0 ? aliasSales / salesTotal : (isMono ? 1 : 0);
        agg.sales += aliasSales;
        agg.earn_attr += earnings * share;
        agg.shifts += 1;
        if (aliasSales > 0) agg.shift_pairs.push([Math.round(salesTotal), Math.round(aliasSales)]);
        if (isMono) agg.mono_shifts += 1;
        if (w.member_name) agg.operators.add(w.member_name);
        if (s.payment_profile?.name) agg.profileNames.add(s.payment_profile.name);
        // thresholds: solo dai turni MONO (segnale pulito, il profilo è del creator giusto)
        if (isMono && ths.length > 0) {
          const key = JSON.stringify([...ths].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0)));
          agg.thresholdSets.set(key, (agg.thresholdSets.get(key) || 0) + 1);
        }
        if (isMono && effPct != null && expPct != null) {
          agg.checked += 1;
          if (isMismatch) agg.mismatches += 1;
        }
      }
    }
  }

  const creators = [...byAlias.values()]
    .filter((a) => a.sales > 0 || a.shifts >= 3)
    .map((a) => {
      const topThs = [...a.thresholdSets.entries()].sort((x, y) => y[1] - x[1])[0];
      return {
        alias: a.alias,
        sales: Math.round(a.sales),
        earn_attr: Math.round(a.earn_attr),
        cost_pct: a.sales > 0 ? Math.round((a.earn_attr / a.sales) * 1000) / 1000 : null,
        shifts: a.shifts,
        mono_shifts: a.mono_shifts,
        operators_count: a.operators.size,
        thresholds: topThs ? JSON.parse(topThs[0]) : [],
        profiles_seen: [...a.profileNames].sort().slice(0, 8),
        mismatches: a.mismatches,
        checked: a.checked,
        shift_pairs: a.shift_pairs,
      };
    })
    .sort((x, y) => y.sales - x.sales);

  return Response.json({
    period_id: periodId,
    creators_count: creators.length,
    phase_b_coverage: creators.filter((c) => c.thresholds.length > 0).length,
    totals: {
      sales: creators.reduce((s, c) => s + c.sales, 0),
      earn_attr: creators.reduce((s, c) => s + c.earn_attr, 0),
    },
    creators,
  });
}
