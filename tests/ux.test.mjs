import { buildUxReport } from "../src/lib/usage-core.js";
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log("FAIL", n)); };
const ux = {
  "2026-09-25": {
    "c\t/admin/ruoli\tAggiungi membro\tscorrendo|fondo": 7,
    "c\t/admin/ruoli\tAggiungi membro\tsubito|alto": 1,
    "c\t/admin/ruoli\tModifica ruoli\tsubito|alto": 9,
    "r\t/admin/ruoli\tSalva\t": 3,
    "e\t/admin\tCannot read x": 2,
    "s\t/admin\tsum": 150, "s\t/admin\tn": 5,
    "l\t/admin\tsum": 12000, "l\t/admin\tn": 3,
  },
};
const r = buildUxReport(ux, { "/admin/ruoli": { label: "Membri" }, "/admin": { label: "Hub" } });
const ruoli = r.pages.find((p) => p.page === "/admin/ruoli");
t("clic aggregati", ruoli.clicks.find((c) => c.label === "Aggiungi membro").count === 8);
t("quota sotto piega", ruoli.clicks.find((c) => c.label === "Aggiungi membro").below_share === 0.88);
t("insight tasto nascosto", r.insights.some((i) => /Aggiungi membro.*scorrere/.test(i.title)));
t("niente insight per tasto visibile", !r.insights.some((i) => /Modifica ruoli/.test(i.title)));
t("rage", r.insights.some((i) => /frustrazione/.test(i.title)));
t("errori", r.insights.some((i) => /2 errori su Hub/.test(i.title)));
t("lenta", r.insights.some((i) => /lenta/.test(i.title)));
t("scroll basso", r.insights.some((i) => /solo la parte alta/.test(i.title)));
t("warn prima di info", r.insights[0].kind === "warn");
const few = buildUxReport({ d: { "c\t/x\tTasto\tscorrendo|fondo": 2 } });
t("campione piccolo → niente", few.insights.length === 0);
console.log(`${ok} ok / ${ko} failed`); if (ko) process.exit(1);
