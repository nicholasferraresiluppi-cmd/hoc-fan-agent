import { kv } from "@vercel/kv";
import { CREATOR_PERSONAS } from "@/lib/creator-personas";

/**
 * Certifications per creator.
 *
 * Un operatore si certifica su una specifica creator accumulando sessioni
 * di qualità con quella creator. Badge permanenti (una volta raggiunto un livello
 * non si perde).
 *
 * Livelli:
 *   L1 Base   — >=10 sessioni con quel creator && overall medio >=65
 *   L2 Expert — >=25 sessioni con quel creator && overall medio >=75
 *   L3 Master — >=50 sessioni con quel creator && overall medio >=85
 *
 * Compliance (arco Academy PR4): una violazione delle righe rosse negli ultimi
 * 90gg CONGELA l'avanzamento di livello — stessa logica del fail compliance che
 * congela le promozioni sul vivo (qa-reviews §8.1). Il badge già conseguito resta
 * (permanente, no downgrade) ma viene flaggato (`compliance_ok=false`).
 *
 * Persistenza: ogni volta che computiamo la certificazione e supera un livello,
 * salviamo la data di achievement su KV `cert:{userId}:{creatorId}` = { level, achievedAt, stats }.
 * In questo modo il badge resta anche se la media cala.
 */

export const CERT_LEVELS = [
  { level: 0, label: "Nessuna", emoji: "", color: "#666" },
  { level: 1, label: "L1 Base", emoji: "🥉", color: "#CD7F32", minSessions: 10, minAvg: 65 },
  { level: 2, label: "L2 Expert", emoji: "🥈", color: "#C0C0C0", minSessions: 25, minAvg: 75 },
  { level: 3, label: "L3 Master", emoji: "🥇", color: "#FFD700", minSessions: 50, minAvg: 85 },
];

export function getCertMeta(level) {
  return CERT_LEVELS.find((c) => c.level === level) || CERT_LEVELS[0];
}

async function fetchUserCreatorSessions(userId, creatorId) {
  // Leggiamo TUTTE le history dell'utente (zset rev); filtriamo per creatorId.
  const keys = (await kv.zrange(`score_hist:user:${userId}`, 0, 999, { rev: true })) || [];
  if (!keys.length) return [];
  const records = (await Promise.all(keys.map((k) => kv.get(k)))).filter(Boolean);
  return records.filter((r) => r?.creatorId === creatorId && typeof r.overall === "number");
}

function computeLevel(sessions, avgOverall) {
  for (let i = CERT_LEVELS.length - 1; i >= 1; i--) {
    const tier = CERT_LEVELS[i];
    if (sessions >= tier.minSessions && avgOverall >= tier.minAvg) return tier.level;
  }
  return 0;
}

/**
 * Compute + persist certification level per creator.
 * Non downgrade: se già conseguito L2 e ora scende, resta L2 (badge permanente).
 */
const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;

export async function computeCertificationForCreator(userId, creatorId) {
  if (!userId || !creatorId) return null;

  const sessions = await fetchUserCreatorSessions(userId, creatorId);
  const count = sessions.length;
  const avgOverall = count ? Math.round((sessions.reduce((s, r) => s + r.overall, 0) / count) * 10) / 10 : 0;

  // Compliance: violazioni delle righe rosse negli ultimi 90gg. Le sessioni
  // pre-PR3 non hanno il campo compliance → trattate come pulite (default ok).
  const since = Date.now() - NINETY_DAYS_MS;
  const complianceFails = sessions.filter(
    (r) => r?.compliance && r.compliance.pass === false && (r.timestamp || 0) >= since
  ).length;
  const complianceOk = complianceFails === 0;

  const normalLevel = computeLevel(count, avgOverall);

  const saved = (await kv.get(`cert:${userId}:${creatorId}`)) || { level: 0, achievedAt: null };

  // Con una violazione recente NON si avanza di livello (freeze); il badge già
  // conseguito resta (permanente, no downgrade) ma viene flaggato.
  const liveLevel = complianceOk ? normalLevel : Math.min(normalLevel, saved.level || 0);

  let finalLevel = Math.max(saved.level || 0, liveLevel);
  let achievedAt = saved.achievedAt || null;

  if (complianceOk && liveLevel > (saved.level || 0)) {
    achievedAt = Date.now();
    const record = {
      userId,
      creatorId,
      level: liveLevel,
      achievedAt,
      stats: { sessions: count, avgOverall },
    };
    await kv.set(`cert:${userId}:${creatorId}`, record);
    // Index of achievements
    await kv.zadd("cert:index", { score: achievedAt, member: `${userId}:${creatorId}:${liveLevel}` });
    finalLevel = liveLevel;
  }

  return {
    creatorId,
    level: finalLevel,
    liveLevel,
    achievedAt,
    compliance_ok: complianceOk,
    compliance_fails: complianceFails,
    stats: { sessions: count, avgOverall },
    meta: getCertMeta(finalLevel),
  };
}

/**
 * Tutte le certification per un utente (una per creator persona).
 */
export async function getUserCertifications(userId) {
  if (!userId) return [];
  const out = [];
  for (const c of CREATOR_PERSONAS) {
    const cert = await computeCertificationForCreator(userId, c.id);
    if (cert) {
      out.push({ ...cert, creatorName: c.name, creatorArchetype: c.archetype });
    }
  }
  return out;
}
