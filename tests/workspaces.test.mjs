// Mansioni (lib/workspaces): menu per lavoro, permessi invariati.
import { WORKSPACES, WORKSPACE_IDS, isWorkspaceId, defaultWorkspace, workspaceSections, workspaceHrefs } from "../src/lib/workspaces.js";
import { canSee } from "../src/lib/nav-access.js";
import ROUTES from "../src/lib/app-routes.generated.json" with { type: "json" };
let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : (ko++, console.log("FAIL", name)); };

t("id validi", WORKSPACE_IDS.every(isWorkspaceId) && !isWorkspaceId("x") && !isWorkspaceId(""));
t("admin senza scelta = tutto", defaultWorkspace({ admin: true, roles: ["sales_manager"] }) === "all");
t("SM = sales", defaultWorkspace({ roles: ["sales_manager"] }) === "sales");
t("team lead = sales", defaultWorkspace({ roles: ["operator", "team_lead"] }) === "sales");
t("operatore = nessuna", defaultWorkspace({ roles: ["operator"] }) === null);
t("vuoto = nessuna", defaultWorkspace() === null);

// ogni voce di ogni mansione è una pagina che esiste
const routes = new Set(Array.isArray(ROUTES) ? ROUTES : Object.keys(ROUTES));
for (const id of WORKSPACE_IDS) for (const h of workspaceHrefs(id)) t(`esiste ${h}`, routes.size === 0 || routes.has(h));
t("tutto = nessuna voce", workspaceHrefs("all").size === 0);
t("home dentro la mansione", ["board", "sales", "hr"].every((id) => workspaceHrefs(id).has(WORKSPACES[id].home)));
t("menu corti (≤ 14)", ["board", "sales", "hr"].every((id) => workspaceHrefs(id).size <= 14));

// i permessi filtrano: un team lead (scope team, non tutte le creator) non vede le pagine di tutta l'agenzia
const teamLead = { "scores.view": "team" };
const allowed = (h) => canSee(h, teamLead, false);
const sales = workspaceSections("sales", allowed).flatMap((s) => s.items.map((i) => i.href));
t("TL vede Da seguire", sales.includes("/admin/settimana"));
t("TL vede Presidio chat (filtrato per creator)", sales.includes("/admin/conversation-intelligence"));
t("TL non vede Alert", !sales.includes("/admin/alerts"));
t("TL non vede Mappa", !sales.includes("/leaderboard/creators/heatmap"));
t("sezioni vuote tolte", workspaceSections("hr", allowed).length === 0);
t("mansione ignota = vuota", workspaceSections("boh").length === 0);

console.log(`${ok} ok, ${ko} fail`);
process.exit(ko ? 1 : 0);
