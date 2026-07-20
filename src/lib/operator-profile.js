/**
 * Profilo operatore persistito (`profile:{userId}`).
 *
 * Prima della PR "academy-fondamenta" l'aggiornamento del profilo era rotto:
 * il client mandava `{skills, xpEarned}` ma il route pretendeva
 * `{scenarioId, scores, stars}` con una dimensione `retention` che lo scorer
 * non emette più → 400 fisso, XP/livello mai salvati. Qui la logica vive in un
 * solo posto, allineata alle 6 dimensioni reali dello scoring v3, e viene
 * chiamata server-side da /api/score (atomica col punteggio, come score_hist).
 */
import { kv } from "@vercel/kv";

// Le 6 dimensioni reali dello score v3 (cfr SKILL_DIMENSIONS in training-scenarios.js).
export const PROFILE_DIMENSIONS = [
  "naturalezza",
  "esclusivita",
  "dipendenza",
  "conversione",
  "tono",
  "gestione_obiezioni",
];

export function emptyProfile(userId) {
  const skillDimensions = {};
  for (const d of PROFILE_DIMENSIONS) {
    skillDimensions[d] = { average: 0, count: 0 };
  }
  return {
    userId,
    operatorName: "",
    level: 1,
    xp: 0,
    skillDimensions,
    recentActivity: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Applica il risultato di una sessione al profilo (read-modify-write su KV).
 * Media pesata 70% storico / 30% nuovo per dimensione; XP cumulativo; livello
 * ogni 500 XP. Difensivo su dimensioni/campi mancanti (schema evolutivo).
 */
export async function applyScoreToProfile(
  userId,
  { scenarioId = null, skills = {}, xp = 0, stars = 0 } = {}
) {
  let profile = await kv.get(`profile:${userId}`);
  if (!profile) profile = emptyProfile(userId);
  if (!profile.skillDimensions) profile.skillDimensions = {};
  if (!Array.isArray(profile.recentActivity)) profile.recentActivity = [];

  for (const d of PROFILE_DIMENSIONS) {
    const val = skills?.[d];
    if (typeof val !== "number") continue;
    const cur = profile.skillDimensions[d] || { average: 0, count: 0 };
    if (!cur.count) {
      cur.average = val;
      cur.count = 1;
    } else {
      cur.average = cur.average * 0.7 + val * 0.3;
      cur.count += 1;
    }
    profile.skillDimensions[d] = cur;
  }

  const gained = typeof xp === "number" && xp > 0 ? xp : 0;
  profile.xp = (profile.xp || 0) + gained;
  profile.level = Math.floor(profile.xp / 500) + 1;

  profile.recentActivity.unshift({
    scenarioId,
    skills,
    xp: gained,
    stars: typeof stars === "number" ? stars : 0,
    timestamp: new Date().toISOString(),
  });
  if (profile.recentActivity.length > 20) {
    profile.recentActivity = profile.recentActivity.slice(0, 20);
  }
  profile.updatedAt = new Date().toISOString();

  await kv.set(`profile:${userId}`, profile);
  return profile;
}
