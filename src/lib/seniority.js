import { kv } from "@vercel/kv";

/**
 * Seniority tiers per operatore.
 * Ordine crescente: junior < senior < master.
 *
 * Criteri (auto):
 * - junior: default (< soglia senior)
 * - senior: >= 30 sessioni totali && overall medio ultime 30 sessioni >= 70
 * - master: >= 100 sessioni totali && overall medio ultime 50 sessioni >= 80
 *
 * Override manuale: KV key `seniority:override:{userId}` -> "junior"|"senior"|"master"
 */

export const TIERS = ["junior", "senior", "master"];

export const TIER_META = {
  junior: {
    label: "Junior",
    emoji: "🌱",
    color: "#10B981",
    description: "In formazione — daily drill obbligatorio, scenari base/medi.",
  },
  senior: {
    label: "Senior",
    emoji: "⭐",
    color: "#F5A623",
    description: "Operatore esperto — daily drill opzionale, tutti gli scenari sbloccati.",
  },
  master: {
    label: "Master",
    emoji: "👑",
    color: "#8B5CF6",
    description: "Top performer — accesso a scenari avanzati e scoring boost.",
  },
};

const SENIOR_MIN_SESSIONS = 30;
const SENIOR_MIN_AVG = 70;
const SENIOR_WINDOW = 30;

const MASTER_MIN_SESSIONS = 100;
const MASTER_MIN_AVG = 80;
const MASTER_WINDOW = 50;

async function fetchRecentOveralls(userId, window) {
  // zrange rev=true: newest first
  const keys = await kv.zrange(`score_hist:user:${userId}`, 0, window - 1, { rev: true });
  if (!keys?.length) return [];
  const records = await Promise.all(keys.map((k) => kv.get(k)));
  return records
    .filter(Boolean)
    .map((r) => (typeof r.overall === "number" ? r.overall : null))
    .filter((v) => v !== null);
}

async function totalSessionCount(userId) {
  try {
    const count = await kv.zcard(`score_hist:user:${userId}`);
    return count || 0;
  } catch {
    return 0;
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Compute seniority for a given userId.
 * Returns { tier, auto, override, stats: { totalSessions, avgRecent30, avgRecent50 } }.
 */
export async function computeSeniority(userId) {
  if (!userId) {
    return { tier: "junior", auto: "junior", override: null, stats: { totalSessions: 0 } };
  }

  const override = await kv.get(`seniority:override:${userId}`);
  const total = await totalSessionCount(userId);

  const [recent30, recent50] = await Promise.all([
    fetchRecentOveralls(userId, SENIOR_WINDOW),
    fetchRecentOveralls(userId, MASTER_WINDOW),
  ]);

  const avg30 = Math.round(avg(recent30) * 10) / 10;
  const avg50 = Math.round(avg(recent50) * 10) / 10;

  let auto = "junior";
  if (total >= MASTER_MIN_SESSIONS && avg50 >= MASTER_MIN_AVG) {
    auto = "master";
  } else if (total >= SENIOR_MIN_SESSIONS && avg30 >= SENIOR_MIN_AVG) {
    auto = "senior";
  }

  const tier = TIERS.includes(override) ? override : auto;

  return {
    tier,
    auto,
    override: TIERS.includes(override) ? override : null,
    stats: {
      totalSessions: total,
      avgRecent30: avg30,
      avgRecent50: avg50,
      recentCount30: recent30.length,
      recentCount50: recent50.length,
    },
    thresholds: {
      senior: { minSessions: SENIOR_MIN_SESSIONS, minAvg: SENIOR_MIN_AVG, window: SENIOR_WINDOW },
      master: { minSessions: MASTER_MIN_SESSIONS, minAvg: MASTER_MIN_AVG, window: MASTER_WINDOW },
    },
  };
}

export async function setSeniorityOverride(userId, tier) {
  if (!userId) throw new Error("userId required");
  if (tier === null || tier === undefined || tier === "") {
    await kv.del(`seniority:override:${userId}`);
    return { cleared: true };
  }
  if (!TIERS.includes(tier)) throw new Error(`Invalid tier: ${tier}`);
  await kv.set(`seniority:override:${userId}`, tier);
  return { tier };
}
