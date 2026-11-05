// Unit test — fasce-core (funzioni pure). Esegui: node tests/fasce.mjs
// Copre le scelte facili da rompere: fasce dall'ora di ROMA (non UTC), confronto
// coi colleghi senza sé stessi, duo confrontati coi duo, valore della fascia a
// pari bravura, liste d'azione (chi chiude basso in punta / chi è bravo e ci va poco).
import assert from "node:assert/strict";
import {
  slotOfHour, romeParts, toPieces, bravura, slotValues, duoShare, buildFasce, splitSlotValues,
  shrinkK, slotBravura, SLOT_MIN_H,
} from "../src/lib/fasce-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("fasce dall'ora di inizio", () => {
  assert.equal(slotOfHour(7), "7-12");
  assert.equal(slotOfHour(12), "12-17");
  assert.equal(slotOfHour(13), "12-17");
  assert.equal(slotOfHour(17), "17-22");
  assert.equal(slotOfHour(19), "17-22");
  assert.equal(slotOfHour(22), "22-3");
  assert.equal(slotOfHour(0), "22-3");
  assert.equal(slotOfHour(1), "1-7");
  assert.equal(slotOfHour(3), "1-7");
});

t("ora di Roma, non UTC (ora legale e solare)", () => {
  assert.equal(romeParts("2026-08-10T20:00:00Z").hour, 22); // estate: UTC+2
  assert.equal(romeParts("2026-12-10T21:00:00Z").hour, 22); // inverno: UTC+1
  assert.equal(romeParts("2026-08-10T22:30:00Z").day, "2026-08-11"); // dopo mezzanotte a Roma
  assert.equal(romeParts("boh"), null);
});

// costruttore di turni: op, pagina, ora UTC d'estate (Roma = +2), ore, venduto, duo
let sid = 0;
const S = (op, cid, day, utcHour, h, rev, cos = 1) => ({
  id: ++sid, member_id: op, member_name: `Op ${op}`,
  started_at: `2026-08-${String(day).padStart(2, "0")}T${String(utcHour).padStart(2, "0")}:00:00Z`,
  worked_hours: h, total_attributed: rev, creator_ids: [cid], cosellers: cos,
});

t("toPieces: doppioni una volta, multi-pagina diviso, duo riconosciuto", () => {
  const a = S("a", "p1", 1, 5, 5, 100);
  const multi = { ...S("b", "p1", 1, 5, 6, 120), creator_ids: ["p1", "p2"] };
  const duo = S("c", "p1", 1, 20, 5, 50, 2);
  const P = toPieces([a, a, multi, duo]);
  assert.equal(P.filter((x) => x.op === "a").length, 1);
  const m = P.filter((x) => x.op === "b");
  assert.equal(m.length, 2);
  assert.equal(m[0].h, 3);
  assert.equal(m[0].rev, 60);
  assert.equal(P.find((x) => x.op === "c").mode, "duo");
  assert.equal(P.find((x) => x.op === "c").slot, "22-3");
  assert.equal(P.find((x) => x.op === "a").slot, "7-12");
});

t("bravura leave-one-out: chi è solo nella sua cella non ha confronto", () => {
  const sh = [];
  for (let d = 1; d <= 20; d++) sh.push(S("solo", "p1", d, 5, 5, 500));
  const B = bravura(toPieces(sh));
  assert.equal(B.get("solo").idx, null);
});

t("bravura: il doppio dei colleghi = 2,00; i duo si confrontano coi duo", () => {
  const sh = [];
  for (let d = 1; d <= 20; d++) {
    sh.push(S("top", "p1", d, 5, 5, 200)); // $40/h
    sh.push(S("mid", "p1", d, 5, 5, 100)); // $20/h
    // in duo la quota è metà: non deve far sembrare scarso chi lavora in duo
    sh.push(S("duo1", "p1", d, 10, 5, 50, 2));
    sh.push(S("duo2", "p1", d, 10, 5, 50, 2));
  }
  const B = bravura(toPieces(sh));
  assert.equal(B.get("top").idx, 2);
  assert.equal(B.get("mid").idx, 0.5);
  assert.equal(B.get("duo1").idx, 1);
});

// pagina con valore di fascia noto: notte vale il doppio della mattina a pari persone
function scenario() {
  const sh = [];
  for (let d = 1; d <= 28; d++) {
    // bravi (2x) e scarsi (0,5x) girano su tutte le fasce → bravura misurabile
    const strongSlot = d % 2 ? 20 : 5; // notte (22 Roma) nei dispari, mattina nei pari
    const weakSlot = d % 2 ? 5 : 20;
    const base = (u) => (u === 20 ? 40 : 20); // $/h di un medio
    sh.push(S("forte", "p1", d, strongSlot, 5, base(strongSlot) * 5 * 1.6));
    sh.push(S("medio1", "p1", d, 20, 5, 40 * 5));
    sh.push(S("medio2", "p1", d, 5, 5, 20 * 5));
    sh.push(S("medio3", "p1", d, 10, 5, 30 * 5));
    sh.push(S("medio4", "p1", d, 15, 5, 30 * 5));
    // lo scarso fa quasi solo notti
    sh.push(S("scarso", "p1", d, d % 5 ? 20 : weakSlot, 5, base(d % 5 ? 20 : weakSlot) * 5 * 0.6));
    // il bravo da portare: tante mattine, poche notti
    sh.push(S("nascosto", "p1", d, d % 7 ? 5 : 20, 5, base(d % 7 ? 5 : 20) * 5 * 1.5));
  }
  return sh;
}

t("valore della fascia a pari bravura e fascia di punta", () => {
  const P = toPieces(scenario());
  const B = bravura(P);
  const v = slotValues(P, B);
  assert.deepEqual(v.prime, ["22-3"]);
  assert.ok(v.slots["22-3"].sph_adj > v.slots["7-12"].sph_adj * 1.7);
  assert.equal(v.flat, false);
});

t("fasce che valgono uguale: nessuna priorità", () => {
  const sh = [];
  for (let d = 1; d <= 30; d++) for (const [op, u] of [["x", 5], ["y", 20], ["z", 5], ["w", 20]]) sh.push(S(op, "p1", d, u, 5, 150));
  const P = toPieces(sh);
  const v = slotValues(P, bravura(P));
  assert.equal(v.flat, true);
  assert.deepEqual(v.prime, []);
});

t("liste d'azione: scarso in punta da togliere, bravo fuori punta da portare", () => {
  const doc = buildFasce(toPieces(scenario()), { now: Date.parse("2026-08-30"), names: { p1: "Pagina 1" } });
  const page = doc.pages[0];
  assert.equal(page.name, "Pagina 1");
  assert.ok(page.weak_in_prime.includes("scarso"));
  assert.ok(page.strong_outside.includes("nascosto"));
  assert.ok(!page.weak_in_prime.includes("forte"));
  const op = (id) => doc.operators.find((o) => o.op === id);
  assert.equal(op("scarso").verdict, "togliere");
  assert.equal(op("nascosto").verdict, "portare");
  assert.equal(op("medio3").verdict, null);
  // stima: chi chiude basso rende meno di una persona media nelle ore di punta
  assert.ok(page.people.find((x) => x.op === "scarso").est < 0);
  assert.ok(page.people.find((x) => x.op === "forte").est > 0);
  assert.equal(op("scarso").est, page.people.find((x) => x.op === "scarso").est);
});

t("bravura da fuori (Infloww): comanda lei, non i turni", () => {
  // nei turni "scarso" vende poco, ma secondo Infloww è bravo: vince Infloww
  const bravuraOf = new Map([["scarso", { idx: 1.4, infloww_name: "Scarso Infloww" }], ["forte", { idx: 1.0 }], ["nascosto", { idx: 1.5 }]]);
  for (const id of ["medio1", "medio2", "medio3", "medio4"]) bravuraOf.set(id, { idx: 1 });
  const doc = buildFasce(toPieces(scenario()), { now: Date.parse("2026-08-30"), names: {}, bravuraOf });
  assert.equal(doc.bravura_source, "infloww");
  const op = (id) => doc.operators.find((o) => o.op === id);
  assert.equal(op("scarso").idx, 1.4);
  assert.equal(op("scarso").verdict, null);
  assert.equal(op("scarso").link_name, "Scarso Infloww");
  assert.equal(op("medio1").link_name, "Op medio1");
  // chi non è abbinato a Infloww non ha bravura né verdetto
  const doc2 = buildFasce(toPieces(scenario()), { now: Date.parse("2026-08-30"), names: {}, bravuraOf: new Map() });
  assert.ok(doc2.operators.every((o) => o.idx == null && o.verdict == null));
});

t("chi non fa turni da 3 settimane esce dalle liste — misurato dall'ultimo giorno dei dati", () => {
  // un turno di un altro a fine ottobre: i protagonisti di agosto risultano fermi
  const sh = [...scenario(), { ...S("altro", "p1", 1, 5, 5, 100), started_at: "2026-10-30T05:00:00Z" }];
  const doc = buildFasce(toPieces(sh), { now: Date.parse("2026-10-30"), names: {} });
  assert.equal(doc.until, "2026-10-30");
  assert.equal(doc.pages[0].weak_in_prime.length, 0);
  assert.ok(doc.operators.every((o) => o.verdict === null));
  // se la sync si ferma e oggi è molto dopo, nessuno sembra fermo per quello
  const doc2 = buildFasce(toPieces(scenario()), { now: Date.parse("2026-12-30"), names: {} });
  assert.ok(doc2.pages[0].weak_in_prime.includes("scarso"));
});

t("doppio turno: quota di fasce coperte in due", () => {
  const P = toPieces([S("a", "p1", 1, 5, 5, 1), S("b", "p1", 1, 5, 5, 1), S("a", "p1", 2, 5, 5, 1)]);
  assert.equal(duoShare(P), 0.5);
  assert.equal(duoShare([]), null);
});

t("stabilità: calcolata e nei limiti", () => {
  const doc = buildFasce(toPieces(scenario()), { now: Date.parse("2026-08-30") });
  for (const k of ["general", "personal"]) assert.ok(doc.stability[k] == null || Math.abs(doc.stability[k]) <= 1);
});

t("valore per split pesato sulle ore, fasce senza valore ignorate", () => {
  const v = splitSlotValues([
    { slots: { "22-3": { h: 100, sph_adj: 100 }, "7-12": { h: 50, sph_adj: null } } },
    { slots: { "22-3": { h: 300, sph_adj: 60 } } },
  ]);
  assert.deepEqual(v, { "22-3": { h: 400, sph_adj: 70 } });
});

t("bravura per fascia: K dalla prova pari/dispari, mai diviso per zero", () => {
  assert.equal(shrinkK({ personal: 0.2, personal_h: 40 }), 160);
  assert.equal(shrinkK({ personal: 0, personal_h: 40 }), 760); // r stretta a 0,05
  assert.equal(shrinkK({ personal: -0.3, personal_h: 40 }), 760);
  assert.equal(shrinkK({ personal: 0.95, personal_h: 40 }), 10); // r stretta a 0,8
  assert.equal(shrinkK(null), 760);
});

t("bravura per fascia: ristretta verso la generale, grezzo conservato", () => {
  // nei turni CP rende 1,2 nel 22-3 e 0,8 nel 7-12 rispetto ai colleghi; generale Infloww 1,00
  const slots = { "22-3": { rev: 120, exp: 100, cmp_h: 100 }, "7-12": { rev: 80, exp: 100, cmp_h: 100 }, "1-7": { rev: 5, exp: 4, cmp_h: SLOT_MIN_H - 1 } };
  const out = slotBravura(slots, 1, 100);
  assert.equal(out["22-3"].w, 0.5);
  assert.ok(out["22-3"].v > 1 && out["22-3"].v < out["22-3"].raw, "si sposta verso il misurato ma meno");
  assert.ok(out["7-12"].v < 1 && out["7-12"].v > out["7-12"].raw);
  assert.equal(out["1-7"].v, null, "sotto il minimo di ore: niente numero");
  // con K enorme (fascia personale che non si ripete) resta la bravura generale
  const flat = slotBravura(slots, 0.9, 1e9);
  assert.equal(flat["22-3"].v, 0.9);
  assert.equal(flat["7-12"].v, 0.9);
  // CP gonfia la persona (×3 su tutto): la forma non cambia
  const inflated = slotBravura({ "22-3": { rev: 360, exp: 100, cmp_h: 100 }, "7-12": { rev: 240, exp: 100, cmp_h: 100 } }, 1, 100);
  const two = slotBravura({ "22-3": slots["22-3"], "7-12": slots["7-12"] }, 1, 100);
  assert.equal(inflated["22-3"].v, two["22-3"].v);
  assert.equal(inflated["7-12"].v, two["7-12"].v);
  // senza bravura generale nessun numero
  assert.equal(slotBravura(slots, null, 100)["22-3"].v, null);
  // venduto zero in una fascia: numero basso ma finito
  const z = slotBravura({ "22-3": { rev: 0, exp: 100, cmp_h: 100 }, "7-12": { rev: 100, exp: 100, cmp_h: 100 } }, 1, 100);
  assert.ok(Number.isFinite(z["22-3"].v) && z["22-3"].v > 0);
});

t("bravura per fascia nel documento + K nella stabilità", () => {
  const doc = buildFasce(toPieces(scenario()), { now: Date.parse("2026-08-30") });
  assert.ok(Number.isFinite(doc.stability.k) && doc.stability.k > 0);
  const o = doc.operators.find((x) => x.idx != null);
  assert.ok(o.slot_idx && typeof o.slot_idx === "object");
  for (const v of Object.values(o.slot_idx)) assert.ok(v.v == null || v.v > 0);
});

console.log(`fasce: ${n} test ok`);
