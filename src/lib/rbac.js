import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isUserIdAdmin } from "@/lib/admin";

/**
 * RBAC — Role-Based Access Control.
 *
 * 5 ruoli predefiniti (non editabili via UI in questa V8.0):
 *  - operator     — utente base (default). Vede i suoi score.
 *  - team_lead    — + dashboard del proprio team, review/outcomes del team.
 *  - sales_manager— + cross-team analytics, override score, creator management.
 *  - qa_reviewer  — solo review/correzione sessioni di tutti, no outcomes, no accessi.
 *  - admin        — tutto, incluso gestione accessi e seeding.
 *
 * Storage del ruolo: KV `role:{userId}` primario + Clerk publicMetadata.role mirror.
 * Chi è admin (via env/Clerk metadata/admins:set legacy) ottiene implicitamente ruolo "admin".
 *
 * Ogni capability ha anche uno scope: "all" | "team" | "own".
 */

export const ROLES = ["operator", "team_lead", "sales_manager", "qa_reviewer", "admin"];

export const ROLE_META = {
  operator: { label: "Operator", emoji: "💬", color: "#10B981", description: "Chatter in training — vede i suoi dati" },
  team_lead: { label: "Team Lead", emoji: "👥", color: "#3B82F6", description: "Lead del team — vede il suo team" },
  sales_manager: { label: "Sales Manager", emoji: "📈", color: "#F5A623", description: "SM — vede tutto, override score" },
  qa_reviewer: { label: "QA Reviewer", emoji: "🔍", color: "#8B5CF6", description: "Qualità — rivede e corregge sessioni" },
  admin: { label: "Admin", emoji: "🔐", color: "#EF4444", description: "Accesso totale + gestione ruoli" },
};

/**
 * Capabilities
 * Nome: "area.azione"
 * Scope implicito associato in ROLE_CAPABILITIES: "all" | "team" | "own".
 */
export const CAPABILITIES = {
  TRAINING_DO: "training.do",                 // fare sessioni + vedere i propri score
  SCORES_VIEW: "scores.view",                 // vedere score di altri
  SCORES_OVERRIDE: "scores.override",         // correggere/overridare score
  REVIEW: "review",                           // accedere alla review di sessioni
  OUTCOMES_WRITE: "outcomes.write",           // inserire revenue reali
  ANALYTICS_VIEW: "analytics.view",           // vedere dashboard SM/analytics
  CREATORS_MANAGE: "creators.manage",         // vedere/editare persona creator
  SEED: "seed",                               // seed demo data
  ACCESS_MGMT: "access.mgmt",                 // gestire admin/ruoli
  SENIORITY_OVERRIDE: "seniority.override",   // override tier seniority
  LEAGUES_SNAPSHOT: "leagues.snapshot",       // forzare snapshot leghe
  LEADERBOARD_SNAPSHOT: "leaderboard.snapshot", // forzare snapshot classifica
};

// "all" = tutta l'org | "team" = solo proprio team | "own" = solo sé stesso | "none" = nessun accesso
export const ROLE_CAPABILITIES = {
  operator: {
    [CAPABILITIES.TRAINING_DO]: "own",
    [CAPABILITIES.SCORES_VIEW]: "own",
  },
  team_lead: {
    [CAPABILITIES.TRAINING_DO]: "own",
    [CAPABILITIES.SCORES_VIEW]: "team",
    [CAPABILITIES.REVIEW]: "team",
    [CAPABILITIES.OUTCOMES_WRITE]: "team",
    [CAPABILITIES.ANALYTICS_VIEW]: "team",
  },
  sales_manager: {
    [CAPABILITIES.TRAINING_DO]: "own",
    [CAPABILITIES.SCORES_VIEW]: "all",
    [CAPABILITIES.SCORES_OVERRIDE]: "all",
    [CAPABILITIES.REVIEW]: "all",
    [CAPABILITIES.OUTCOMES_WRITE]: "all",
    [CAPABILITIES.ANALYTICS_VIEW]: "all",
    [CAPABILITIES.CREATORS_MANAGE]: "all",
    [CAPABILITIES.SENIORITY_OVERRIDE]: "all",
  },
  qa_reviewer: {
    [CAPABILITIES.TRAINING_DO]: "own",
    [CAPABILITIES.SCORES_VIEW]: "all",
    [CAPABILITIES.SCORES_OVERRIDE]: "all",
    [CAPABILITIES.REVIEW]: "all",
  },
  admin: {
    [CAPABILITIES.TRAINING_DO]: "own",
    [CAPABILITIES.SCORES_VIEW]: "all",
    [CAPABILITIES.SCORES_OVERRIDE]: "all",
    [CAPABILITIES.REVIEW]: "all",
    [CAPABILITIES.OUTCOMES_WRITE]: "all",
    [CAPABILITIES.ANALYTICS_VIEW]: "all",
    [CAPABILITIES.CREATORS_MANAGE]: "all",
    [CAPABILITIES.SEED]: "all",
    [CAPABILITIES.ACCESS_MGMT]: "all",
    [CAPABILITIES.SENIORITY_OVERRIDE]: "all",
    [CAPABILITIES.LEAGUES_SNAPSHOT]: "all",
    [CAPABILITIES.LEADERBOARD_SNAPSHOT]: "all",
  },
};

/**
 * Recupera il ruolo di un utente.
 * Priorità: isAdmin legacy -> KV role:{userId} -> Clerk publicMetadata.role -> "operator".
 */
export async function getUserRole(userId) {
  if (!userId) return "operator";
  try {
    if (await isUserIdAdmin(userId)) return "admin";
  } catch {}

  let role = await kv.get(`role:${userId}`);
  if (role && ROLES.includes(role)) return role;

  // Fallback Clerk
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(userId);
    const clerkRole = u?.publicMetadata?.role;
    if (clerkRole && ROLES.includes(clerkRole)) return clerkRole;
  } catch {}

  return "operator";
}

export async function setUserRole(userId, role) {
  if (!userId) throw new Error("userId required");
  if (!ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
  await kv.set(`role:${userId}`, role);
  // Mirror su Clerk
  try {
    const cc = await clerkClient();
    await cc.users.updateUser(userId, { publicMetadata: { role } });
  } catch (e) {
    console.warn("clerk role mirror failed:", e?.message);
  }
  return { userId, role };
}

/**
 * Team: 1 operatore = 1 team.
 */
export async function getUserTeam(userId) {
  if (!userId) return null;
  return (await kv.get(`team:${userId}`)) || null;
}

export async function setUserTeam(userId, teamId) {
  if (!userId) throw new Error("userId required");
  if (!teamId) {
    await kv.del(`team:${userId}`);
    return { userId, teamId: null };
  }
  await kv.set(`team:${userId}`, teamId);
  await kv.sadd(`team_members:${teamId}`, userId);
  return { userId, teamId };
}

export async function getTeamMembers(teamId) {
  if (!teamId) return [];
  return (await kv.smembers(`team_members:${teamId}`)) || [];
}

/**
 * Returns scope a user has for a capability: "all" | "team" | "own" | null.
 */
export async function getScope(userId, capability) {
  if (!userId) return null;
  const role = await getUserRole(userId);
  const caps = ROLE_CAPABILITIES[role] || {};
  return caps[capability] || null;
}

/**
 * can(userId, capability, targetUserId?) — true/false check.
 * Se targetUserId è fornito, verifica che lo scope copra quell'utente:
 *  - "all" -> sempre true
 *  - "team" -> true solo se userId e targetUserId hanno stesso team
 *  - "own" -> true solo se userId === targetUserId
 */
export async function can(userId, capability, targetUserId = null) {
  const scope = await getScope(userId, capability);
  if (!scope) return false;
  if (!targetUserId) return true; // generic access check
  if (scope === "all") return true;
  if (scope === "own") return userId === targetUserId;
  if (scope === "team") {
    const [a, b] = await Promise.all([getUserTeam(userId), getUserTeam(targetUserId)]);
    return !!a && a === b;
  }
  return false;
}

/**
 * Shorthand: user corrente.
 */
export async function meCan(capability, targetUserId = null) {
  const { userId } = await auth();
  if (!userId) return false;
  return can(userId, capability, targetUserId);
}

export async function myRole() {
  const { userId } = await auth();
  if (!userId) return null;
  return getUserRole(userId);
}
