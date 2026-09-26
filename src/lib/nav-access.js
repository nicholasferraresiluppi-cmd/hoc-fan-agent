/**
 * Menu per ruolo (25/09/2026): quale permesso serve perché una voce del menu
 * FUNZIONI davvero. Mappa ricavata leggendo, per ogni pagina, il controllo della
 * sua API principale (authorize / authorizeAll / authorizeAdmin / solo login).
 * Prima il menu mostrava tutto a tutti: un operatore vedeva ~57 voci che poi
 * rispondevano "non hai il permesso". Aggiungendo una pagina al menu, aggiungila
 * anche qui (senza voce = visibile a tutti).
 */
const SCOPE_RANK = { own: 1, team: 2, all: 3 };
const all = (cap) => ({ type: "cap", cap, scope: "all" });
const any = (cap) => ({ type: "cap", cap, scope: "any" });
const SEED = any("seed");

export const NAV_ACCESS = {
  "/admin": all("scores.view"),
  "/admin/alerts": all("scores.view"),
  "/me/turno": any("copilot.pilot"),
  "/leaderboard/sales-cp": all("scores.view"), "/leaderboard/creators": all("scores.view"), "/leaderboard/creators/heatmap": all("scores.view"),
  "/admin/conversation-intelligence": all("scores.view"), "/admin/shift-quality": all("scores.view"), "/admin/sales-coaching": all("scores.view"),
  "/admin/payout-tree": all("scores.view"), "/admin/qa-reviews": all("scores.view"), "/admin/loop": all("scores.view"),
  "/admin/priority-queue": all("scores.view"), "/admin/disputes": all("scores.view"),
  "/admin/pnl-live": SEED, "/admin/profiles-compare": SEED, "/admin/comp-calendar": SEED, "/admin/threshold-study": SEED,
  "/admin/comp-review": SEED, "/admin/comp-exam": SEED, "/admin/payment-profiles": SEED, "/admin/shift-research": SEED,
  "/admin/academy-tapes": SEED, "/admin/academy-signals": SEED, "/admin/creator-difficulty": SEED, "/admin/ads": SEED, "/admin/social-accounts": SEED, "/admin/social-proxies": SEED, "/admin/operator-signals": SEED, "/admin/activation": SEED,
  "/admin/infloww-ingest": SEED, "/admin/roadmap": SEED, "/admin/candidate-assessments": SEED, "/admin/action-center": SEED,
  "/admin/coaching-center": SEED, "/admin/employee-profiles": SEED, "/admin/creatorspro-sync": SEED, "/admin/wage-audit": SEED,
  "/admin/creatorspro-sync-history": SEED, "/admin/infloww-agency": SEED, "/admin/infloww-revenue": SEED, "/admin/infloww-reconcile": SEED,
  "/admin/debug-mapping": SEED, "/admin/user-mapping": SEED, "/admin/leaderboard-exclusions": SEED, "/admin/group-languages": SEED,
  "/admin/group-categories": SEED, "/admin/leaderboard-import": SEED, "/admin/leaderboard-settings": SEED,
  "/admin/score-config-history": SEED, "/admin/score-config-drafts": SEED, "/admin/seed": SEED,
  "/admin/review": any("review"), "/admin/sessions": any("review"), "/admin/outcomes": any("outcomes.write"),
  "/admin/dashboard": any("analytics.view"), "/cm-cockpit": any("cm.cockpit"),
  "/admin/coaching-sessions": { type: "cap", cap: "scores.view", scope: "team" },
  "/admin/team": any("access.mgmt"), "/admin/access": any("access.mgmt"), "/admin/ruoli": any("access.mgmt"), "/admin/ruoli-custom": any("access.mgmt"),
  "/admin/seniority": any("seniority.override"),
  "/admin/utilizzo": { type: "admin" },
};

/** La voce `href` funziona per chi ha queste capability? */
export function canSee(href, caps, isAdmin) {
  const req = NAV_ACCESS[href];
  if (!req || req.type === "any") return true;
  if (isAdmin) return true;
  if (req.type === "admin") return false;
  const scope = caps?.[req.cap];
  if (!scope) return false;
  if (req.scope === "any") return true;
  return (SCOPE_RANK[scope] || 0) >= (SCOPE_RANK[req.scope] || 0);
}
