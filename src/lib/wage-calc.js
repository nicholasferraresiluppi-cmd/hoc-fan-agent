/**
 * Calcolo scaglioni comp (condiviso).
 *
 * Estratto da /api/admin/comp-exam (dove è nato e validato) perché serve anche
 * alla superficie operatore (/api/me/payout): stessa formula, un solo posto.
 *
 * Calcolo CUMULATIVO degli scaglioni — confermato da CP UI:
 *   "Base 10% · >350$ 12% · >700$ 15%"
 * significa: 0-350 al 10%, 350-700 al 12% sul delta, >700 al 15% sul delta.
 * Restituisce { earning, effective_pct, breakdown } dove effective_pct = earning/sales.
 */
export function calcCumulativeEarning(sales, thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length === 0 || sales <= 0) {
    return { earning: 0, effective_pct: null, breakdown: [] };
  }
  const sorted = [...thresholds].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  let earning = 0;
  const breakdown = [];
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const from = t.threshold ?? 0;
    const to = i < sorted.length - 1 ? (sorted[i + 1].threshold ?? Infinity) : Infinity;
    if (sales <= from) break;
    const tierSales = Math.min(sales, to) - from;
    if (tierSales <= 0) continue;
    const pct = t.percentage ?? 0;
    const tierEarn = tierSales * pct;
    earning += tierEarn;
    breakdown.push({ from, to: to === Infinity ? null : to, tier_sales: tierSales, pct, tier_earning: tierEarn });
  }
  return { earning, effective_pct: sales > 0 ? earning / sales : null, breakdown };
}
