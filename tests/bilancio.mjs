// Unit test — bilancio-core (classifica del mese). Esegui: node tests/bilancio.mjs
// Numeri presi dal foglio "Bilancio_unico_LIVE - creator selezionate" del 15-16/10/2026.
import assert from "node:assert/strict";
import { buildBilancio, calendarOf, cleanPerson } from "../src/lib/bilancio-core.js";

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

t("target oggi = goal ÷ giorni del mese (foglio: 125.000 ÷ 31 = 4.032,26)", () => {
  const b = buildBilancio({ creators: [FISH], goals: { fishball: { IT: { "2026-10": 125000 }, EN: { "2026-10": 50000 } } }, today: "2026-10-15" });
  const it = b.creators[0].accounts.find((a) => a.country === "IT");
  near(it.targetToday, 4032.26);
  near(b.creators[0].targetToday, 5645.16); // Fishball Total del foglio
});

t("proiezione sui soli giorni chiusi: il giorno in corso non abbassa la stima", () => {
  const daily = [];
  for (let d = 1; d <= 15; d++) daily.push(day(160294962, d, 1000));
  daily.push(day(160294962, 16, 50)); // oggi, a metà mattina
  const b = buildBilancio({ creators: [FISH], daily, goals: { fishball: { IT: { "2026-10": 31000 } } }, today: "2026-10-16" });
  const it = b.creators[0].accounts.find((a) => a.country === "IT");
  near(it.mtd, 15050);
  near(it.today, 50);
  near(it.yesterday, 1000);
  near(it.projection, 31000);
  near(it.gap, 0);
  near(b.idealPct, 15 / 31, 1e-9);
  near(it.pctActual, 15050 / 31000, 1e-9);
});

t("primo del mese: nessun giorno chiuso → niente proiezione (non 0)", () => {
  const b = buildBilancio({ creators: [CUBA], daily: [{ creator_id: 1000000408, date: "2026-10-01", net: 900 }], today: "2026-10-01" });
  assert.equal(b.creators[0].projection, null);
  assert.equal(b.creators[0].accounts[0].gap, null);
  near(b.creators[0].today, 900);
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
