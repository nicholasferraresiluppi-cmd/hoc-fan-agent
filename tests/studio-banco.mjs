// node tests/studio-banco.mjs — Banco montaggi di Regia social (logica pura).
import assert from "node:assert/strict";
import { BANCO_STATES, isBancoState, titleOf, mergeFiles, bancoCounts, bancoFolders, filterRows, defaultState, nextInQueue } from "../src/lib/studio-banco-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const files = [
  { id: "a", name: "S10 Spesa.mp4", kind: "video", path: "2 - Battuta" },
  { id: "b", name: "S2 Mano.mp4", kind: "video", path: "2 - Battuta" },
  { id: "c", name: "C4 Chi sono.mp4", kind: "video", path: "1 - Chi è questa" },
  { id: "d", name: "foto.jpg", kind: "photo", path: "" },
  { id: "e", name: "V1 Casco.mp4", kind: "video", path: "" },
];

t("titolo senza estensione", () => {
  assert.equal(titleOf("C4 Chi sono.mp4"), "C4 Chi sono");
  assert.equal(titleOf("senza estensione"), "senza estensione");
  assert.equal(titleOf(null), "");
});
t("gli stati sono quelli attesi", () => {
  assert.deepEqual(BANCO_STATES.map((s) => s.key), ["da_vedere", "scelto", "pronto", "scartato"]);
  assert.ok(isBancoState("pronto")); assert.ok(!isBancoState("boh")); assert.ok(!isBancoState(undefined));
});
t("merge: solo video, senza scelta è da guardare, stato strano non rompe", () => {
  const rows = mergeFiles(files, { a: { state: "scelto", by: "u", at: 5 }, c: { state: "inventato" } });
  assert.equal(rows.length, 4);
  assert.equal(rows.find((r) => r.id === "a").state, "scelto");
  assert.equal(rows.find((r) => r.id === "a").markedBy, "u");
  assert.equal(rows.find((r) => r.id === "c").state, "da_vedere");
  assert.equal(rows.find((r) => r.id === "b").state, "da_vedere");
});
t("ordine: per cartella, poi numero naturale (S2 prima di S10)", () => {
  const rows = mergeFiles(files, {});
  assert.deepEqual(rows.map((r) => r.id), ["e", "c", "b", "a"]);
});
t("conteggi: la somma fa il totale, anche filtrando per cartella", () => {
  const rows = mergeFiles(files, { a: { state: "pronto" }, b: { state: "scartato" } });
  const c = bancoCounts(rows);
  assert.equal(Object.values(c).reduce((x, y) => x + y, 0), rows.length);
  assert.deepEqual(bancoCounts(rows, "2 - Battuta"), { da_vedere: 0, scelto: 0, pronto: 1, scartato: 1 });
  assert.deepEqual(bancoCounts([]), { da_vedere: 0, scelto: 0, pronto: 0, scartato: 0 });
});
t("cartelle: la radice ha un nome leggibile e i numeri tornano", () => {
  const f = bancoFolders(mergeFiles(files, {}));
  assert.deepEqual(f.map((x) => x.n), [1, 1, 2]);
  assert.equal(f[0].label, "Cartella principale");
});
t("filtri combinati", () => {
  const rows = mergeFiles(files, { a: { state: "scelto" } });
  assert.deepEqual(filterRows(rows, { state: "scelto" }).map((r) => r.id), ["a"]);
  assert.deepEqual(filterRows(rows, { state: "da_vedere", path: "2 - Battuta" }).map((r) => r.id), ["b"]);
  assert.equal(filterRows(rows).length, 4);
});
t("stato di partenza: il primo con qualcosa dentro", () => {
  assert.equal(defaultState({ da_vedere: 3, scelto: 1 }), "da_vedere");
  assert.equal(defaultState({ da_vedere: 0, scelto: 2 }), "scelto");
  assert.equal(defaultState({}), "da_vedere");
});
t("coda del lettore: avanza e si ferma alla fine", () => {
  assert.equal(nextInQueue(["a", "b"], "a"), "b");
  assert.equal(nextInQueue(["a", "b"], "b"), null);
  assert.equal(nextInQueue(["a"], "x"), null);
});
console.log(`studio-banco: ${n} blocchi ok`);
