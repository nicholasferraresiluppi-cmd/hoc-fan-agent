// node tests/publisher-x.mjs — logica pura del conto publisher X.
import assert from "node:assert/strict";
import { isXLink, sanitizeConfig, splitDollar, rateFor, isMature, monthOf, computeMonth, monthClosesOn, feeFor, DEFAULT_FEE } from "../src/lib/publisher-x-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// Riconoscimento link X sui nomi veri del warehouse
for (const s of ["Linkscale_X", "Linkscale_Fishball_X", "twitter_sara", "Twitter", "X (twitter)", "X accounts", "LINKSCALE_tw.lauratellingnow", "GAML_tw_sommarugalaura", "@itschloecrt.x", "X_sonostormy", "twitter settembre 2026", "x", " X "]) ok(isXLink(s), `X: ${s}`);
for (const s of ["Traffic/01KZ6AFABJTCGWYDVS820WVR6X/#908119/1785870893", "IG principale", "WA_channelESP_f50X", "TG Federica Pacela x TG Ads", "OnlyFans Annarita (Solo x Veri)", "box", "tiktok", "", null, "Instagram story"]) ok(!isXLink(s), `non X: ${s}`);

// Config: scarta righe incomplete, doppioni, percentuali fuori scala
const c = sanitizeConfig({
  settings: { chatterPct: 0.15, pubRate: 2, baseUsd: "300.4" },
  fees: { 10: 0.23, abc: 0.5, 11: 7 },
  rates: { 10: 0.05, 11: "", xx: 0.2 },
  links: [
    { creatorId: 10, linkName: "Linkscale_X", publisher: "  Mario   Rossi " },
    { creatorId: 10, linkName: "Linkscale_X", publisher: "Altro" },
    { creatorId: 0, linkName: "x", publisher: "y" },
    { creatorId: 11, linkName: "", publisher: "y" },
    { creatorId: 11, linkName: "tw", publisher: "Lia", from: "2026-10-05" },
    { creatorId: 12, linkName: "tw", publisher: "Lia", from: "ottobre" },
  ],
});
eq(c.settings, { chatterPct: 0.15, pubRate: 0.1, baseUsd: 300 }, "tariffa fuori scala → predefinita 10%, base arrotondata");
eq(c.rates, { 10: 0.05 }, "tariffa per profilo: vuota o id non numerico scartati");
eq(rateFor(c, 10), 0.05, "tariffa del profilo");
eq(rateFor(c, 99), 0.1, "senza tariffa del profilo vale quella di tutti");
eq(c.fees, { 10: 0.23, 11: DEFAULT_FEE }, "fee: id non numerico scartato, fee >1 → predefinita");
eq(c.links.length, 3, "doppione e righe vuote scartati");
eq(c.links[0].publisher, "Mario Rossi", "spazi del nome normalizzati");
eq(c.links[1].from, "2026-10-05", "data valida tenuta");
eq(c.links[2].from, null, "data non valida → null");
eq(feeFor(c, 10), 0.23, "fee impostata");
eq(feeFor(c, 99), DEFAULT_FEE, "fee mancante → 45%");

// La torta: fee 45%, chatter 15%, publisher 10% → all'agenzia 20 centesimi per dollaro
const t = splitDollar(0.45, 0.1, { chatterPct: 0.15 });
ok(Math.abs(t.clean - 0.3) < 1e-9 && Math.abs(t.agency - 0.2) < 1e-9, "torta da bambino");
const low = splitDollar(0.23, 0.1, { chatterPct: 0.15 });
ok(low.agency < 0 && Math.abs(low.agency + 0.02) < 1e-9, "fee 23%: con 10% al publisher l'agenzia perde 2 centesimi per dollaro");
eq(splitDollar(0.1, 0.05, { chatterPct: 0.15 }).clean, 0, "fee sotto il chatter → pulito zero, mai negativo");

// Maturità e mesi
ok(isMature("2026-09-01T10:00:00Z", "2026-10-01T10:00:00Z"), "30 giorni esatti = chiuso");
ok(!isMature("2026-09-01T10:00:01Z", "2026-10-01T10:00:00Z"), "un secondo prima = aperto");
ok(!isMature("boh", "2026-10-01"), "data rotta = non chiuso");
eq(monthOf("2026-10-31T23:30:00Z"), "2026-11", "mese all'ora di Roma");
eq(monthOf("2026-10-31T21:30:00Z"), "2026-10", "stesso giorno a Roma");
eq(monthClosesOn("2026-10"), "2026-12-01", "ottobre si chiude dopo 30 giorni dal 31");
eq(monthClosesOn("2026-02"), "2026-03-31", "febbraio corto");

// Conto del mese
const config = sanitizeConfig({
  settings: { chatterPct: 0.15, pubRate: 0.1, baseUsd: 300 },
  fees: { 1: 0.45, 2: 0.23 },
  rates: { 2: 0.04 },
  links: [
    { creatorId: 1, linkName: "Linkscale_X", publisher: "Mario" },
    { creatorId: 2, linkName: "twitter", publisher: "Mario" },
    { creatorId: 1, linkName: "X_lia", publisher: "Lia", from: "2026-09-10" },
  ],
});
const fans = [
  { creatorId: 1, linkName: "Linkscale_X", userId: "a", subStart: "2026-09-02T10:00:00Z", d30: 100 },
  { creatorId: 1, linkName: "Linkscale_X", userId: "b", subStart: "2026-09-20T10:00:00Z", d30: 20 },
  { creatorId: 2, linkName: "twitter", userId: "c", subStart: "2026-09-05T10:00:00Z", d30: 50 },
  { creatorId: 1, linkName: "X_lia", userId: "d", subStart: "2026-09-05T10:00:00Z", d30: 999 },
  { creatorId: 1, linkName: "X_lia", userId: "e", subStart: "2026-09-12T10:00:00Z", d30: 30 },
  { creatorId: 1, linkName: "senza_padrone", userId: "f", subStart: "2026-09-12T10:00:00Z", d30: 5 },
];
const m = computeMonth({ fans, config, dataUntil: "2026-10-15T00:00:00Z" });
eq(m.unassigned, 1, "fan da link non assegnato contato a parte");
const mario = m.publishers.find((p) => p.name === "Mario");
const lia = m.publishers.find((p) => p.name === "Lia");
eq(mario.subs, 3, "Mario: tre fan su due profili");
eq(mario.spend30, 170, "spesa sommata");
// pulito: a 100×0,30=30, b 20×0,30=6, c 50×0,08=4 → 40 ; publisher: a 10, b 2, c 50×0,04=2 → 14
eq(mario.value, 40, "valore pulito per l'agenzia (fee per profilo)");
eq(mario.bonus, 14, "bonus = tariffa sulla spesa, con la tariffa del profilo dove c'è");
eq(mario.total, 314, "base + bonus");
eq(mario.margin, -274, "all'agenzia: pulito − bonus − base");
eq(mario.fans.find((f) => f.userId === "c").rate, 0.04, "la riga del fan porta la sua tariffa");
eq(mario.immature, 1, "il fan del 20/9 non ha ancora chiuso i 30 giorni al 15/10");
ok(!mario.final, "mese provvisorio finché c'è un fan aperto");
eq(mario.fans[0].userId, "a", "fan in ordine di spesa");
ok(Math.abs(mario.topShare - 100 / 170) < 1e-9, "quota del fan più grosso");
eq(lia.subs, 1, "il fan entrato prima del 'dal' non conta per Lia");
ok(lia.final === true && lia.immature === 0, "Lia: fan del 12/9 chiuso al 15/10 (30 giorni passati)");
const later = computeMonth({ fans, config, dataUntil: "2026-11-01T00:00:00Z" });
ok(later.publishers.every((p) => p.final), "a novembre tutto settembre è definitivo");
eq(m.publishers[0].name, "Mario", "ordine per totale");
eq(computeMonth({ fans: [], config, dataUntil: "2026-10-01" }).publishers, [], "mese vuoto");

console.log(`publisher-x: ${n} asserzioni ok`);
