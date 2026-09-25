import { shiftsByCreator, creatorDrops, monthShrink, unmappedSales } from "../src/lib/data-health-core.js";
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
console.log(`${ok} ok / ${ko} failed`); if (ko) process.exit(1);
