import { matchRoute, buildUsageReport, lastDays } from "../src/lib/usage-core.js";
import ROUTES from "../src/lib/app-routes.generated.json" with { type: "json" };
let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : (ko++, console.log("FAIL", name)); };

t("statica", matchRoute("/admin/ruoli", ROUTES) === "/admin/ruoli");
t("dinamica", matchRoute("/leaderboard/creators/Elisa%20Esposito%20-%20IT", ROUTES) === "/leaderboard/creators/[alias]");
t("query ignorata", matchRoute("/leaderboard/creators?period_id=2026-09", ROUTES) === "/leaderboard/creators");
t("slash finale", matchRoute("/admin/", ROUTES) === "/admin");
t("root", matchRoute("/", ROUTES) === "/");
t("inesistente", matchRoute("/nonesiste/davvero/proprio", ROUTES) === null);
t("statica batte dinamica", matchRoute("/admin/utilizzo", ROUTES) === "/admin/utilizzo");

const now = Date.parse("2026-09-25T12:00:00Z");
const d = lastDays(60, now);
const days = Object.fromEntries(d.map((x) => [x, {}]));
days[d[59]] = { "u1\t/admin": 3, "u2\t/admin": 1, "u1\t/admin/ruoli": 1 };
days[d[58]] = { "u1\t/admin": 2 };
days[d[40]] = { "u3\t/leaderboard/sales-cp": 1 };      // 19 gg fa
days[d[10]] = { "u2\t/admin": 5 };                     // periodo precedente
const members = [
  { userId: "u1", name: "Uno", email: "a@x" },
  { userId: "u2", name: "Due", email: "b@x" },
  { userId: "u3", name: "Tre", email: "c@x" },
  { userId: "u4", name: "Quattro", email: "d@x" },       // mai entrato
];
const nav = [{ href: "/admin", label: "Hub", group: "X" }, { href: "/admin/ruoli", label: "Membri", group: "P" }, { href: "/admin/alerts", label: "Alert", group: "X" }];
const r = buildUsageReport({ days, members, nav, now, window: 30 });
t("attivi 7g", r.kpi.active_7d === 2);
t("attivi 30g", r.kpi.active_30d === 3);
t("aperture", r.kpi.views_30d === 8);
t("pagina top per persone", r.pages[0].page === "/admin" && r.pages[0].users === 2);
t("confronto periodo prima", r.pages[0].prev_users === 1);
t("mai aperte", r.never_opened.length === 1 && r.never_opened[0].href === "/admin/alerts");
t("giorni attivi u1", r.people.find((p) => p.userId === "u1").active_days === 2);
t("stickiness", r.kpi.avg_active_days === Math.round((2 + 1 + 1) / 3 * 10) / 10);
t("insight mai entrato", r.insights.some((i) => /mai entrat/.test(i.title)));
t("insight dormiente", r.insights.some((i) => /non torna|non tornano/.test(i.title)));
t("insight mai aperte", r.insights.some((i) => /mai aperte/.test(i.title)));
t("daily lunghezza", r.daily.length === 30 && r.daily[29].users === 2);
const empty = buildUsageReport({ days: {}, members, nav, now });
t("vuoto → insight informativo", empty.insights.length === 1 && empty.insights[0].kind === "info");
console.log(`${ok} ok / ${ko} failed`); if (ko) process.exit(1);
