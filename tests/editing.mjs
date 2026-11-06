// node tests/editing.mjs — Editing: scrivanie, sette tappe, «Adesso», tempi (logica pura).
import assert from "node:assert/strict";
import { STAGES, slugify, groupDesks, stages, adesso, tempi, rifare, lastGiro, median } from "../src/lib/editing-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };
const DAY = 86400e3;
const NOW = Date.parse("2026-11-06T12:00:00Z");

t("sette tappe nell'ordine del lavoro", () => {
  assert.deepEqual(STAGES.map((s) => s.id), ["girato", "idee", "montaggio", "revisione", "scelta", "uscita", "misura"]);
});

t("una scrivania per creator, profili archiviati fuori", () => {
  assert.equal(slugify("Alessandra Sparagno"), "alessandra-sparagno");
  assert.equal(slugify("Élisa  Vimercati!"), "elisa-vimercati");
  const d = groupDesks([
    { id: "ig-a", creator: "Fishball", handle: "fishballla", platform: "instagram" },
    { id: "ig-b", creator: "Fishball ", handle: "fifi_conlagang", platform: "instagram" },
    { id: "ig-c", creator: "Alessandra Sparagno", handle: "ale.sprg", platform: "instagram" },
    { id: "ig-d", creator: "Vecchia", handle: "x", archived: true },
    { id: "ig-e", handle: "senzacreator" },
  ]);
  assert.deepEqual(d.map((x) => x.slug), ["alessandra-sparagno", "fishball", "senzacreator"]);
  assert.equal(d.find((x) => x.slug === "fishball").profiles.length, 2);
});

const giri = [
  { n: 5, day: "2026-11-05", montati: 16, tenuti: 8, fermati: [{ titolo: "K3" }] },
  { n: 6, day: "2026-11-05", montati: 6, tenuti: 4, fermati: [{ titolo: "a" }, { titolo: "b" }], girato: { stato: "finito", nota: "primi piani vestiti" } },
];

t("l'ultimo giro è il più recente (a parità di giorno, il numero più alto)", () => {
  assert.equal(lastGiro(giri).n, 6);
  assert.equal(lastGiro([]), null);
});

t("tappe: ultimo giro per idee/montaggio/revisione, Banco per scelta/uscita, reel per misura", () => {
  const banco = [
    { id: "a", state: "da_vedere", created: NOW - 3 * DAY },
    { id: "b", state: "da_vedere", created: NOW - 1 * DAY },
    { id: "c", state: "pronto", markedAt: NOW - 1 * DAY },
    { id: "d", state: "pronto", markedAt: NOW - 5 * DAY },
    { id: "e", state: "scartato" },
  ];
  const esiti = [{ fileId: "d", ratio: 1.3 }, { fileId: "x", ratio: null }, { fileId: null, ratio: 2 }];
  const by = Object.fromEntries(stages({ giri, banco, esiti, now: NOW }).map((s) => [s.id, s]));
  assert.equal(by.girato.stuck, true);
  assert.equal(by.girato.sub, "utile finito");
  assert.equal(by.idee.n, 8);           // 6 montati + 2 fermate
  assert.equal(by.montaggio.n, 6);
  assert.equal(by.revisione.n, 4);
  assert.match(by.revisione.sub, /^2 scartati/);
  assert.equal(by.scelta.n, 2);
  assert.equal(by.scelta.age, 3);
  assert.equal(by.scelta.stuck, true);
  assert.equal(by.uscita.n, 1);         // d è già uscito (collegato)
  assert.equal(by.uscita.stuck, false);
  assert.equal(by.misura.n, 1);
  assert.equal(by.misura.of, 2);
});

t("senza giri e senza Banco: niente zeri inventati", () => {
  const by = Object.fromEntries(stages({ now: NOW }).map((s) => [s.id, s]));
  assert.equal(by.idee.n, null);
  assert.equal(by.montaggio.n, null);
  assert.equal(by.girato.sub, "non registrato");
  assert.equal(by.scelta.n, 0);
  assert.equal(by.scelta.stuck, false);
});

t("Adesso: una sola riga, nell'ordine di cosa blocca di più", () => {
  const st = (o) => STAGES.map((s) => ({ ...s, ...(o[s.id] || {}) }));
  assert.match(adesso(st({ girato: { stuck: true }, scelta: { stuck: true, n: 3, age: 4 } }), { girato: { nota: "primi piani vestiti" } }).text, /^Il girato utile è finito: serve uno shooting: primi piani vestiti$/);
  assert.equal(adesso(st({ scelta: { stuck: true, n: 30, age: 2 } })).text, "30 video aspettano la scelta da 2 giorni");
  assert.equal(adesso(st({ uscita: { stuck: true, n: 2, age: 4 } })).stage, "uscita");
  assert.equal(adesso(st({}), { toLink: 1 }).text, "1 reel uscito va collegato al suo video, per misurarli");
  assert.equal(adesso(st({ scelta: { n: 5 } })).tone, "info");
  assert.equal(adesso(st({})).tone, "ok");
});

t("tempi: mediane in giorni, null se non misurabili", () => {
  const banco = [
    { id: "a", state: "scelto", created: NOW - 4 * DAY, markedAt: NOW - 3 * DAY },
    { id: "b", state: "pronto", created: NOW - 5 * DAY, markedAt: NOW - 2 * DAY },
    { id: "c", state: "da_vedere", created: NOW - DAY },
  ];
  const esiti = [{ fileId: "b", pubAt: NOW - 0.5 * DAY }];
  assert.deepEqual(tempi({ banco, esiti }), { scelta: 2, sceltaN: 2, uscita: 1.5, uscitaN: 1 });
  assert.deepEqual(tempi({}), { scelta: null, sceltaN: 0, uscita: null, uscitaN: 0 });
  assert.equal(median([3, 1]), 2);
});

t("cosa rifare: solo i formati con abbastanza reel, dal migliore", () => {
  const r = rifare([{ path: "a", enough: true, ratio: 0.8 }, { path: "b", enough: true, ratio: 1.6 }, { path: "c", enough: false, ratio: null }]);
  assert.deepEqual(r.sure.map((f) => f.path), ["b", "a"]);
  assert.deepEqual(r.few.map((f) => f.path), ["c"]);
});

console.log(`editing: ${n} prove ok`);
