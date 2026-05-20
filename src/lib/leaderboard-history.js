/**
 * HOC Fan Agent — Leaderboard History helpers
 *
 * Funzioni server-only per leggere periodi multipli da KV e calcolare
 * metriche aggregate cross-period: storico singolo operatore, health bar
 * globale, top underperformers cronici.
 *
 * Tutte le funzioni rispettano la denylist `leaderboard:exclusions` (gli
 * operatori esclusi non compaiono nelle metriche). I dati Mass sono già
 * filtrati a livello di pipeline da buildLeaderboard.
 *
 * Cache: piccola cache in-memory con TTL 5 min, sufficiente per le route
 * Next.js serverless che vivono a worker level. Non garantisce coerenza
 * cross-instance, ma per dati storici (che cambiano solo al nuovo import)
 * è accettabile.
 */
import { kv } from "@vercel/kv";
import { buildLeaderboard } from "./leaderboard-calc";

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return hit.v;
}
function cacheSet(key, v) {
  _cache.set(key, { v, t: Date.now() });
  return v;
}

/**
 * Lista period_id disponibili per un dato period_type, ordinati dal più
 * recente al più vecchio.
 */
export async function listAvailablePeriods(periodType) {
  const key = `_periods:${periodType}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const all = (await kv.zrange("ops_kpi:imports", 0, -1, { rev: true })) || [];
  const prefix = `${periodType}:`;
  const list = all.filter((m) => typeof m === "string" && m.startsWith(prefix)).map((m) => m.slice(prefix.length));
  return cacheSet(key, list);
}

/**
 * Carica records di un periodo (con cache).
 */
async function loadPeriodRecords(periodType, periodId) {
  const key = `_records:${periodType}:${periodId}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;
  const records = await kv.get(`ops_kpi:${periodType}:${periodId}`);
  return cacheSet(key, records || []);
}

/**
 * Carica la denylist (con cache).
 */
async function loadExclusions() {
  const cached = cacheGet("_exclusions");
  if (cached !== null) return cached;
  const v = (await kv.get("leaderboard:exclusions")) || {};
  return cacheSet("_exclusions", v);
}

/**
 * Costruisce la classifica di un periodo (con cache).
 */
async function buildRankingForPeriod(periodType, periodId) {
  const key = `_ranking:${periodType}:${periodId}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const records = await loadPeriodRecords(periodType, periodId);
  if (!records || records.length === 0) return cacheSet(key, { ranking: [], groupAverages: {} });
  const exclusions = await loadExclusions();
  const result = buildLeaderboard(records, "withoutClockIn", {}, exclusions);
  return cacheSet(key, result);
}

/**
 * Carica lo storico di un singolo operatore: array di {period_id, score,
 * tier, rank, sales, ...} ordinato dal più vecchio al più recente.
 *
 * options.limit = max periodi (default: tutti)
 */
export async function loadHistoryForEmployee({ employee, periodType, limit = 9999 }) {
  if (!employee) return [];
  const periods = (await listAvailablePeriods(periodType)).slice(0, limit);
  const out = [];
  for (const periodId of periods) {
    const { ranking } = await buildRankingForPeriod(periodType, periodId);
    const r = ranking.find((x) => x.employee === employee);
    if (!r) continue;
    out.push({
      period_id: periodId,
      score: r.score,
      tier: r.tier,
      rank: r.rank,
      sales: r.sales || 0,
      ppvs_unlocked: r.ppvs_unlocked || 0,
      fan_cvr: r.fan_cvr || 0,
      unlock_rate: r.unlock_rate || 0,
      avg_earnings_per_paying_fan: r.avg_earnings_per_paying_fan || 0,
      group: r.group,
      language: r.language || null,
      creators: r.creators || [],
      excluded_reason: r._excluded_reason || null,
    });
  }
  // oldest first per grafico timeline
  return out.reverse();
}

/**
 * Calcola LTV totale di un operatore (somma sales su tutti i periodi
 * disponibili del period_type indicato) e prima/ultima apparizione.
 */
export async function computeEmployeeLTV({ employee, periodType }) {
  const history = await loadHistoryForEmployee({ employee, periodType });
  if (history.length === 0) {
    return { ltv_eur: 0, first_seen: null, last_seen: null, periods_count: 0, total_purch: 0 };
  }
  const ltv = history.reduce((s, h) => s + (h.sales || 0), 0);
  const totalPurch = history.reduce((s, h) => s + (h.ppvs_unlocked || 0), 0);
  return {
    ltv_eur: Math.round(ltv),
    total_purch: totalPurch,
    first_seen: history[0].period_id,
    last_seen: history[history.length - 1].period_id,
    periods_count: history.length,
  };
}

/**
 * Health bar globale: per ogni periodo, calcola avg_score, eligible
 * count, distribuzione tier e contesto di trend.
 */
export async function loadGlobalHealthHistory({ periodType, limit = 12 }) {
  const periods = (await listAvailablePeriods(periodType)).slice(0, limit);
  const out = [];
  for (const periodId of periods) {
    const { ranking } = await buildRankingForPeriod(periodType, periodId);
    const eligible = ranking.filter((r) => r.score !== null && r.score > 0);
    const avg = eligible.length > 0 ? eligible.reduce((s, r) => s + r.score, 0) / eligible.length : 0;
    const tierCounts = {};
    for (const r of eligible) if (r.tier) tierCounts[r.tier] = (tierCounts[r.tier] || 0) + 1;
    const eliteStrong = (tierCounts.Elite || 0) + (tierCounts.Strong || 0);
    const criticalWeak = (tierCounts.Critical || 0) + (tierCounts.Weak || 0);
    out.push({
      period_id: periodId,
      avg_score: Math.round(avg * 10) / 10,
      eligible: eligible.length,
      elite_strong: eliteStrong,
      critical_weak: criticalWeak,
      tier_counts: tierCounts,
    });
  }
  return out.reverse(); // oldest first
}

/**
 * Top N underperformers cronici: operatori col bottom score corrente
 * che sono stati sotto tier "Average" per almeno minChronic dei lookback
 * periodi precedenti. Vuoto se manca lo storico.
 */
const BAD_TIERS = new Set(["Critical", "Weak", "Average"]);

export async function computeUnderperformers({ periodType, currentPeriodId, lookback = 3, minChronic = 2, limit = 10, languageFilter = null, ignoredSet = null }) {
  const { ranking } = await buildRankingForPeriod(periodType, currentPeriodId);
  let currentEligible = ranking.filter((r) => r.score !== null && r.score > 0);
  if (languageFilter) {
    currentEligible = currentEligible.filter((r) => r.language === languageFilter);
  }
  if (ignoredSet && ignoredSet.size > 0) {
    currentEligible = currentEligible.filter((r) => !ignoredSet.has(r.employee));
  }
  if (currentEligible.length === 0) return [];

  const allPeriods = await listAvailablePeriods(periodType);
  const lookbackPeriods = allPeriods.filter((p) => p !== currentPeriodId).slice(0, lookback);

  // Sort ascending by score (worst first)
  const bottom = [...currentEligible].sort((a, b) => a.score - b.score);

  // Pre-load all lookback rankings once
  const lookbackRankings = {};
  for (const pid of lookbackPeriods) {
    const { ranking: rr } = await buildRankingForPeriod(periodType, pid);
    lookbackRankings[pid] = rr;
  }

  const out = [];
  for (const candidate of bottom) {
    let chronic = 0;
    const history = [];
    for (const pid of lookbackPeriods) {
      const r = (lookbackRankings[pid] || []).find((x) => x.employee === candidate.employee);
      if (r && r.tier && BAD_TIERS.has(r.tier)) chronic += 1;
      history.push({ period_id: pid, score: r?.score ?? null, tier: r?.tier ?? null });
    }
    if (chronic >= minChronic || lookbackPeriods.length === 0) {
      out.push({
        employee: candidate.employee,
        group: candidate.group,
        language: candidate.language || null,
        score: candidate.score,
        tier: candidate.tier,
        rank: candidate.rank,
        chronic_count: chronic,
        lookback_total: lookbackPeriods.length,
        history,
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}
