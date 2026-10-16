// Unit test — bilancio-core (classifica del mese). Esegui: node tests/bilancio.mjs
// Numeri presi dal foglio "Bilancio_unico_LIVE - creator selezionate" del 15-16/10/2026.
import assert from "node:assert/strict";
import { buildBilancio, calendarOf, cleanPerson, cleanGroups, clampDay, statusOf } from "../src/lib/bilancio-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

const FISH = { slug: "fishball", name: "Fishball", accounts: [{ creator_id: 7560862, country: "EN" }, { creator_id: 160294962, country: "IT" }] };
const CUBA = { slug: "cubanita", name: "Cubanita", accounts: [{ creator_id: 1000000408, country: "IT" }] };
const NOGOAL = { slug: "giulia-amici", name: "Giulia Amici", accounts: [{ creator_id: 1000000347, country: "IT" }] };
const day = (id, d, net) => ({ creator_id: id, date: `2026-10-${String(d).padStart(2, "0")}`, net });

t("calendario: ottobre 31 giorni, mese prima settembre; gennaio → dicembre dell'anno prima", () => {
  assert.deepEqual(calendarOf("2026-10-16"), { month: "2026-10", day: 16, daysInMonth: 31, prevMonth: "2026-09" });
  assert.equal(calendarOf("2027-01-05").prevMonth, "2026-12");
  assert.equal(calendarOf("2026-11-03").daysInMonth, 30);
});

t("giorno scelto: date non valide, future o troppo vecchie → oggi", () => {
  assert.equal(clampDay("2026-10-10", "2026-10-16"), "2026-10-10");
  assert.equal(clampDay("2026-10-17", "2026-10-16"), "2026-10-16");
  assert.equal(clampDay("2026-02-30", "2026-10-16"), "2026-10-16");
  assert.equal(clampDay("x", "2026-10-16"), "2026-10-16");
  assert.equal(clampDay("2020-01-01", "2026-10-16"), "2026-10-16");
});

t("target del giorno = goal ÷ giorni del mese (foglio: 125.000 ÷ 31 = 4.032,26)", () => {
  const b = buildBilancio({ creators: [FISH], goals: { fishball: { IT: { "2026-10": 125000 }, EN: { "2026-10": 50000 } } }, today: "2026-10-15" });
  const it = b.creators[0].accounts.find((a) => a.country === "IT");
  near(it.targetDay, 4032.26);
  near(b.creators[0].targetDay, 5645.16); // Fishball Total del foglio
});

t("oggi in corso: proiezione sui soli giorni chiusi, serve al giorno sui giorni che restano (oggi compreso)", () => {
  const daily = [];
  for (let d = 1; d <= 15; d++) daily.push(day(160294962, d, 1000));
  daily.push(day(160294962, 16, 50)); // oggi, a metà mattina
  const b = buildBilancio({ creators: [FISH], daily, goals: { fishball: { IT: { "2026-10": 31000 } } }, today: "2026-10-16" });
  const it = b.creators[0].accounts.find((a) => a.country === "IT");
  assert.equal(b.live, true);
  assert.equal(b.daysLeft, 16);
  near(it.mtd, 15050); near(it.day, 50); near(it.prevDay, 1000);
  near(it.perDay, 1000); near(it.projection, 31000); near(it.gap, 0);
  near(it.needPerDay, (31000 - 15050) / 16);
  assert.equal(it.status, "arriva");
  near(b.idealPct, 15 / 31, 1e-9);
});

t("giorno passato: si legge a fine giornata, le vendite dopo non contano", () => {
  const daily = [];
  for (let d = 1; d <= 15; d++) daily.push(day(1000000408, d, d <= 10 ? 2000 : 9999));
  const b = buildBilancio({ creators: [CUBA], daily, goals: { cubanita: { IT: { "2026-10": 62000 } } }, today: "2026-10-16", asOf: "2026-10-10" });
  const c = b.creators[0];
  assert.equal(b.live, false); assert.equal(b.closedDays, 10); assert.equal(b.daysLeft, 21);
  near(c.mtd, 20000); near(c.day, 2000); near(c.projection, 62000);
  assert.equal(b.days[9].selected, true); assert.equal(b.days[10].total, null); assert.equal(b.days[9].partial, false);
});

t("mese passato: si legge il mese chiuso, l'ultimo giorno vale per intero", () => {
  const daily = [{ creator_id: 1000000408, date: "2026-09-30", net: 3000 }, { creator_id: 1000000408, date: "2026-09-01", net: 3000 }];
  const b = buildBilancio({ creators: [CUBA], daily, goals: { cubanita: { IT: { "2026-09": 6000 } } }, today: "2026-10-16", asOf: "2026-09-30" });
  assert.equal(b.month, "2026-09"); assert.equal(b.daysLeft, 0); assert.equal(b.closedDays, 30);
  near(b.creators[0].mtd, 6000); assert.equal(b.creators[0].needPerDay, null); assert.equal(b.creators[0].status, "arriva");
});

t("primo del mese: nessun giorno chiuso → niente proiezione (non 0), nessuno stato", () => {
  const b = buildBilancio({ creators: [CUBA], daily: [{ creator_id: 1000000408, date: "2026-10-01", net: 900 }], goals: { cubanita: { IT: { "2026-10": 9000 } } }, today: "2026-10-01" });
  assert.equal(b.creators[0].projection, null);
  assert.equal(b.creators[0].status, null);
  near(b.creators[0].day, 900);
});

t("stato: ci arriva / vicina (≥90% di quello che serve) / sotto — mai un 'in perdita'", () => {
  assert.equal(statusOf({ goal: 100, projection: 100 }), "arriva");
  assert.equal(statusOf({ goal: 100, projection: 95, perDay: 9, needPerDay: 10 }), "vicina");
  assert.equal(statusOf({ goal: 100, projection: 60, perDay: 5, needPerDay: 10 }), "sotto");
  assert.equal(statusOf({ goal: null, projection: 60 }), null);
});

t("Δ mese prima = proiezione − venduto del mese precedente intero", () => {
  const daily = [day(1000000408, 1, 2000), day(1000000408, 2, 2000)];
  const b = buildBilancio({ creators: [CUBA], daily, prevTotals: { 1000000408: 53827.58 }, today: "2026-10-03" });
  near(b.creators[0].projection, 62000);
  near(b.creators[0].deltaPrev, 62000 - 53827.58);
});

t("classifica: proiezione ÷ goal; chi non ha goal va in fondo senza posizione", () => {
  const daily = [];
  for (let d = 1; d <= 10; d++) { daily.push(day(160294962, d, 4000)); daily.push(day(1000000408, d, 2000)); daily.push(day(1000000347, d, 9000)); }
  const b = buildBilancio({
    creators: [FISH, CUBA, NOGOAL], daily, today: "2026-10-11",
    goals: { fishball: { IT: { "2026-10": 175000 } }, cubanita: { IT: { "2026-10": 50000 } } },
  });
  assert.deepEqual(b.creators.map((c) => c.slug), ["cubanita", "fishball", "giulia-amici"]);
  assert.deepEqual(b.creators.map((c) => c.rank), [1, 2, null]);
});

t("ecosistemi: totale del gruppo sul suo goal, classifica dei gruppi, il resto in 'Altre creator'", () => {
  const daily = [];
  for (let d = 1; d <= 10; d++) { daily.push(day(160294962, d, 4000)); daily.push(day(1000000408, d, 2000)); daily.push(day(1000000347, d, 300)); }
  const b = buildBilancio({
    creators: [FISH, CUBA, NOGOAL], daily, today: "2026-10-11",
    goals: { fishball: { IT: { "2026-10": 175000 } }, cubanita: { IT: { "2026-10": 50000 } }, "giulia-amici": { IT: { "2026-10": 10000 } } },
    groups: [{ id: "g1", name: "Gruppo uno", slugs: ["cubanita", "giulia-amici"] }],
  });
  assert.deepEqual(b.groups.map((g) => g.name), ["Gruppo uno", "Altre creator"]);
  const g = b.groups[0];
  near(g.mtd, 23000); near(g.goal, 60000); near(g.projection, 23000 / 10 * 31);
  assert.deepEqual(g.creators.map((c) => c.slug), ["cubanita", "giulia-amici"]);
  assert.equal(g.rank, 1); assert.equal(b.groups[1].rank, null);
  assert.deepEqual(b.groups[1].creators.map((c) => c.slug), ["fishball"]);
});

t("ecosistemi senza gruppi: una sola sezione 'Tutte le creator'", () => {
  const b = buildBilancio({ creators: [FISH, CUBA], today: "2026-10-05" });
  assert.equal(b.groups.length, 1); assert.equal(b.groups[0].name, "Tutte le creator");
});

t("ecosistemi puliti: creator in un solo gruppo, sconosciute e gruppi vuoti tolti, nomi senza markup", () => {
  const g = cleanGroups([
    { name: " <b>Uno</b> ", slugs: ["cubanita", "fishball"] },
    { name: "Due", slugs: ["cubanita", "ignota"] },
    { name: "", slugs: ["giulia-amici"] },
  ], new Set(["cubanita", "fishball", "giulia-amici"]));
  assert.deepEqual(g, [{ id: "buno-b", name: "bUno/b", slugs: ["cubanita", "fishball"] }]);
});

t("account senza goal: il totale della creator usa il goal che c'è, non lo azzera", () => {
  const b = buildBilancio({ creators: [FISH], goals: { fishball: { IT: { "2026-10": 125000 } } }, today: "2026-10-05" });
  assert.equal(b.creators[0].goal, 125000);
  assert.equal(b.creators[0].accounts.find((a) => a.country === "EN").goal, null);
});

t("andamento del mese: colonne per paese, giorni futuri vuoti, oggi parziale", () => {
  const daily = [day(160294962, 1, 18263), day(7560862, 1, 858), day(160294962, 3, 10)];
  const b = buildBilancio({ creators: [FISH], daily, today: "2026-10-03" });
  assert.deepEqual(b.countries, ["IT", "EN"]);
  near(b.days[0].IT, 18263); near(b.days[0].EN, 858); near(b.days[0].total, 19121); // riga del 1/10 del foglio
  assert.equal(b.days[2].partial, true);
  assert.equal(b.days[3].total, null);
  assert.equal(b.days.length, 31);
});

t("vendite di altri mesi o di pagine fuori dallo split non entrano", () => {
  const b = buildBilancio({ creators: [CUBA], daily: [{ creator_id: 1000000408, date: "2026-09-30", net: 999 }, day(42, 2, 500)], today: "2026-10-05" });
  near(b.totals.mtd, 0);
  near(b.days[1].total, 0);
});

t("AM/SM: arrivano per account; il testo si pulisce", () => {
  const b = buildBilancio({ creators: [FISH], people: { fishball: { IT: { am: "Lara C.", sm: "Michael L." } } }, today: "2026-10-05" });
  const it = b.creators[0].accounts.find((a) => a.country === "IT");
  assert.equal(it.am, "Lara C.");
  assert.equal(cleanPerson("  <b>Marco   B.</b> "), "bMarco B./b");
  assert.equal(cleanPerson("   "), null);
});

console.log(`bilancio: ${n} test ok`);
