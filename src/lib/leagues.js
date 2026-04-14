import { kv } from "@vercel/kv";

/**
 * League system (competitivo, mensile).
 *
 * A differenza della seniority (che misura esperienza cumulata),
 * le league misurano performance RELATIVA al gruppo in una stagione (mese).
 *
 * Tier ordinati crescenti: bronze < silver < gold < platinum < diamond
 *
 * Assegnazione per stagione (mese YYYY-MM):
 *   - calcola overall medio di ogni operatore nelle sessioni del mese (min 5 sessioni)
 *   - ordina operatori per media desc
 *   - top 10%  -> diamond
 *   - 10-25%   -> platinum
 *   - 25-50%   -> gold
 *   - 50-80%   -> silver
 *   - 80-100%  -> bronze
 *   - <5 sess  -> unranked
 */

export const LEAGUE_TIERS = ["bronze", "silver", "gold", "platinum", "diamond"];

export const LEAGUE_META = {
  bronze: { label: "Bronze", emoji: "🥉", color: "#CD7F32" },
  silver: { label: "Silver", emoji: "🥈", color: "#C0C0C0" },
  gold: { label: "Gold", emoji: "🥇", color: "#FFD700" },
  platinum: { label: "Platinum", emoji: "💠", color: "#E5E4E2" },
  diamond: { label: "Diamond", emoji: "💎", color: "#60A5FA" },
  unranked: { label: "Unranked", emoji: "⚪", color: "#666" },
};

const MIN_SESSIONS_FOR_RANK = 5;

export function currentSeasonKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function previousSeasonKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return currentSeasonKey(d);
}

function seasonBounds(seasonKey) {
  const [y, m] = seasonKey.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1); // exclusive
  return { start, end };
}

function tierFromPercentile(pct) {
  if (pct < 10) return "diamond";
  if (pct < 25) return "platinum";
  if (pct < 50) return "gold";
  if (pct < 80) return "silver";
  return "bronze";
}

/**
 * Costruisce lo standings di una stagione leggendo score_hist:index.
 * Returns { seasonKey, entries: [{userId, avgOverall, sessions, tier, rank}], totalRanked }
 */
export async function buildSeasonStandings(seasonKey) {
  const { start, end } = seasonBounds(seasonKey);
  let keys = [];
  try {
    keys = (await kv.zrange("score_hist:index", start, end - 1, { byScore: true })) || [];
  } catch (e) {
    console.warn("zrange score_hist:index failed:", e?.message);
  }

  if (!keys.length) {
    return { seasonKey, entries: [], totalRanked: 0 };
  }

  const records = (await Promise.all(keys.map((k) => kv.get(k)))).filter(Boolean);

  // Aggregate per user
  const agg = {};
  for (const r of records) {
    if (!r?.userId || typeof r.overall !== "number") continue;
    if (!agg[r.userId]) agg[r.userId] = { userId: r.userId, total: 0, count: 0 };
    agg[r.userId].total += r.overall;
    agg[r.userId].count += 1;
  }

  const ranked = Object.values(agg)
    .filter((x) => x.count >= MIN_SESSIONS_FOR_RANK)
    .map((x) => ({
      userId: x.userId,
      avgOverall: Math.round((x.total / x.count) * 10) / 10,
      sessions: x.count,
    }))
    .sort((a, b) => b.avgOverall - a.avgOverall);

  const N = ranked.length;
  const entries = ranked.map((e, i) => {
    const pct = (i / N) * 100;
    return { ...e, rank: i + 1, tier: tierFromPercentile(pct) };
  });

  // Add unranked users (< MIN_SESSIONS_FOR_RANK)
  Object.values(agg)
    .filter((x) => x.count < MIN_SESSIONS_FOR_RANK)
    .forEach((x) =>
      entries.push({
        userId: x.userId,
        avgOverall: Math.round((x.total / x.count) * 10) / 10,
        sessions: x.count,
        rank: null,
        tier: "unranked",
      })
    );

  return { seasonKey, entries, totalRanked: N };
}

/**
 * Salva snapshot della stagione + calcola diffs rispetto alla stagione precedente.
 */
export async function saveSeasonSnapshot(seasonKey) {
  const current = await buildSeasonStandings(seasonKey);
  const prevKey = (() => {
    const [y, m] = seasonKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return currentSeasonKey(d);
  })();

  const prevSnap = await kv.get(`league:snapshot:${prevKey}`);
  const prevTiers = {};
  if (prevSnap?.entries) {
    prevSnap.entries.forEach((e) => {
      prevTiers[e.userId] = e.tier;
    });
  }

  // Compute promotion/demotion
  const enriched = current.entries.map((e) => {
    const prevTier = prevTiers[e.userId] || null;
    let delta = null;
    if (prevTier && prevTier !== "unranked" && e.tier !== "unranked") {
      const prevIdx = LEAGUE_TIERS.indexOf(prevTier);
      const curIdx = LEAGUE_TIERS.indexOf(e.tier);
      if (prevIdx >= 0 && curIdx >= 0) {
        delta = curIdx - prevIdx; // +1 = promoted, -1 = demoted
      }
    }
    return { ...e, prevTier, delta };
  });

  const snapshot = {
    seasonKey,
    createdAt: Date.now(),
    totalRanked: current.totalRanked,
    entries: enriched,
  };

  await kv.set(`league:snapshot:${seasonKey}`, snapshot);
  await kv.zadd("league:snapshot:index", { score: seasonBounds(seasonKey).start, member: seasonKey });
  return snapshot;
}

/**
 * Lookup lega attuale per un userId (stagione corrente).
 * Se la stagione corrente non ha ancora uno snapshot salvato, calcola on-the-fly.
 */
export async function getUserLeague(userId) {
  if (!userId) return null;
  const seasonKey = currentSeasonKey();

  // Prova cached snapshot
  let snap = await kv.get(`league:snapshot:${seasonKey}`);
  if (!snap) {
    // on-the-fly compute per ora
    snap = await buildSeasonStandings(seasonKey);
  }
  const entry = (snap.entries || []).find((e) => e.userId === userId);
  return {
    seasonKey,
    tier: entry?.tier || "unranked",
    rank: entry?.rank ?? null,
    sessions: entry?.sessions ?? 0,
    avgOverall: entry?.avgOverall ?? 0,
    totalRanked: snap.totalRanked ?? 0,
  };
}
