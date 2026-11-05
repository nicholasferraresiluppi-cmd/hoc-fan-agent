// Unit test — fasce-duo-core (funzioni pure). Esegui: node tests/fasce-duo.mjs
// Copre: fascia dall'ora di Roma, traffico a fasce, confronto SOLO dentro la stessa
// cella (pagina × fascia × traffico: niente paradosso di Simpson), verdetti e azioni,
// filtro dello split, guadagno per operatore.
import assert from "node:assert/strict";
import { bandOf, toCells, matched, coverage, verdictOf, actionOf, buildDuo, MIN_SIDE_H } from "../src/lib/fasce-duo-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };
const rep = (k, row) => Array.from({ length: k }, () => ({ ...row }));

t("traffico a fasce", () => {
  assert.equal(bandOf(0), "0-4");
  assert.equal(bandOf(4), "0-4");
  assert.equal(bandOf(5), "5-9");
  assert.equal(bandOf(24), "15-24");
  assert.equal(bandOf(80), "25+");
  assert.equal(bandOf(null), "0-4");
});

t("celle: fascia da ora di Roma, solo vs due, righe senza turno scartate", () => {
  const c = toCells([
    { cid: 1, rh: 23, staff: 1, starts: 3, net: 10 },
    { cid: 1, rh: 0, staff: 2, starts: 2, net: 30 },
    { cid: 1, rh: 14, staff: 3, starts: 12, net: 50 },
    { cid: 1, rh: 14, staff: 0, starts: 12, net: 999 },
  ]);
  const night = c.find((x) => x.slot === "22-3");
  assert.deepEqual(night.s, [1, 10, 100, 3]);
  assert.deepEqual(night.d, [1, 30, 900, 2]);
  const day = c.find((x) => x.slot === "12-17");
  assert.equal(day.band, "10-14");
  assert.equal(day.d[0], 1);
  assert.equal(day.s[0], 0);
});

t("confronto dentro la cella: il traffico non si mescola", () => {
  // traffico basso: quasi sempre soli ($20); traffico alto: quasi sempre in due ($100).
  // Il secondo operatore NON aggiunge nulla dentro ciascuna cella. Un confronto
  // grezzo (media duo − media solo) direbbe +$70: il confronto per cella dice 0.
  const rows = [
    ...rep(60, { cid: "p", rh: 15, staff: 1, starts: 2, net: 20 }),
    ...rep(10, { cid: "p", rh: 15, staff: 2, starts: 2, net: 20 }),
    ...rep(10, { cid: "p", rh: 15, staff: 1, starts: 30, net: 100 }),
    ...rep(60, { cid: "p", rh: 15, staff: 2, starts: 30, net: 100 }),
  ];
  const m = matched(toCells(rows));
  assert.equal(m.gain, 0);
  assert.equal(m.solo_h, 70);
  assert.equal(m.duo_h, 70);
});

t("celle con troppe poche ore di un tipo non entrano", () => {
  const rows = [...rep(50, { cid: "p", rh: 15, staff: 1, starts: 2, net: 20 }), ...rep(3, { cid: "p", rh: 15, staff: 2, starts: 2, net: 90 })];
  assert.equal(matched(toCells(rows)), null);
});

const mk = (solo, duo, k = 60, jitter = 4) => [
  ...Array.from({ length: k }, (_, i) => ({ cid: "p", rh: 15, staff: 1, starts: 12, net: solo + ((i % 3) - 1) * jitter })),
  ...Array.from({ length: k }, (_, i) => ({ cid: "p", rh: 15, staff: 2, starts: 12, net: duo + ((i % 3) - 1) * jitter })),
];

t("verdetti: conviene / non aggiunge / incerto / pochi dati / da provare", () => {
  const v = (rows) => { const c = toCells(rows); return verdictOf(matched(c), coverage(c)); };
  assert.equal(v(mk(80, 120)), "conviene");
  assert.equal(v(mk(80, 82)), "non_aggiunge");
  assert.equal(v(mk(80, 100, 60, 150)), "incerto"); // +$20 ma rumore enorme
  assert.equal(v(mk(250, 225, 60, 200)), "incerto"); // −$25 ma margine più largo della soglia: non è un via libera
  assert.equal(v(mk(80, 120, 20)), "pochi_dati"); // sotto MIN_SIDE_H
  // traffico alto, quasi mai in due → da provare
  const busy = [...rep(MIN_SIDE_H + 20, { cid: "p", rh: 15, staff: 1, starts: 30, net: 90 }), ...rep(2, { cid: "p", rh: 15, staff: 2, starts: 30, net: 90 })];
  assert.equal(v(busy), "da_provare");
  // traffico basso, quasi mai in due → solo pochi dati
  const calm = [...rep(MIN_SIDE_H + 20, { cid: "p", rh: 15, staff: 1, starts: 3, net: 20 })];
  assert.equal(v(calm), "pochi_dati");
});

t("azioni dalla copertura attuale", () => {
  assert.equal(actionOf("conviene", 0.2), "aggiungi");
  assert.equal(actionOf("conviene", 0.7), "tieni");
  assert.equal(actionOf("non_aggiunge", 0.6), "libera");
  assert.equal(actionOf("non_aggiunge", 0.1), null);
  assert.equal(actionOf("da_provare", 0), "prova");
  assert.equal(actionOf("incerto", 0.5), null);
});

t("documento: split filtrato, nomi, guadagno per operatore", () => {
  const rows = [...mk(80, 120), ...mk(80, 120).map((r) => ({ ...r, cid: "q", net: r.net * 3 }))];
  const cells = toCells(rows);
  const all = buildDuo(cells, { names: { p: "Pagina P" }, commission: 0.13 });
  assert.equal(all.pages.length, 2);
  const onlyP = buildDuo(cells, { only: new Set(["p"]), names: { p: "Pagina P" }, commission: 0.13 });
  assert.equal(onlyP.pages.length, 1);
  assert.equal(onlyP.pages[0].name, "Pagina P");
  assert.equal(onlyP.overall.solo_sph, 80);
  assert.equal(onlyP.overall.gain, 40);
  assert.equal(onlyP.pages[0].slots["12-17"].verdict, "conviene");
  // da solo 80 × 13% = 10,4 $/h; in due (80+40)/2 × 13% = 7,8 $/h a testa
  assert.deepEqual(onlyP.pay, { solo: 10.4, duo: 7.8 });
  assert.equal(buildDuo(cells, { commission: null }).pay, null);
  assert.equal(buildDuo([], {}).overall, null);
});

console.log(`fasce-duo: ${n} gruppi ok`);
