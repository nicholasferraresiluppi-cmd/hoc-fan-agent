/**
 * HOC Pro — Retention analytics (Livello 1 "CRM fan").
 *
 * Funzioni PURE che, dalle transazioni fan-level del payout ledger di UN
 * creator (cross-periodo), ricavano una lente di RETENTION di management:
 *   - concentrazione whale (quanto pesa il top 1/5/10% dei fan)
 *   - coorti di retention (dei fan entrati nel mese M, quanti tornano dopo?)
 *   - LTV per fan + spend bands (cold / small / regular / whale)
 *   - whale dormienti (segnale di retention-risk)
 *   - riepilogo refund
 *
 * DELIBERATO — perché questa NON è un CRM fan operativo (cfr decision log
 * 2026-07-19 "dati fan fuori dagli input dello score" + direzione v2.1 "fan
 * pseudonimizzati"):
 *   1) Nessuna AZIONE sul fan vive qui: l'azione (messaggiare) sta in
 *      Infloww/OF, dove lavora il chatter. Questa è analitica aggregata.
 *   2) I fan sono PSEUDONIMIZZATI (`fanPseudonym`): mai nome reale in output.
 *      L'unica superficie con fan identificati resta /admin/payout-tree, che
 *      serve la dispute policy (evidenza congelata). Qui si guarda il
 *      portafoglio del creator nel tempo, non il singolo fan da contattare.
 *
 * Input transazione (slim ledger, importi in CENT): { tid, fid, fn, t, ty,
 * st, g, f, n, cur }. Refund slim: { tid, fid, pt, rt, ps, amt, tt }.
 * Output: importi in DOLLARI (arrotondati) per non far gestire i cent alla UI.
 */

// Soglie decisionali (documentate, non magiche):
export const WHALE_MIN_CENTS = 50000;   // $500 spesa lifetime = "whale" (allineato al settore: $500+/mese coltivato)
export const DORMANT_DAYS = 21;         // > 21 giorni dall'ultimo acquisto = dormiente
export const DORMANT_LIST_MAX = 20;     // quanti whale dormienti mostrare
const DAY_MS = 86400000;

// Bande di spesa lifetime (cent) — vocabolario ricorrente nel settore.
const SPEND_BANDS = [
  { id: "cold", label: "Cold", min: 0, max: 5000 },        // < $50
  { id: "small", label: "Small spender", min: 5000, max: 20000 },   // $50–200
  { id: "regular", label: "Regular", min: 20000, max: 50000 },      // $200–500
  { id: "whale", label: "Whale", min: 50000, max: Infinity },       // $500+
];

const c2d = (cents) => Math.round((cents || 0) / 100);       // cent → dollari interi
const c2d2 = (cents) => Math.round((cents || 0) / 100 * 100) / 100; // cent → dollari 2 dec

/** Mese UTC "YYYY-MM" da un timestamp ms (allineato ai period_id del ledger). */
export function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Tutti i mesi "YYYY-MM" da minKey a maxKey inclusi (asse coorti, gap inclusi). */
export function monthRange(minKey, maxKey) {
  if (!minKey || !maxKey) return [];
  let [y, m] = minKey.split("-").map(Number);
  const [y1, m1] = maxKey.split("-").map(Number);
  const out = [];
  let guard = 0;
  while ((y < y1 || (y === y1 && m <= m1)) && guard++ < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * Pseudonimo fan stabile e non-parlante (FNV-1a → base36). Deterministico:
 * lo stesso fanId dà sempre lo stesso token, ma il token non rivela il fanId.
 */
export function fanPseudonym(fid) {
  let h = 2166136261;
  const s = String(fid ?? "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).padStart(6, "0").slice(-4);
}

// Vocabolario status reale del ledger Infloww (verificato su dati veri lug
// 2026): "done" = vendita realizzata, "undo" = storno, "loading" = in sospeso.
// Regex-based per robustezza su varianti/legacy ("complete", "reversed"…).
const ST_REVERSED = /reverse|undo|refund|charge.?back|void/i;
const ST_PENDING = /loading|pending|processing|hold/i;

/**
 * Una transazione conta come vendita realizzata se ha importo positivo e uno
 * status che NON è storno né pendente. status vuoto/sconosciuto → si assume
 * realizzata (g>0 è già un segnale forte). Gli storni entrano nel refund rate
 * via l'array refund separato, non qui: contarli come vendite gonfierebbe.
 */
function isSale(tx) {
  if (!tx || (tx.g || 0) <= 0) return false;
  const st = String(tx.st || "");
  return !ST_REVERSED.test(st) && !ST_PENDING.test(st);
}

/**
 * Aggrega le transazioni per fan. Ritorna Map(fid → aggregato).
 * gross/net in CENT; months = Set("YYYY-MM"); types = { ty: countCents }.
 */
export function aggregateByFan(txns) {
  const byFan = new Map();
  for (const tx of txns) {
    if (!isSale(tx)) continue;
    const fid = tx.fid ?? "?";
    let f = byFan.get(fid);
    if (!f) { f = { fid, gross: 0, net: 0, count: 0, firstT: tx.t, lastT: tx.t, months: new Set(), types: {} }; byFan.set(fid, f); }
    f.gross += tx.g || 0;
    f.net += tx.n || 0;
    f.count += 1;
    if (tx.t < f.firstT) f.firstT = tx.t;
    if (tx.t > f.lastT) f.lastT = tx.t;
    f.months.add(monthKey(tx.t));
    const ty = tx.ty || "other";
    f.types[ty] = (f.types[ty] || 0) + (tx.g || 0);
  }
  return byFan;
}

/** Concentrazione: quota di fatturato del top N% dei fan per spesa lifetime. */
export function whaleConcentration(fans, totalGross) {
  const sorted = [...fans].sort((a, b) => b.gross - a.gross);
  const total = totalGross || sorted.reduce((s, f) => s + f.gross, 0);
  const topShare = (pct) => {
    if (sorted.length === 0 || total === 0) return { count: 0, share: 0, gross_usd: 0 };
    const n = Math.max(1, Math.ceil(sorted.length * pct));
    const g = sorted.slice(0, n).reduce((s, f) => s + f.gross, 0);
    return { count: n, share: Math.round((g / total) * 1000) / 10, gross_usd: c2d(g) };
  };
  return {
    fan_count: sorted.length,
    total_usd: c2d(total),
    top1: topShare(0.01),
    top5: topShare(0.05),
    top10: topShare(0.1),
    top20: topShare(0.2),
  };
}

/** Distribuzione LTV + bande di spesa. */
export function ltvBands(fans) {
  const grosses = fans.map((f) => f.gross).sort((a, b) => a - b);
  const n = grosses.length;
  const bands = SPEND_BANDS.map((b) => ({ id: b.id, label: b.label, fans: 0, gross: 0 }));
  let totalGross = 0;
  for (const f of fans) {
    totalGross += f.gross;
    const b = bands.find((_, i) => f.gross >= SPEND_BANDS[i].min && f.gross < SPEND_BANDS[i].max);
    if (b) { b.fans += 1; b.gross += f.gross; }
  }
  const pctile = (p) => (n === 0 ? 0 : grosses[Math.min(n - 1, Math.floor(p * n))]);
  return {
    fan_count: n,
    mean_usd: n ? c2d2(totalGross / n) : 0,
    median_usd: c2d2(pctile(0.5)),
    p90_usd: c2d2(pctile(0.9)),
    bands: bands.map((b) => ({
      ...b,
      gross_usd: c2d(b.gross),
      fans_pct: n ? Math.round((b.fans / n) * 1000) / 10 : 0,
      gross_pct: totalGross ? Math.round((b.gross / totalGross) * 1000) / 10 : 0,
    })),
  };
}

/**
 * Coorti di retention. Coorte = mese di primo acquisto del fan. Per ogni coorte
 * e offset k (mesi dopo l'ingresso), % di fan della coorte ancora attivi.
 * `axis` = mesi presenti nel dataset (asse temporale comune).
 */
export function cohortRetention(fans, axis) {
  if (axis.length === 0) return { axis: [], cohorts: [], max_offset: 0 };
  const idx = new Map(axis.map((m, i) => [m, i]));
  const byCohort = new Map(); // cohortMonth → { fans:[] }
  for (const f of fans) {
    const first = monthKey(f.firstT);
    if (!idx.has(first)) continue;
    if (!byCohort.has(first)) byCohort.set(first, []);
    byCohort.get(first).push(f);
  }
  const maxOffset = axis.length - 1;
  const cohorts = [];
  for (const month of axis) {
    const cf = byCohort.get(month);
    if (!cf || cf.length === 0) continue;
    const start = idx.get(month);
    const size = cf.length;
    const cohortGross = cf.reduce((s, f) => s + f.gross, 0);
    const retention = [];
    for (let k = 0; start + k < axis.length; k++) {
      const mk = axis[start + k];
      const active = cf.filter((f) => f.months.has(mk)).length;
      retention.push({ offset: k, month: mk, active, pct: Math.round((active / size) * 1000) / 10 });
    }
    cohorts.push({ cohort: month, size, gross_usd: c2d(cohortGross), retention });
  }
  return { axis, cohorts, max_offset: maxOffset };
}

/**
 * Whale dormienti = fan con spesa lifetime ≥ WHALE_MIN e ultimo acquisto oltre
 * DORMANT_DAYS. Riferimento temporale = ultima attività nel dataset (non il
 * wall-clock): evita che il lag di sync faccia sembrare tutti dormienti.
 * Output PSEUDONIMIZZATO.
 */
export function dormantWhales(fans, referenceT) {
  const ref = referenceT || Math.max(0, ...fans.map((f) => f.lastT || 0));
  const out = [];
  for (const f of fans) {
    if (f.gross < WHALE_MIN_CENTS) continue;
    const daysSince = Math.floor((ref - f.lastT) / DAY_MS);
    if (daysSince <= DORMANT_DAYS) continue;
    out.push({
      pseudo: fanPseudonym(f.fid),
      gross_usd: c2d(f.gross),
      count: f.count,
      last_t: f.lastT,
      days_since: daysSince,
      top_type: Object.entries(f.types).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    });
  }
  out.sort((a, b) => b.gross_usd - a.gross_usd);
  return { reference_t: ref, count: out.length, fans: out.slice(0, DORMANT_LIST_MAX) };
}

/** Riepilogo refund sul creator (importi in cent → dollari). */
export function refundSummary(refunds, totalGrossCents) {
  let amt = 0;
  for (const r of refunds || []) amt += r.amt || 0;
  return {
    count: (refunds || []).length,
    amount_usd: c2d(amt),
    rate_pct: totalGrossCents ? Math.round((amt / totalGrossCents) * 1000) / 10 : 0,
  };
}

/**
 * Orchestratore: da (txns, refunds) di UN creator → oggetto retention completo.
 * L'API resta sottile.
 */
export function computeCreatorRetention(txns, refunds) {
  const byFan = aggregateByFan(txns);
  const fans = [...byFan.values()];
  const totalGross = fans.reduce((s, f) => s + f.gross, 0);

  const months = new Set();
  for (const f of fans) for (const m of f.months) months.add(m);
  const sortedMonths = [...months].sort();
  const axis = sortedMonths.length ? monthRange(sortedMonths[0], sortedMonths[sortedMonths.length - 1]) : [];
  const referenceT = Math.max(0, ...fans.map((f) => f.lastT || 0));

  return {
    total_usd: c2d(totalGross),
    fan_count: fans.length,
    tx_count: fans.reduce((s, f) => s + f.count, 0),
    reference_t: referenceT,
    concentration: whaleConcentration(fans, totalGross),
    ltv: ltvBands(fans),
    cohorts: cohortRetention(fans, axis),
    dormant: dormantWhales(fans, referenceT),
    refunds: refundSummary(refunds, totalGross),
  };
}
