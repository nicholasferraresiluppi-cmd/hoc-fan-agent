// Venduto ufficiale + confronto allo stesso giorno (lib/agency-sales-core).
import { agencySales, compareUntilDay, dataWarnings, pctDelta, romeDay, shiftSalesByAlias } from "../src/lib/agency-sales-core.js";
let ok = 0, ko = 0;
const t = (name, cond) => { cond ? ok++ : (ko++, console.log("FAIL", name)); };

const sh = (day, takes, extra = {}) => ({ started_at: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`, takes, creator_aliases: [...new Set(takes.map((x) => x.creator_alias))], ...extra });
const wages = [
  { member_id: 1, shifts: [sh(1, [{ creator_alias: "Gaja - IT", amount: 100 }]), sh(2, [{ creator_alias: "Gaja - IT", amount: 50 }, { creator_alias: "Eva - EN", amount: 25 }])] },
  { member_id: 2, shifts: [sh(3, [{ creator_alias: "Eva - EN", amount: 200 }]), sh(3, [], { creator_aliases: ["Eva - EN"], total_attributed: 40 })] },
  { member_id: 3, shifts: [sh(2, [{ creator_alias: "Gaja - IT", amount: 0 }])] }, // turno a zero: non conta
];
const all = agencySales(wages, { periodId: "2026-10" });
t("totale = somma quote + mono", all.sales === 415);
t("turni con venduto", all.shifts === 4);
t("operatori con venduto", all.operators === 2);
t("creator", all.creators === 2);
t("ultimo giorno", all.lastDay === 3);
t("fino al giorno 2", agencySales(wages, { periodId: "2026-10", untilDay: 2 }).sales === 175);
t("filtro creator", agencySales(wages, { periodId: "2026-10", allow: (a) => a.startsWith("Eva") }).sales === 265);
t("mono senza takes", shiftSalesByAlias({ creator_aliases: ["X"], total_attributed: 9 }).get("X") === 9);
t("multi senza takes = niente", shiftSalesByAlias({ creator_aliases: ["X", "Y"], total_attributed: 9 }).size === 0);
t("vuoto", agencySales(null).sales === 0);

t("ora di Roma: 23:30 UTC del 30/9 è già 1/10", romeDay("2026-09-30T23:30:00Z") === "2026-10-01");
t("mese passato = intero", compareUntilDay("2026-09", "2026-10-03", 30) === null);
t("ieri", compareUntilDay("2026-10", "2026-10-03", 3) === 2);
t("non oltre i dati", compareUntilDay("2026-10", "2026-10-20", 12) === 12);
t("il primo del mese", compareUntilDay("2026-10", "2026-10-01", 0) === 0);

const al = [
  { fingerprint: "cp-day-holes:2026-09", status: "open", title: "buchi" },
  { fingerprint: "cp-day-holes:2026-05", status: "open", title: "vecchio" },
  { fingerprint: "cp-sync-stale", status: "ack", title: "sync" },
  { fingerprint: "fee-config", status: "open", title: "fee" },
  { fingerprint: "wage-gap:2026-10", status: "resolved", title: "chiuso" },
];
const w = dataWarnings(al, ["2026-10", "2026-09"]).map((x) => x.fingerprint);
t("warning del mese prima", w.includes("cp-day-holes:2026-09"));
t("niente mesi vecchi", !w.includes("cp-day-holes:2026-05"));
t("globali presi", w.includes("cp-sync-stale"));
t("non-dati esclusi", !w.includes("fee-config"));
t("risolti esclusi", !w.includes("wage-gap:2026-10"));
t("delta", pctDelta(110, 100) === 10 && pctDelta(1, 0) === null);

console.log(`${ok} ok, ${ko} fail`);
process.exit(ko ? 1 : 0);
