// Unit test — split-core. Esegui: node tests/split.mjs
// Il caso grosso rifà il foglio "Team & Stipendi" di agosto 2026 di Nicholas al centesimo.
import assert from "node:assert/strict";
import { computeSplitMonth, personCost, activeIn, sanitizeConfig, sanitizeMonthInput, sanitizePerson, chatterFromWages, applyBusteExclusions } from "../src/lib/split-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };
let k = 0; const id = () => `x_${(k++).toString().padStart(4, "0")}`;
const close = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const P = (x) => sanitizePerson(x, id);

t("attivo nel mese", () => {
  assert.equal(activeIn({}, "2026-10"), true);
  assert.equal(activeIn({ from: "2026-12" }, "2026-10"), false);
  assert.equal(activeIn({ to: "2026-08" }, "2026-09"), false);
});
t("commissione con tetto: 10% fino a 100k", () => assert.equal(personCost(P({ pctText: "10%", capUsd: 100000 }), 150000, 0.86).eur, 8600));
t("minimo € vince se la % è più bassa", () => { const c = personCost(P({ pctText: "5%", min: 1000 }), 10000, 0.9); assert.equal(c.eur, 1000); assert.equal(c.minApplied, true); });
t("minimo in $ convertito al cambio", () => assert.equal(personCost(P({ pctText: "2,5% > 100k", min: 2000, minCur: "USD" }), 40000, 0.86).eur, 1720));
t("sales manager: sopra soglia vince la %", () => assert.equal(personCost(P({ pctText: "3% > 80k; 3,5% > 100k", min: 2200 }), 110000, 0.86).eur, 3311));
t("fisso + % si sommano (Eleonora: 2000 fisso più punti)", () => assert.equal(personCost(P({ fixedEur: 2000, pctText: "10%" }), 10000, 1).eur, 3000));

// ── Agosto 2026 dal foglio ──
// fee implicita nel foglio = Fee Agosto $ / Generato (Anastasia e Chiaretta: fee 5000$ stimata senza revenue)
const sheet = [
  ["Alessandra Sparagno", 51235.85, 30741, 9222.453], ["Anastasia", 5000, 5000, 0], ["Chiaretta", 5000, 5000, 0], ["Cubanita", 50000, 27500, 9000],
  ["Elisa Vimercati", 29919.45, 11967, 5385.501], ["Fishball", 171343, 77104, 30841.74], ["Giulia Amici", 9503.79, 5702, 1710.6822],
  ["Giulia Ottorini", 138280.27, 41484, 24890.4486], ["Martina Scavo", 45027.05, 27016, 8104.869], ["Michela Mucciante", 27157.53, 13578, 4888.3554],
  ["Rebecca Bardaro", 26550, 17866, 4779], ["Stormy", 26650.54, 13325, 4797.0972], ["Cristina Bertevello", 24074.47, 8426, 4333.4046],
];
const teams = [...sheet.map(([name, gen, fee], i) => ({ id: `t_${String(i).padStart(4, "0")}`, name, creator: name, dealText: `${(fee / gen) * 100}% flat` })), { id: "t_mbfi", name: "MB / Finance e altro" }];
const T = Object.fromEntries(teams.map((x) => [x.name, x.id]));
const on = (...names) => names.map((x) => T[x]);
const people = [
  { person: "Fred Iyamu", role: "SMM", fixedEur: 1500, teamIds: on("Alessandra Sparagno", "Michela Mucciante") },
  { person: "Alessio Sparagno", role: "Publisher", fixedEur: 720, teamIds: on("Alessandra Sparagno") },
  { person: "Marco Bove", role: "Sales Manager", fixedEur: 3000, teamIds: on("Alessandra Sparagno") },
  { person: "Christian Lauriola", role: "SMM", fixedEur: 1000, teamIds: on("Anastasia") },
  { person: "Giovanna Frusciante", role: "Project Manager", fixedEur: 3000, teamIds: on("Anastasia", "Cubanita", "Michela Mucciante") },
  { person: "Veronica Germanà", role: "CM Sr", fixedEur: 2000, teamIds: on("Anastasia", "Michela Mucciante") },
  { person: "Erika Graziano", role: "CM Jr", fixedEur: 1000, teamIds: on("Anastasia") },
  { person: "Ciro Barone", role: "Sales Manager", fixedEur: 2000, teamIds: on("Chiaretta", "Elisa Vimercati") },
  { person: "Eleonora De Cristofaro", role: "CM Sr", fixedEur: 2000, teamIds: on("Cubanita", "Stormy") },
  { person: "Giorgia Rossi", role: "CM Jr", fixedEur: 1000, teamIds: on("Cubanita") },
  { person: "Ginevra", role: "SMM", fixedEur: 2000, teamIds: on("Elisa Vimercati") },
  ...[["Greta Susa Costa", 1600], ["Costanza Russo", 750], ["Alessia Langiano", 1000], ["Alessandro Dina", 1500], ["Michael Levato", 3000], ["", 2500]].map(([person, fixedEur]) => ({ person, role: "Fishball", fixedEur, teamIds: on("Fishball") })),
  { person: "Max Scirocco", role: "SMM", pctText: "10%", capUsd: 30000, teamIds: on("Giulia Amici") },
  { person: "Antonio Marucci", role: "Sales Manager", fixedEur: 2205, teamIds: on("Giulia Amici", "Martina Scavo", "Rebecca Bardaro") },
  { person: "Ilaria Maggio", role: "Sales Manager", fixedEur: 2000, teamIds: on("Giulia Ottorini") },
  { person: "Daniele Madella", role: "SMM", pctText: "15%", teamIds: on("Martina Scavo") },
  { person: "Grazia Fragasso", role: "Publisher", fixedEur: 1510, teamIds: on("Michela Mucciante") },
  { person: "Luis Fernando Aguilar Escobar", role: "CM Jr", fixedEur: 1000, teamIds: on("Michela Mucciante") },
  { person: "Daniele Madella", role: "SMM", pctText: "10%", capUsd: 100000, teamIds: on("Rebecca Bardaro") },
  { person: "Martina Zeli", role: "CM Jr", fixedEur: 1000, teamIds: on("Stormy") },
  ...[["Clizia Pia Pettinicchio", 1800], ["Fabio Sarnataro", 2500], ["Andrea Del Signore", 1800], ["Manuela Giovinazzo", 200]].map(([person, fixedEur]) => ({ person, role: "Academy", fixedEur, teamIds: on("Cristina Bertevello") })),
  ...[["Gaia Esposito", 7000], ["Asja Ferraresi Luppi", 4200], ["Nicholas Ferraresi Luppi", 7000], ["Martina Tidona", 3000], ["Alessia Negrelli", 1800], ["CreatorsPro", 3500]].map(([person, fixedEur]) => ({ person, fixedEur, teamIds: ["t_mbfi"] })),
];
const config = sanitizeConfig({ teams, people }, id);
const month = { month: "2026-08", ...sanitizeMonthInput({ fx: { rate: 0.86 }, teams: Object.fromEntries(sheet.map(([name, gen, , chat]) => [T[name], { revenueUsd: gen, chatterUsd: chat }])) }, id) };
const r = computeSplitMonth(config, month);
const team = (name) => r.teams.find((x) => x.name === name);
t("agosto: fee $ come il foglio", () => close(r.totals.feeUsd, 284709, 0.1));
t("agosto: fee € = 244.849,74", () => close(r.totals.feeEur, 244849.74, 0.1));
t("agosto: stipendi = 78.994,12 (Max/Madella compresi)", () => close(r.totals.staffEur, 78994.12, 0.05));
t("agosto: chatter = 107.953,55$ × 0,86", () => close(r.totals.chatterEur, 92840.05, 0.05));
t("agosto: netto = 73.015,57", () => close(r.totals.netEur, 73015.57, 0.2));
t("divisione in parti uguali come il foglio: Antonio 735 per team", () => close(team("Rebecca Bardaro").members.find((x) => x.person === "Antonio Marucci").eur, 735, 0.001));
t("stipendi per team come il riepilogo: Michela 5.260", () => close(team("Michela Mucciante").staffEur, 5260, 0.01));
t("Daniele su Martina: 15% × 45.027,05$ × 0,86", () => close(team("Martina Scavo").members.find((x) => x.person === "Daniele Madella").eur, 5808.49, 0.01));
t("persona con due accordi: Daniele in totale", () => close(r.people.find((p) => p.person === "Daniele Madella").eur, 5808.49 + 2283.3, 0.02));

t("sales manager su più creator: % sulla somma, costo diviso", () => {
  const c = sanitizeConfig({ teams: [{ id: "a_0001", name: "A", creator: "A", dealText: "60% flat" }, { id: "b_0001", name: "B", creator: "B", dealText: "60% flat" }],
    people: [{ person: "Antonio", pctText: "3% > 80k", min: 2200, teamIds: ["a_0001", "b_0001"], alloc: "revenue" }] }, id);
  const x = computeSplitMonth(c, { month: "2026-10", fx: { rate: 1 }, teams: { a_0001: { revenueUsd: 60000 }, b_0001: { revenueUsd: 30000 } } });
  assert.equal(x.deals[0].cost.eur, 2700); // 3% × 90k
  assert.equal(x.teams[0].members[0].eur, 1800); assert.equal(x.teams[1].members[0].eur, 900);
});
t("accordo a tempo: +500 solo ottobre-novembre", () => {
  const c = sanitizeConfig({ teams: [{ id: "a_0001", name: "Fishball" }], people: [{ person: "Michael", fixedEur: 500, from: "2026-10", to: "2026-11", teamIds: ["a_0001"] }] }, id);
  assert.equal(computeSplitMonth(c, { month: "2026-10", fx: { rate: 1 } }).totals.staffEur, 500);
  assert.equal(computeSplitMonth(c, { month: "2026-12", fx: { rate: 1 } }).totals.staffEur, 0);
});
t("extra del mese entrano nel netto", () => {
  const x = computeSplitMonth(config, { ...month, extras: [{ id: "e_0001", teamId: T.Cubanita, label: "token", person: "Eleonora", eur: 250 }, { id: "e_0002", teamId: "", label: "cena", eur: 100 }] });
  close(x.totals.netEur, r.totals.netEur - 350, 0.01);
  assert.equal(x.teams.find((y) => y.name === "Cubanita").extrasEur, 250);
});
t("team non ancora partito e suo costo restano fuori", () => {
  const c = sanitizeConfig({ teams: [{ id: "i_0001", name: "Irene", creator: "Irene", from: "2026-11" }], people: [{ person: "Manuela", fixedEur: 1000, teamIds: ["i_0001"] }] }, id);
  const x = computeSplitMonth(c, { month: "2026-10", fx: { rate: 1 } });
  assert.equal(x.teams.length, 0); assert.equal(x.totals.costEur, 0);
});
t("accordo senza team attivo nel mese: costo d'agenzia, non perso", () => {
  const c = sanitizeConfig({ teams: [], people: [{ person: "Nicholas", fixedEur: 100 }] }, id);
  assert.equal(computeSplitMonth(c, { month: "2026-10", fx: { rate: 1 } }).totals.costEur, 100);
});
t("problemi: revenue mancante", () => {
  const x = computeSplitMonth(config, { month: "2026-08", fx: { rate: 0.86 }, teams: {} });
  assert.ok(x.teams[0].problems.includes("revenue del mese non inserita"));
});
// ── Chatter busta per busta ──
const tw = [{ id: "a_0001", cpAliases: ["Ann - IT"] }, { id: "b_0001", cpAliases: ["Bea - IT", "Bea - EN"] }];
const sh = (earn, hours, takes, aliases) => ({ total_earnings: earn, worked_hours: hours, takes: takes.map(([a, amount]) => ({ creator_alias: a, amount })), creator_aliases: aliases || [...new Set(takes.map(([a]) => a))] });
t("busta su una modella: tutto a lei", () => {
  const r = chatterFromWages([{ member_name: "Op1", status: "PAID", total_wage: 100, shifts: [sh(100, 5, [["Ann - IT", 1000]])] }], tw);
  assert.equal(r.byTeam.a_0001.usd, 100); assert.equal(r.open, 0);
});
t("due modelle nello stesso turno: diviso per venduto", () => {
  const r = chatterFromWages([{ member_name: "Op2", status: "OPEN", total_wage: 90, shifts: [sh(90, 6, [["Ann - IT", 200], ["Bea - EN", 100]])] }], tw);
  assert.equal(r.byTeam.a_0001.usd, 60); assert.equal(r.byTeam.b_0001.usd, 30); assert.equal(r.open, 1);
  assert.equal(r.byTeam.a_0001.buste[0].shared, true);
});
t("turno senza vendite su due modelle: parti uguali", () => {
  const r = chatterFromWages([{ member_name: "Op3", status: "PAID", total_wage: 40, shifts: [sh(40, 4, [], ["Ann - IT", "Bea - IT"])] }], tw);
  assert.equal(r.byTeam.a_0001.usd, 20); assert.equal(r.byTeam.b_0001.usd, 20);
});
t("modella fuori dallo split: la sua parte non entra", () => {
  const r = chatterFromWages([{ member_name: "Op4", status: "PAID", total_wage: 100, shifts: [sh(50, 4, [["Ann - IT", 10]]), sh(50, 4, [["Altra - IT", 10]])] }], tw);
  assert.equal(r.byTeam.a_0001.usd, 50); assert.equal(r.total, 1);
});
t("voci della busta fuori dai turni: ridistribuite", () => {
  const r = chatterFromWages([{ member_name: "Op5", status: "PAID", total_wage: 150, shifts: [sh(60, 3, [["Ann - IT", 10]]), sh(40, 2, [["Bea - IT", 10]])] }], tw);
  assert.equal(r.byTeam.a_0001.usd, 90); assert.equal(r.byTeam.b_0001.usd, 60);
});
t("operatore che non tocca le nostre: ignorato", () => assert.equal(chatterFromWages([{ status: "OPEN", total_wage: 9, shifts: [sh(9, 1, [["Altra - IT", 1]])] }], tw).total, 0));
t("busta esclusa: tolta da tutti i team e dal conteggio delle aperte", () => {
  const inp = { a_0001: { chatterUsd: 500, chatterSource: "buste", chatterBuste: [{ name: "Ilaria Maggio", status: "OPEN", usd: 300 }, { name: "Op1", status: "PAID", usd: 200 }] },
    b_0001: { chatterUsd: 100, chatterSource: "buste", chatterBuste: [{ name: "ilaria maggio", status: "OPEN", usd: 40 }, { name: "Op2", status: "PAYABLE", usd: 60 }] } };
  const o = applyBusteExclusions(inp, [{ name: "Ilaria Maggio" }]);
  assert.equal(o.a_0001.chatterUsd, 200); assert.equal(o.b_0001.chatterUsd, 60);
  assert.equal(o.a_0001.chatterBuste.length, 1);
  assert.equal(o.a_0001.chatterSource, "buste CreatorsPro · tutte chiuse · 1 esclusa");
});
console.log(`split: ${n} ok`);
