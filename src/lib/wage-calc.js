/**
 * Calcolo scaglioni comp (condiviso).
 *
 * Estratto da /api/admin/comp-exam (dove è nato e validato) perché serve anche
 * alla superficie operatore (/api/me/payout): stessa formula, un solo posto.
 *
 * ⚠️ 28/09/2026 — VERIFICATO SUI DATI: CreatorsPro NON paga a cascata. Su 3.726 turni di set 2026
 * il compenso è SEMPRE la percentuale dello scaglione raggiunto applicata a TUTTO il venduto del
 * turno (2.266 turni combaciano solo così, 1.460 sotto la prima soglia combaciano con entrambe,
 * 0 solo a cascata). Per spiegare/stimare il pagato usa `calcTierEarning`. `calcCumulativeEarning`
 * resta solo per chi vuole SIMULARE uno schema a cascata alternativo.
 *
 * (Nota storica, smentita dai dati) Calcolo CUMULATIVO degli scaglioni — "confermato da CP UI":
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

/**
 * Regola di CreatorsPro (verificata 28/09/2026): lo scaglione RAGGIUNTO (venduto ≥ soglia) si applica
 * a tutto il venduto del turno. breakdown = tutti gli scaglioni del profilo, con `reached` sul raggiunto.
 */
export function calcTierEarning(sales, thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length === 0 || sales <= 0) {
    return { earning: 0, effective_pct: null, breakdown: [] };
  }
  const sorted = [...thresholds].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
  let idx = 0;
  sorted.forEach((t, i) => { if (sales >= (t.threshold ?? 0)) idx = i; });
  const pct = sorted[idx].percentage ?? 0;
  const earning = sales * pct;
  const breakdown = sorted.map((t, i) => ({
    from: t.threshold ?? 0, to: i < sorted.length - 1 ? (sorted[i + 1].threshold ?? null) : null, pct: t.percentage ?? 0,
    reached: i === idx, tier_sales: i === idx ? sales : 0, tier_earning: i === idx ? earning : 0,
  }));
  return { earning, effective_pct: pct, breakdown };
}
