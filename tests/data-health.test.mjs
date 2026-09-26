import { shiftsByCreator, creatorDrops, monthShrink, unmappedSales, dayHoles } from "../src/lib/data-health-core.js";
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log("FAIL", n)); };
const w = [{ shifts: [{ creator_aliases: ["A"] }, { creator_aliases: ["A", "B"] }, { creator_aliases: ["A", "A"] }] }];
const s = shiftsByCreator(w);
t("conteggio turni", s.A === 3 && s.B === 1);
// caso Sparagno: agosto a metà sync → 1 turno contro 115 di luglio
const d1 = creatorDrops({ current: { Sparagno: 1, Gaja: 120 }, previous: { Sparagno: 115, Gaja: 118 }, isCurrentMonth: false });
t("sparagno segnalata", d1.length === 1 && d1[0].creator === "Sparagno");
// mese corrente al giorno 10: atteso proporzionato
const d2 = creatorDrops({ current: { A: 30 }, previous: { A: 90 }, dayOfMonth: 10, daysInMonth: 30, isCurrentMonth: true });
t("proporzionato ok", d2.length === 0);
const d3 = creatorDrops({ current: { A: 2 }, previous: { A: 90 }, dayOfMonth: 10, daysInMonth: 30, isCurrentMonth: true });
t("proporzionato segnala", d3.length === 1 && d3[0].expected === 30);
t("creator piccola ignorata", creatorDrops({ current: {}, previous: { X: 10 }, isCurrentMonth: false }).length === 0);
t("creator sparita segnalata", creatorDrops({ current: {}, previous: { X: 60 }, isCurrentMonth: false })[0].current === 0);
t("shrink", monthShrink({ currentCount: 300, previousCount: 621 }).ratio === 0.48);
t("no shrink", monthShrink({ currentCount: 600, previousCount: 621 }) === null);
t("pochi dati → niente", monthShrink({ currentCount: 1, previousCount: 20 }) === null);
const us = unmappedSales([
  { member_id: 1, member_name: "Anna", total_attributed_from_takes: 900, total_worked_shifts: 10 },
  { member_id: 2, member_name: "Dasio", total_attributed_from_takes: 100, total_worked_shifts: 3 },
  { member_id: 3, member_name: "Zero", total_attributed_from_takes: 0 },
  { member_id: 2, member_name: "Dasio", total_attributed_from_takes: 50, total_worked_shifts: 1 },
], { 1: "Anna B" });
t("unmapped totale e quota", us.total === 1050 && us.unmapped === 150 && Math.abs(us.share - 150 / 1050) < 1e-9);
t("unmapped per persona sommato, zero escluso", us.people.length === 1 && us.people[0].sales === 150 && us.people[0].shifts === 4);
t("unmapped vuoto robusto", unmappedSales(null, null).share === 0);
const fut = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const sf = shiftsByCreator([{ shifts: [{ started_at: past, creator_aliases: ["A"] }, { started_at: fut, creator_aliases: ["A"] }] }]);
t("turni futuri esclusi", sf.A === 1);
const mkDay = (d, v) => ({ shifts: [{ started_at: `2026-07-${String(d).padStart(2,"0")}T10:00:00Z`, total_attributed: v }] });
const jul = []; for (let d = 1; d <= 31; d++) jul.push(mkDay(d, d >= 20 && d <= 26 ? 500 : 70000));
const holes = dayHoles(jul, "2026-07");
t("buchi 20-26 luglio trovati", holes.length === 7 && holes[0].day === "2026-07-20");
const jul2 = jul.filter((_, i) => i !== 4); // manca il 5
t("giorno mancante trovato", dayHoles(jul2, "2026-07").some((h) => h.day === "2026-07-05"));
t("mese in corso: oltre lastFullDay ignorato", dayHoles(jul.slice(0, 10), "2026-07", { lastFullDay: "2026-07-10" }).length === 0);
console.log(`${ok} ok / ${ko} failed`); if (ko) process.exit(1);
