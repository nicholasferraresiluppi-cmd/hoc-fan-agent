/**
 * P&L live per creator (operativo, lato chat).
 *
 * GET /api/admin/pnl-live?period_id=YYYY-MM
 *   Per ogni creator del mese (da KV wages): venduto (somma takes) e costo
 *   operatori attribuito, con la % sul venduto. Funziona anche sul MESE
 *   CORRENTE (= live): basta che il sync sia girato. Include last_sync da
 *   cp:_meta per sapere quanto è fresco il dato.
 *
 * Fee del deal e margine TOLTI (15/10/2026, decisione Nicholas): gli accordi
 * delle creator sono riservati e vivono nel Conto dello split
 * (`/contabilita/split`, cifrato, fuori da RBAC). Qui erano in `pnl:deal_fees`
 * in chiaro e visibili a ogni admin. Non rimettere fee in questa pagina e non
 * leggerle dal conto dello split: porterebbe un dato riservato agli admin.
 *
 * CAVEAT (esposto anche in UI): è il P&L OPERATIVO della chat — include
 * solo il costo operatori. Valuta: $ (CP), non € (Finance).
 */
import { kv } from "@vercel/kv";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getWages } from "@/lib/cp-wages-store";
import { aggregateWagesByAlias } from "@/lib/pnl-aggregate";

export const maxDuration = 30;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const periodId = url.searchParams.get("period_id") || "";
  if (!/^\d{4}-\d{2}$/.test(periodId)) {
    return Response.json({ error: "period_id YYYY-MM richiesto" }, { status: 400 });
  }

  const [wages, meta] = await Promise.all([getWages(periodId), kv.get("cp:_meta")]);
  if (!Array.isArray(wages) || wages.length === 0) {
    return Response.json({
      error: `Nessuna wage in KV per ${periodId}. Sincronizza il mese (anche quello corrente: il P&L live si aggiorna a ogni sync).`,
    }, { status: 404 });
  }

  // Aggregazione per alias: venduto (takes esatti) + costo operatori attribuito (lib condivisa con la città)
  const byAlias = aggregateWagesByAlias(wages);

  const rows = [...byAlias.entries()]
    .filter(([, a]) => a.sales > 0)
    .map(([alias, a]) => ({
      alias,
      sales: Math.round(a.sales),
      cost_ops: Math.round(a.cost),
      cost_pct: a.sales > 0 ? Math.round((a.cost / a.sales) * 1000) / 1000 : null,
      shifts: a.shifts,
    }))
    .sort((x, y) => y.sales - x.sales);

  return Response.json({
    period_id: periodId,
    last_sync_at: meta?.last_sync_at ?? null,
    last_sync_period: meta?.last_sync_period ?? null,
    rows,
    totals: {
      sales: rows.reduce((s, r) => s + r.sales, 0),
      cost_ops: rows.reduce((s, r) => s + r.cost_ops, 0),
    },
  });
}
