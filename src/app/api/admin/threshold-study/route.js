/**
 * GET /api/admin/threshold-study?period_id=YYYY-MM
 *
 * Studio di calibrazione SOGLIE per il modello a bande (decisione board:
 * solo scaglioni, le percentuali NON si toccano).
 *
 * Per ogni banda di fatturato creator (30/50/75/100/125/150k):
 *  - creator assegnati (media venduto del mese — finestra 2-3 mesi quando
 *    più mesi saranno re-syncati post-Fase B)
 *  - per classe cosellers (1×/2×/3×): distribuzione del venduto/turno
 *    (la base su cui CP applica il bracket: il totale del wage-shift
 *    dell'operatore) → P25/P50/P75/P80
 *  - soglie suggerite: mid = P50, top = P77 (≈ 20-25% dei turni sopra,
 *    target deciso col board), arrotondate a $25
 *
 * Solo turni MONO-creator (segnale pulito). Solo lettura KV.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 30;

// Bande per fatturato mensile creator (assegnazione per range ai punti medi)
const BANDS = [
  { key: "30k",  label: "30K",  min: 15000,  max: 40000 },
  { key: "50k",  label: "50K",  min: 40000,  max: 62500 },
  { key: "75k",  label: "75K",  min: 62500,  max: 87500 },
  { key: "100k", label: "100K", min: 87500,  max: 112500 },
  { key: "125k", label: "125K", min: 112500, max: 137500 },
  { key: "150k", label: "150K+", min: 137500, max: Infinity },
];

function percentile(sortedVals, p) {
  if (sortedVals.length === 0) return null;
  const idx = Math.min(sortedVals.length - 1, Math.max(0, Math.ceil((p / 100) * sortedVals.length) - 1));
  return sortedVals[idx];
}
const round25 = (v) => v == null ? null : Math.round(v / 25) * 25;

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
    return Response.json({ error: `Nessuna wage in KV per ${periodId}.` }, { status: 404 });
  }

  // 1. Venduto mensile per alias + raccolta turni mono con classe
  const aliasSales = new Map();       // alias → venduto mese
  const aliasShifts = new Map();      // alias → [{cls, total}] turni mono
  let shiftsWithProfile = 0, shiftsTotal = 0;

  for (const w of wages) {
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      const isMono = aliases.length <= 1;

      for (const t of takes) {
        if (!t.creator_alias) continue;
        aliasSales.set(t.creator_alias, (aliasSales.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
      }
      if (takes.length === 0 && isMono && aliases[0]) {
        aliasSales.set(aliases[0], (aliasSales.get(aliases[0]) || 0) + salesTotal);
      }

      if (!isMono || !aliases[0]) continue;
      shiftsTotal += 1;
      const pp = s.payment_profile;
      if (pp?.name || pp?.cosellers_count != null) shiftsWithProfile += 1;
      // classe: cosellersCount del profilo, fallback prefisso numerico del nome, fallback 1
      const cls = pp?.cosellers_count ?? (pp?.name ? (parseInt(pp.name, 10) || 1) : 1);
      const a = aliases[0];
      if (!aliasShifts.has(a)) aliasShifts.set(a, []);
      aliasShifts.get(a).push({ cls: Math.min(Math.max(cls, 1), 4), total: salesTotal });
    }
  }

  // 2. Assegnazione bande
  const assignBand = (sales) => {
    if (sales < 15000) return "micro";
    for (const b of BANDS) if (sales >= b.min && sales < b.max) return b.key;
    return "150k";
  };
  const bandCreators = new Map(); // bandKey → [{alias, sales}]
  const micro = [];
  for (const [alias, sales] of aliasSales.entries()) {
    if (sales <= 0) continue;
    const band = assignBand(sales);
    if (band === "micro") { micro.push({ alias, sales: Math.round(sales) }); continue; }
    if (!bandCreators.has(band)) bandCreators.set(band, []);
    bandCreators.get(band).push({ alias, sales: Math.round(sales) });
  }

  // 3. Per banda × classe: distribuzione e soglie suggerite
  const bands = BANDS.map((b) => {
    const creators = (bandCreators.get(b.key) || []).sort((x, y) => y.sales - x.sales);
    const byClass = {};
    for (const c of creators) {
      for (const sh of aliasShifts.get(c.alias) || []) {
        if (sh.total <= 0) continue;
        (byClass[sh.cls] = byClass[sh.cls] || []).push(sh.total);
      }
    }
    const classes = Object.entries(byClass)
      .map(([cls, vals]) => {
        const sorted = [...vals].sort((x, y) => x - y);
        const p50 = percentile(sorted, 50);
        const p77 = percentile(sorted, 77);
        // Istogramma per la UI: niente percentili a schermo, si FA VEDERE la
        // distribuzione (bucket fino al P95, larghezza arrotondata a $25)
        const cap = percentile(sorted, 95) || sorted[sorted.length - 1] || 0;
        const nb = 12;
        const bw = Math.max(25, Math.ceil(cap / nb / 25) * 25);
        const histogram = Array.from({ length: nb }, (_, i) => ({ from: i * bw, to: (i + 1) * bw, count: 0 }));
        for (const v of sorted) {
          const idx = Math.min(nb - 1, Math.floor(v / bw));
          histogram[idx].count += 1;
        }
        return {
          cls: Number(cls),
          shifts: sorted.length,
          p25: Math.round(percentile(sorted, 25)),
          p50: Math.round(p50),
          p75: Math.round(percentile(sorted, 75)),
          p80: Math.round(percentile(sorted, 80)),
          histogram,
          bucket_width: bw,
          // Soglie suggerite (SOLO soglie — le % restano quelle del creator)
          suggested_mid: round25(p50),
          suggested_top: round25(p77),
          // quota turni che starebbe sopra la soglia top suggerita (sanity ~20-25%)
          top_share: sorted.length > 0 ? Math.round((sorted.filter((v) => v >= round25(p77)).length / sorted.length) * 100) : null,
          mid_share: sorted.length > 0 ? Math.round((sorted.filter((v) => v >= round25(p50)).length / sorted.length) * 100) : null,
        };
      })
      .sort((x, y) => x.cls - y.cls);
    return {
      band: b.label,
      range: `$${(b.min / 1000).toFixed(0)}k – ${b.max === Infinity ? "∞" : "$" + (b.max / 1000).toFixed(1) + "k"}`,
      creators,
      classes,
    };
  }).filter((b) => b.creators.length > 0);

  // 4. Validazione empirica del rapporto coppia/solo (regola ~60-65%)
  const ratios = [];
  for (const b of bands) {
    const c1 = b.classes.find((c) => c.cls === 1);
    const c2 = b.classes.find((c) => c.cls === 2);
    const c3 = b.classes.find((c) => c.cls === 3);
    if (c1?.p75 && c2?.p75 && c1.shifts >= 10 && c2.shifts >= 10) ratios.push({ band: b.band, pair: "2x/1x", ratio: Math.round((c2.p75 / c1.p75) * 100) });
    if (c1?.p75 && c3?.p75 && c1.shifts >= 10 && c3.shifts >= 10) ratios.push({ band: b.band, pair: "3x/1x", ratio: Math.round((c3.p75 / c1.p75) * 100) });
  }

  return Response.json({
    period_id: periodId,
    target_note: "Soglia top = P77 della distribuzione → ~20-25% dei turni sopra (target board). Solo SOGLIE: le percentuali restano quelle correnti di ogni creator.",
    data_quality: {
      mono_shifts_total: shiftsTotal,
      mono_shifts_with_profile: shiftsWithProfile,
      months_in_study: 1,
      caveat: "Studio su 1 solo mese post-Fase B. Per la regola (finestra 2-3 mesi) ri-sincronizzare anche i mesi precedenti prima di fissare le soglie definitive.",
    },
    bands,
    class_ratios: ratios,
    micro_creators: micro.sort((x, y) => y.sales - x.sales),
  });
}
