// node tests/perimetro.mjs — perimetro del personale (solo lo split)
import assert from "node:assert/strict";
import { buildRoster, makeInRoster, keepOurs } from "../src/lib/perimetro-core.js";

const SPLIT = [101, 102];
const rows = [
  { name: "Irma Rossi", crs: { 101: 0.8, 900: 0.2 } },          // nostra
  { name: "Omar HOC", crs: { 102: 0.5, 900: 0.5 } },             // metà esatta: nostra
  { name: "Luca Bianchi", crs: { 101: 0.3, 900: 0.7 } },         // sotto metà: dell'altra parte
  { name: "Giovanni Verdi", crs: { 900: 1 } },                   // dell'altra parte
  { name: "Senza Ore", crs: null },
  { name: "", crs: { 101: 1 } },
];

const people = buildRoster(rows, SPLIT);
assert.deepEqual(people.map((p) => p.name), ["Irma Rossi", "Omar HOC"], "regola: almeno metà delle ore sulle pagine dello split");
assert.equal(buildRoster(rows, []).length, 0, "split vuoto = nessuno");

const inRoster = makeInRoster(people);
assert.equal(inRoster("Irma Rossi"), true);
assert.equal(inRoster("irma  rossi"), true, "maiuscole e spazi");
assert.equal(inRoster("Omar"), true, "HOC tolto dal nome");
assert.equal(inRoster("Luca Bianchi"), false);
assert.equal(inRoster("Giovanni Verdi"), false);
assert.equal(inRoster(""), false);
assert.equal(inRoster(null), false);

// stesso nome scritto in un'altra fonte (CP vs Infloww): parola in più
const p2 = buildRoster([{ name: "Kevin Corradino", crs: { 101: 1 } }], SPLIT);
assert.equal(makeInRoster(p2)("Kevin Giuseppe Corradino"), true, "sottoinsieme di 2 parole");
// due candidati possibili → nessun abbinamento (meglio un buco che la persona sbagliata)
const amb = buildRoster([{ name: "Anna Neri Bis", crs: { 101: 1 } }, { name: "Anna Neri Tris", crs: { 101: 1 } }], SPLIT);
assert.equal(makeInRoster(amb)("Anna Neri Bis"), true, "esatto vince");
assert.equal(makeInRoster(amb)("Anna Neri"), false, "due candidati → fuori");

const list = [{ employee: "Irma Rossi", v: 1 }, { employee: "Giovanni Verdi", v: 2 }];
assert.deepEqual(keepOurs(list, inRoster, (r) => r.employee).map((r) => r.v), [1]);
assert.equal(keepOurs(null, inRoster), null, "non-array passa invariato");
assert.equal(keepOurs(list, null), list, "senza perimetro non filtra");

console.log("perimetro: ok");
