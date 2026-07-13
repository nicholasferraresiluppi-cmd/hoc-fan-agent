/**
 * GET /api/admin/tl-override-sim?period_id=YYYY-MM
 *
 * Simulazione costo "override Team Lead" (proposta §10.3 docs/CAREER_LADDER.md):
 * il CM in supervisione prende il 2-3% dell'ECCEDENZA del venduto del turno
 * sopra la soglia top (P77) della banda×classe — le stesse soglie suggerite
 * da /api/admin/threshold-study (stessa pipeline di calcolo, stessi filtri).
 *
 * Output:
 *  1. per banda×classe: soglia top, turni sopra soglia, eccedenza totale
 *  2. costo override a 2% e 3% del mese, con scenari di copertura
 *     supervisione 40/60/100% (non sappiamo quali turni hanno un CM presente)
 *  3. incidenza del costo sul venduto totale attribuito del mese
 *  4. CM detection: membri con earnings da ORE (candidati chatter manager
 *     — il fisso €28/turno passerebbe da lì) + profili con hourly_rate,
 *     per capire se i turni di supervisione sono ricostruibili da CP
 *
 * Sola lettura KV. Come threshold-study: solo turni MONO-creator entrano nel
 * calcolo soglie/eccedenze (segnale pulito); i turni split sono conteggiati
 * a parte e riportati come quota esclusa — nessun taglio silenzioso.
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";

export const maxDuration = 30;

const BANDS = [
  { key: "30k",  label: "30K",  min: 15000,  max: 40000 },
  { key: "50k",  label: "50K",  min: 40000,  max: 62500 },
  { key: "75k",  label: "75K",  min: 62500,  max: 87500 },
  { key: "100k", label: "100K", min: 87500,  max: 112500 },
  { key: "125k", label: "125K", min: 112500, max: 137500 },
  { key: "150k", label: "150K+", min: 137500, max: Infinity },
];
const PCTS = [0.02, 0.03];
const COVERAGE_SCENARIOS = [0.4, 0.6, 1.0];

function percentile(sortedVals, p) {
  if (sortedVals.length === 0) return null;
  const idx = Math.min(sortedVals.length - 1, Math.max(0, Math.ceil((p / 100) * sortedVals.length) - 1));
  return sortedVals[idx];
}
const round25 = (v) => (v == null ? null : Math.round(v / 25) * 25);

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

  // ---- Pass 1: venduto mensile per alias + turni mono con classe (= threshold-study) ----
  const aliasSales = new Map();
  const monoShifts = []; // { alias, cls, total }
  let splitShifts = 0, splitVolume = 0, totalAttributedAll = 0;

  // ---- CM detection: earnings da ore + profili orari ----
  const hourlyMembers = new Map(); // member_name → aggregato
  const hourlyProfiles = new Map(); // profile name → count turni

  for (const w of wages) {
    if ((Number(w.total_earnings_from_hours) || 0) > 0) {
      hourlyMembers.set(w.member_name || w.member_username || String(w.member_id), {
        member: w.member_name || w.member_username || String(w.member_id),
        earnings_from_hours: Math.round(Number(w.total_earnings_from_hours) || 0),
        earnings_from_takes: Math.round(Number(w.total_earnings_from_takes) || 0),
        worked_shifts: Number(w.total_worked_shifts) || 0,
        worked_hours: Math.round(Number(w.total_worked_hours) || 0),
      });
    }
    for (const s of w.shifts || []) {
      const aliases = s.creator_aliases || [];
      const takes = s.takes || [];
      const salesTotal = Number(s.total_attributed) || 0;
      totalAttributedAll += salesTotal;
      const isMono = aliases.length <= 1;

      if (s.payment_profile?.hourly_rate) {
        const pname = s.payment_profile.name || "(senza nome)";
        hourlyProfiles.set(pname, (hourlyProfiles.get(pname) || 0) + 1);
      }

      for (const t of takes) {
        if (!t.creator_alias) continue;
        aliasSales.set(t.creator_alias, (aliasSales.get(t.creator_alias) || 0) + (Number(t.amount) || 0));
      }
      if (takes.length === 0 && isMono && aliases[0]) {
        aliasSales.set(aliases[0], (aliasSales.get(aliases[0]) || 0) + salesTotal);
      }

      if (!isMono || !aliases[0]) {
        if (!isMono) { splitShifts += 1; splitVolume += salesTotal; }
        continue;
      }
      const pp = s.payment_profile;
      const cls = pp?.cosellers_count ?? (pp?.name ? (parseInt(pp.name, 10) || 1) : 1);
      monoShifts.push({ alias: aliases[0], cls: Math.min(Math.max(cls, 1), 4), total: salesTotal });
    }
  }

  // ---- Pass 2: banda per alias, soglie top P77 per banda×classe ----
  const assignBand = (sales) => {
    if (sales < 15000) return null; // micro: fuori studio, come threshold-study
    for (const b of BANDS) if (sales >= b.min && sales < b.max) return b.key;
    return "150k";
  };
  const aliasBand = new Map();
  for (const [alias, sales] of aliasSales.entries()) {
    const band = assignBand(sales);
    if (band) aliasBand.set(alias, band);
  }

  const distributions = new Map(); // `${band}|${cls}` → [totals]
  for (const sh of monoShifts) {
    const band = aliasBand.get(sh.alias);
    if (!band || sh.total <= 0) continue;
    const key = `${band}|${sh.cls}`;
    if (!distributions.has(key)) distributions.set(key, []);
    distributions.get(key).push(sh.total);
  }
  const topThreshold = new Map(); // key → soglia top (P77 round25)
  for (const [key, vals] of distributions.entries()) {
    const sorted = [...vals].sort((a, b) => a - b);
    topThreshold.set(key, round25(percentile(sorted, 77)));
  }

  // ---- Pass 3: eccedenze sopra soglia top ----
  const segments = new Map(); // key → { shifts, above, excess, volume }
  let excessTotal = 0, volumeInStudy = 0, shiftsInStudy = 0, shiftsAbove = 0;
  for (const sh of monoShifts) {
    const band = aliasBand.get(sh.alias);
    if (!band || sh.total <= 0) continue;
    const key = `${band}|${sh.cls}`;
    const top = topThreshold.get(key);
    if (top == null) continue;
    shiftsInStudy += 1;
    volumeInStudy += sh.total;
    const seg = segments.get(key) || { shifts: 0, above: 0, excess: 0, volume: 0 };
    seg.shifts += 1;
    seg.volume += sh.total;
    if (sh.total > top) {
      const ex = sh.total - top;
      seg.above += 1;
      seg.excess += ex;
      excessTotal += ex;
      shiftsAbove += 1;
    }
    segments.set(key, seg);
  }

  const bandLabel = (key) => BANDS.find((b) => b.key === key)?.label || key;
  const segmentsOut = [...segments.entries()]
    .map(([key, seg]) => {
      const [band, cls] = key.split("|");
      return {
        band: bandLabel(band),
        cls: Number(cls),
        top_threshold: topThreshold.get(key),
        shifts: seg.shifts,
        shifts_above: seg.above,
        share_above_pct: Math.round((seg.above / seg.shifts) * 100),
        volume: Math.round(seg.volume),
        excess: Math.round(seg.excess),
      };
    })
    .sort((a, b) => (a.band === b.band ? a.cls - b.cls : a.band.localeCompare(b.band)));

  // ---- Costi ----
  const costs = PCTS.map((pct) => ({
    override_pct: pct * 100,
    coverage_scenarios: COVERAGE_SCENARIOS.map((cov) => ({
      supervised_share_pct: cov * 100,
      monthly_cost_usd: Math.round(excessTotal * pct * cov),
      cost_vs_attributed_sales_pct: totalAttributedAll > 0
        ? Math.round((excessTotal * pct * cov / totalAttributedAll) * 10000) / 100
        : null,
    })),
  }));

  return Response.json({
    period_id: periodId,
    note: "Override = % dell'eccedenza del venduto/turno sopra soglia top (P77 banda×classe). Soglie ricalcolate con la stessa pipeline di threshold-study. Solo turni mono-creator.",
    data_quality: {
      mono_shifts_in_study: shiftsInStudy,
      shifts_above_threshold: shiftsAbove,
      share_above_pct: shiftsInStudy > 0 ? Math.round((shiftsAbove / shiftsInStudy) * 100) : null,
      split_shifts_excluded: splitShifts,
      split_volume_excluded: Math.round(splitVolume),
      split_volume_share_pct: totalAttributedAll > 0 ? Math.round((splitVolume / totalAttributedAll) * 100) : null,
      caveat: "Turni split esclusi dal calcolo eccedenze (come da threshold-study): il costo reale a parità di regola sarebbe proporzionalmente più alto. Copertura supervisione ignota → scenari 40/60/100%.",
    },
    totals: {
      attributed_sales_all_shifts: Math.round(totalAttributedAll),
      volume_in_study: Math.round(volumeInStudy),
      excess_above_top_total: Math.round(excessTotal),
      excess_share_of_study_volume_pct: volumeInStudy > 0 ? Math.round((excessTotal / volumeInStudy) * 100) : null,
    },
    costs,
    segments: segmentsOut,
    cm_detection: {
      note: "Membri con earnings da ORE in CP (candidati chatter manager: il fisso per turno passerebbe da qui) + profili di pagamento con hourly_rate. Se vuoto, i turni di supervisione CM NON sono in CP e serve tracciamento dedicato (fase 2).",
      hourly_members: [...hourlyMembers.values()].sort((a, b) => b.earnings_from_hours - a.earnings_from_hours),
      hourly_profiles: [...hourlyProfiles.entries()].map(([name, count]) => ({ profile: name, shifts: count })).sort((a, b) => b.shifts - a.shifts),
    },
  });
}
