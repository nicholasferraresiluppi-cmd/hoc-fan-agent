/**
 * HOC Fan Agent — CreatorsPro data accessors.
 *
 * Funzioni server-only per leggere dati CP normalizzati da KV e calcolare
 * metriche per la leaderboard (sales/shift, fasce orarie, best/worst).
 *
 * Tutte usano una piccola cache in-memory perché vengono chiamate
 * potenzialmente molte volte per request (per ogni record del ranking).
 */
import { kv } from "@vercel/kv";

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > TTL_MS) { _cache.delete(key); return null; }
  return hit.v;
}
function cacheSet(key, v) { _cache.set(key, { v, t: Date.now() }); return v; }

async function loadWages(periodId) {
  const k = `_wages:${periodId}`;
  const c = cacheGet(k);
  if (c !== null) return c;
  const w = (await kv.get(`cp:wages:${periodId}`)) || [];
  return cacheSet(k, w);
}

async function loadMapping() {
  const c = cacheGet("_mapping");
  if (c !== null) return c;
  const m = (await kv.get("cp:member_mapping")) || {};
  return cacheSet("_mapping", m);
}

/**
 * Indicizza i wage CP per nome Infloww (via mapping). Ritorna mappa
 * { infloww_name: cp_wage_normalized }. I member CP senza mapping sono ignorati.
 */
export async function indexWagesByInflowwName(periodId) {
  const k = `_idx:${periodId}`;
  const c = cacheGet(k);
  if (c) return c;
  const [wages, mapping] = await Promise.all([loadWages(periodId), loadMapping()]);
  const idx = {};
  for (const w of wages) {
    const inflowwName = mapping[w.member_id];
    if (!inflowwName) continue;
    // Se uno stesso operatore ha più wage nel periodo (raro ma possibile),
    // accumuliamo: somma di sales/shifts/hours.
    if (!idx[inflowwName]) {
      idx[inflowwName] = {
        infloww_name: inflowwName,
        cp_member_id: w.member_id,
        cp_member_name: w.member_name,
        total_attributed: 0,
        total_earnings: 0,
        total_wage: 0,
        total_shifts: 0,
        total_hours: 0,
        shifts: [],
        wage_ids: [],
      };
    }
    const agg = idx[inflowwName];
    agg.total_attributed += w.total_attributed_from_takes || 0;
    agg.total_earnings += w.total_earnings_from_takes || 0;
    agg.total_wage += w.total_wage || 0;
    agg.total_shifts += w.total_worked_shifts || 0;
    agg.total_hours += w.total_worked_hours || 0;
    agg.shifts.push(...(w.shifts || []));
    agg.wage_ids.push(w.id);
  }
  // Decora con KPI derivati
  for (const agg of Object.values(idx)) {
    agg.sales_per_shift = agg.total_shifts > 0 ? Math.round((agg.total_attributed / agg.total_shifts) * 100) / 100 : 0;
    agg.sales_per_hour = agg.total_hours > 0 ? Math.round((agg.total_attributed / agg.total_hours) * 100) / 100 : 0;
    // Best/worst shift by total_attributed
    const sortedShifts = [...agg.shifts].sort((a, b) => (b.total_attributed || 0) - (a.total_attributed || 0));
    agg.best_shift = sortedShifts[0] || null;
    agg.worst_shift = sortedShifts.length > 0 ? sortedShifts[sortedShifts.length - 1] : null;
    // Breakdown per fascia oraria
    const buckets = { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    const bucketsSales = { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    for (const s of agg.shifts) {
      const b = s.interval_bucket;
      if (b && buckets[b] !== undefined) {
        buckets[b] += 1;
        bucketsSales[b] += s.total_attributed || 0;
      }
    }
    agg.interval_shifts = buckets;
    agg.interval_sales = bucketsSales;
    // Fascia top (più $)
    let topBucket = null;
    let topSales = 0;
    for (const [b, s] of Object.entries(bucketsSales)) {
      if (s > topSales) { topSales = s; topBucket = b; }
    }
    agg.top_interval = topBucket;
  }
  return cacheSet(k, idx);
}

/**
 * Aggregati agency-level per un periodo: totali, medie, distribuzione fasce.
 */
export async function getAgencyStats(periodId) {
  const k = `_agency:${periodId}`;
  const c = cacheGet(k);
  if (c) return c;
  const idx = await indexWagesByInflowwName(periodId);
  const operators = Object.values(idx);
  const total_sales = operators.reduce((a, o) => a + (o.total_attributed || 0), 0);
  const total_shifts = operators.reduce((a, o) => a + (o.total_shifts || 0), 0);
  const total_hours = operators.reduce((a, o) => a + (o.total_hours || 0), 0);
  const buckets = { After: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  for (const o of operators) {
    for (const [b, n] of Object.entries(o.interval_sales || {})) buckets[b] += n;
  }
  const stats = {
    operators_count: operators.length,
    total_sales: Math.round(total_sales * 100) / 100,
    total_shifts,
    total_hours: Math.round(total_hours * 10) / 10,
    avg_sales_per_shift: total_shifts > 0 ? Math.round((total_sales / total_shifts) * 100) / 100 : 0,
    avg_sales_per_hour: total_hours > 0 ? Math.round((total_sales / total_hours) * 100) / 100 : 0,
    interval_sales: buckets,
  };
  return cacheSet(k, stats);
}

/**
 * Storico cross-period per un singolo operatore Infloww name.
 * Ritorna array { period_id, total_sales, total_shifts, sales_per_shift, ... }
 * ordinato dal più vecchio al più recente.
 */
export async function getEmployeeHistory(inflowwName, { periodType = "monthly", limit = 24 } = {}) {
  if (!inflowwName) return [];
  // periodType supportato solo monthly per ora (le sync sono mensili)
  if (periodType !== "monthly") return [];
  // Lista periodi disponibili in cp:wages:*
  // Strategy: leggo cp:_meta per last_sync_period e generato per N mesi indietro
  // Per ora più semplice: provo gli ultimi N mesi consecutivi
  const now = new Date();
  const out = [];
  for (let i = 0; i < limit; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const periodId = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const idx = await indexWagesByInflowwName(periodId);
    const agg = idx[inflowwName];
    if (!agg) continue;
    out.push({
      period_id: periodId,
      total_sales: agg.total_attributed,
      total_shifts: agg.total_shifts,
      total_hours: agg.total_hours,
      sales_per_shift: agg.sales_per_shift,
      sales_per_hour: agg.sales_per_hour,
      top_interval: agg.top_interval,
      interval_shifts: agg.interval_shifts,
      interval_sales: agg.interval_sales,
      best_shift: agg.best_shift ? {
        started_at: agg.best_shift.started_at,
        total_attributed: agg.best_shift.total_attributed,
        worked_hours: agg.best_shift.worked_hours,
        interval_bucket: agg.best_shift.interval_bucket,
        creator_aliases: agg.best_shift.creator_aliases,
      } : null,
      worst_shift: agg.worst_shift && agg.worst_shift !== agg.best_shift ? {
        started_at: agg.worst_shift.started_at,
        total_attributed: agg.worst_shift.total_attributed,
        worked_hours: agg.worst_shift.worked_hours,
        interval_bucket: agg.worst_shift.interval_bucket,
        creator_aliases: agg.worst_shift.creator_aliases,
      } : null,
    });
  }
  return out.reverse();
}

/**
 * Indica se i dati CP sono disponibili per un periodo (per graceful degradation).
 */
export async function hasCpDataForPeriod(periodId) {
  const w = await loadWages(periodId);
  return Array.isArray(w) && w.length > 0;
}

/**
 * Costruisce il dataset operatori per la NUOVA leaderboard Sales CP.
 * Include:
 *   - operatori CP mappati (con aggregates ricchi + shifts_attributed per consistency)
 *   - operatori Infloww NON in mapping CP (con has_cp_data=false, _excluded_reason="no_cp_data")
 *
 * Per ogni operatore mappato decora `cp_aggregates.shifts_attributed[]` con
 * la lista dei singoli `total_attributed` per shift — serve a `calcConsistency`.
 *
 * @param {string} periodId  es. "2026-04"
 * @returns {Array} array di operator records pronti per buildCpLeaderboard
 */
export async function buildOperatorsForCpLeaderboard(periodId) {
  const idx = await indexWagesByInflowwName(periodId);
  // Decora con shifts_attributed[]
  for (const agg of Object.values(idx)) {
    agg.shifts_attributed = (agg.shifts || []).map((s) => s.total_attributed || 0);
  }
  // Carica anche operatori Infloww del periodo per includere i non-CP-mapped
  const inflowwRecords = (await kv.get(`ops_kpi:monthly:${periodId}`)) || [];
  const inflowwEmployees = new Map(); // employee → { group, language, category, infloww_kpis }
  for (const r of inflowwRecords) {
    if (!r.employee || r.is_mass) continue;
    if (!inflowwEmployees.has(r.employee)) {
      inflowwEmployees.set(r.employee, {
        employee: r.employee,
        group: r.group,
        // language: rilevata da group name (lib leaderboard-calc); per ora la passo a null
        // e sarà arricchita nel route che ha accesso ai language overrides
        infloww_sales: 0,
        infloww_purch: 0,
        infloww_fans: 0,
        infloww_fans_paying: 0,
        infloww_msgs: 0,
        infloww_unlocks: 0,
        infloww_ppvs_sent: 0,
      });
    }
    const op = inflowwEmployees.get(r.employee);
    op.infloww_sales += r.sales || 0;
    op.infloww_purch += r.ppvs_unlocked || 0;
    op.infloww_fans += r.fans_chatted || 0;
    op.infloww_fans_paying += r.fans_who_spent_money || 0;
    op.infloww_msgs += r.direct_messages_sent || 0;
    op.infloww_unlocks += r.ppvs_unlocked || 0;
    op.infloww_ppvs_sent += r.direct_ppvs_sent || 0;
  }
  // KPI derivati Infloww (informativi)
  for (const op of inflowwEmployees.values()) {
    op.fan_cvr = op.infloww_fans > 0 ? op.infloww_fans_paying / op.infloww_fans : 0;
    op.unlock_rate = op.infloww_ppvs_sent > 0 ? op.infloww_unlocks / op.infloww_ppvs_sent : 0;
    op.avg_earnings_per_paying_fan = op.infloww_fans_paying > 0 ? op.infloww_sales / op.infloww_fans_paying : 0;
  }
  // Merge: per ogni infloww employee, se mappato CP arricchisci con cp_aggregates
  const out = [];
  for (const [name, infw] of inflowwEmployees.entries()) {
    const cpAgg = idx[name];
    out.push({
      employee: name,
      group: infw.group,
      // infloww informativi
      infloww_sales: Math.round(infw.infloww_sales),
      infloww_purch: infw.infloww_purch,
      infloww_fan_cvr: infw.fan_cvr,
      infloww_unlock_rate: infw.unlock_rate,
      infloww_avg_earnings_per_paying_fan: infw.avg_earnings_per_paying_fan,
      // cp data
      has_cp_data: !!cpAgg,
      cp_aggregates: cpAgg ? {
        total_sales: cpAgg.total_attributed,
        total_shifts: cpAgg.total_shifts,
        total_hours: cpAgg.total_hours,
        total_wage: cpAgg.total_wage,
        total_earnings: cpAgg.total_earnings,
        shifts_attributed: cpAgg.shifts_attributed,
        top_interval: cpAgg.top_interval,
        interval_shifts: cpAgg.interval_shifts,
        interval_sales: cpAgg.interval_sales,
        best_shift: cpAgg.best_shift,
        worst_shift: cpAgg.worst_shift,
      } : null,
    });
  }
  // Aggiungi anche operatori CP mappati che NON sono in Infloww (caso raro ma possibile)
  const inflowwNames = new Set(inflowwEmployees.keys());
  for (const [name, cpAgg] of Object.entries(idx)) {
    if (inflowwNames.has(name)) continue;
    out.push({
      employee: name,
      group: null, // non sappiamo il group senza Infloww
      infloww_sales: 0,
      infloww_purch: 0,
      infloww_fan_cvr: null,
      infloww_unlock_rate: null,
      infloww_avg_earnings_per_paying_fan: null,
      has_cp_data: true,
      _no_infloww_match: true,
      cp_aggregates: {
        total_sales: cpAgg.total_attributed,
        total_shifts: cpAgg.total_shifts,
        total_hours: cpAgg.total_hours,
        total_wage: cpAgg.total_wage,
        total_earnings: cpAgg.total_earnings,
        shifts_attributed: cpAgg.shifts_attributed,
        top_interval: cpAgg.top_interval,
        interval_shifts: cpAgg.interval_shifts,
        interval_sales: cpAgg.interval_sales,
        best_shift: cpAgg.best_shift,
        worst_shift: cpAgg.worst_shift,
      },
    });
  }
  return out;
}
