import assert from "node:assert/strict";
import { previousOf, lengthOf, clampRange, presetsFor, matchPreset, monthGrid, formatRange, addDays } from "../src/lib/period-range.js";

// l'esempio di Nicholas: dal 22 agosto al 4 settembre
const r = { from: "2026-08-22", to: "2026-09-04" };
assert.equal(lengthOf(r), 14);
assert.deepEqual(previousOf(r), { from: "2026-08-08", to: "2026-08-21" });
assert.equal(formatRange(r, 2026), "22 ago – 4 set");
assert.equal(formatRange(previousOf(r), 2026), "8 – 21 ago");
assert.equal(formatRange({ from: "2025-12-28", to: "2026-01-04" }, 2026), "28 dic 2025 – 4 gen 2026");
assert.equal(formatRange({ from: "2025-03-01", to: "2025-03-01" }, 2026), "1 mar 2025");
assert.equal(formatRange({ from: "x", to: "y" }), "—");

// estremi invertiti e fuori limite
assert.deepEqual(clampRange({ from: "2026-09-04", to: "2026-08-22" }), r);
assert.deepEqual(clampRange({ from: "2026-10-01", to: "2026-10-20" }, { max: "2026-10-09" }), { from: "2026-10-01", to: "2026-10-09" });
assert.deepEqual(clampRange({ from: "2024-01-01", to: "2026-01-01" }, { min: "2025-09-04" }), { from: "2025-09-04", to: "2026-01-01" });

// periodi pronti chiusi su ieri
const p = presetsFor("2026-10-09");
assert.deepEqual(p.find((x) => x.id === "7"), { id: "7", label: "Ultimi 7 giorni", from: "2026-10-03", to: "2026-10-09" });
assert.equal(lengthOf(p.find((x) => x.id === "28")), 28);
assert.deepEqual(p.find((x) => x.id === "mese"), { id: "mese", label: "Questo mese", from: "2026-10-01", to: "2026-10-09" });
assert.deepEqual(p.find((x) => x.id === "mese-prima"), { id: "mese-prima", label: "Mese scorso", from: "2026-09-01", to: "2026-09-30" });
// il 1° del mese "questo mese" = il mese di ieri; gennaio → dicembre dell'anno prima
assert.deepEqual(presetsFor("2026-01-15").find((x) => x.id === "mese-prima"), { id: "mese-prima", label: "Mese scorso", from: "2025-12-01", to: "2025-12-31" });
assert.equal(matchPreset({ from: "2026-10-03", to: "2026-10-09" }, p), "7");
assert.equal(matchPreset(r, p), null);
assert.equal(matchPreset(null, p), null);

// calendario: lunedì per primo. Settembre 2026 inizia di martedì, 30 giorni
const sep = monthGrid(2026, 8);
assert.equal(sep[0][0], null);
assert.equal(sep[0][1], "2026-09-01");
assert.equal(sep.flat().filter(Boolean).length, 30);
assert.ok(sep.length === 6 && sep.every((w) => w.length === 7));
// febbraio 2027 inizia di lunedì
assert.equal(monthGrid(2027, 1)[0][0], "2027-02-01");
assert.equal(addDays("2026-03-28", 2), "2026-03-30"); // cambio d'ora: giorni UTC, nessun salto

console.log("period-range: ok");
