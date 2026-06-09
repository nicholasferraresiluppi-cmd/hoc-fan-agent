/**
 * GET /api/admin/op-shifts?creator=NOME&operator=NOME&period_id=YYYY-MM
 *
 * Per una coppia (operatore × creator) in un periodo, ritorna la LISTA DETTAGLIATA
 * dei singoli shift che la compongono. Strumento di verifica manuale: l'utente
 * apre CP Timeline su quella creator nel periodo e confronta shift-per-shift se
 * sales/orari/profile applicato tornano con i nostri dati.
 *
 * Output per shift:
 *   - started_at, ended_at, interval (Morning/Afternoon/Evening/Night/After)
 *   - sales_on_creator: sales attribuiti a quella creator (somma takes con quell'alias)
 *   - earnings_on_creator: quota di shift.total_earnings proporzionale al sales
 *   - pct = earnings_on_creator / sales_on_creator
 *   - multi_creator: true se il shift ha più creator
 *   - exact_attribution: true se i takes sono esatti (non split 50/50)
 *   - all_creators_in_shift: alias di tutti i creator del shift
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { distributeShift } from "@/lib/creator-aggregates";
import { indexWagesByInflowwName } from "@/lib/creatorspro-data";

export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const creatorAlias = (url.searchParams.get("creator") || "").trim();
  const operatorName = (url.searchParams.get("operator") || "").trim();
  const periodId = url.searchParams.get("period_id") || "";

  if (!creatorAlias || !operatorName || !periodId) {
    return Response.json({ error: "creator + operator + period_id richiesti" }, { status: 400 });
  }

  try {
    const opIdx = await indexWagesByInflowwName(periodId);
    if (!opIdx[operatorName]) {
      return Response.json({
        error: `Operatore "${operatorName}" non trovato nei wage del periodo ${periodId}`,
        available_count: Object.keys(opIdx).length,
        suggestions: Object.keys(opIdx).filter((n) => n.toLowerCase().includes(operatorName.toLowerCase().split(" ")[0] || "")).slice(0, 10),
      }, { status: 404 });
    }

    const agg = opIdx[operatorName];
    const targetLow = creatorAlias.toLowerCase();
    const shiftDetails = [];

    for (const shift of agg.shifts || []) {
      const distribs = distributeShift(shift);
      // Trova distrib per creator richiesto (match case-insensitive su alias)
      const targetDistrib = distribs.find((d) =>
        d.creator.toLowerCase() === targetLow || d.creator.toLowerCase().includes(targetLow) || targetLow.includes(d.creator.toLowerCase())
      );
      if (!targetDistrib || targetDistrib.sales <= 0) continue;
      shiftDetails.push({
        shift_id: shift.id,
        started_at: shift.started_at,
        ended_at: shift.ended_at,
        worked_hours: shift.worked_hours,
        interval: targetDistrib.interval || shift.interval_bucket,
        // Totali shift (sommatorie su tutti i creator del turno)
        total_shift_sales: Math.round(shift.total_attributed),
        total_shift_earnings: Math.round(shift.total_earnings),
        total_shift_pct: shift.total_attributed > 0 ? shift.total_earnings / shift.total_attributed : null,
        // Quota attribuita al creator target
        creator_alias: targetDistrib.creator,
        sales_on_creator: Math.round(targetDistrib.sales),
        earnings_on_creator: Math.round(targetDistrib.earnings),
        pct_on_creator: targetDistrib.sales > 0 ? targetDistrib.earnings / targetDistrib.sales : null,
        // Contesto
        all_creators_in_shift: shift.creator_aliases || [],
        creators_count: (shift.creator_aliases || []).length,
        multi_creator: targetDistrib.multi_creator,
        exact_attribution: targetDistrib.exact_attribution,
        estimated: targetDistrib.estimated,
        takes_count: shift.takes_count || 0,
        takes_for_creator: (shift.takes || []).filter((t) => t.creator_alias && t.creator_alias.toLowerCase().includes(targetLow)).map((t) => ({
          amount: t.amount, type: t.type, status: t.status,
        })),
      });
    }

    shiftDetails.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

    // Aggregati
    const totals = shiftDetails.reduce((acc, s) => {
      acc.sales += s.sales_on_creator;
      acc.earnings += s.earnings_on_creator;
      acc.shifts += 1;
      acc.mono += s.multi_creator ? 0 : 1;
      acc.multi += s.multi_creator ? 1 : 0;
      return acc;
    }, { sales: 0, earnings: 0, shifts: 0, mono: 0, multi: 0 });
    const overall_pct = totals.sales > 0 ? totals.earnings / totals.sales : null;

    return Response.json({
      creator: creatorAlias,
      operator: operatorName,
      period_id: periodId,
      totals: { ...totals, overall_pct },
      shifts: shiftDetails,
    });
  } catch (e) {
    console.error("[op-shifts] error:", e);
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
