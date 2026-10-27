// node tests/publisher-x.mjs — logica pura del conto publisher X.
import assert from "node:assert/strict";
import { isXLink, sanitizeConfig, splitDollar, rateFor, isMature, monthOf, toEnvelopes, monthPayout, monthsHistory, publisherForEmails, feeFor, DEFAULT_FEE } from "../src/lib/publisher-x-core.js";

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
eq(monthOf("2026-10-31T23:30:00Z"), "2026-11", "mese all'ora di Roma");
eq(monthOf("2026-10-31T21:30:00Z"), "2026-10", "stesso giorno a Roma");

// Persone: email e account solo per publisher che esistono
const pp = sanitizeConfig({
  links: [{ creatorId: 1, linkName: "X_a", publisher: "Mario" }],
  people: { Mario: { email: " Mario@Example.com ", userId: "user_abc", invitedAt: 5 }, Fantasma: { email: "f@x.it" } },
});
eq(Object.keys(pp.people), ["Mario"], "persona senza link scartata");
eq(pp.people.Mario.email, "mario@example.com", "email normalizzata");
eq(pp.people.Mario.userId, undefined, "nessun account salvato: si riconosce dall'email");
eq(publisherForEmails(pp, ["altro@x.it", "MARIO@example.com"]), "Mario", "riconosciuto dall'email verificata");
eq(publisherForEmails(pp, ["altro@x.it"]), null, "email non registrata = nessun publisher");
const dup = sanitizeConfig({ links: [{ creatorId: 1, linkName: "a", publisher: "A" }, { creatorId: 1, linkName: "b", publisher: "B" }], people: { A: { email: "s@x.it" }, B: { email: "s@x.it" } } });
eq(publisherForEmails(dup, ["s@x.it"]), null, "stessa email su due publisher = ambiguo, nessun accesso");
eq(sanitizeConfig({ links: [{ creatorId: 1, linkName: "X_a", publisher: "Mario" }], people: { Mario: { email: "non-email" } } }).people, {}, "email non valida scartata");

// Buste
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
  { creatorId: 1, linkName: "Linkscale_X", userId: "a", subStart: "2026-09-02T10:00:00Z", d30: 100 }, // chiude 2/10
  { creatorId: 1, linkName: "Linkscale_X", userId: "b", subStart: "2026-09-20T10:00:00Z", d30: 20 },  // chiude 20/10
  { creatorId: 2, linkName: "twitter", userId: "c", subStart: "2026-09-05T10:00:00Z", d30: 50 },      // chiude 5/10
  { creatorId: 1, linkName: "Linkscale_X", userId: "g", subStart: "2026-08-20T10:00:00Z", d30: 70 },  // chiude 19/9
  { creatorId: 1, linkName: "X_lia", userId: "d", subStart: "2026-09-05T10:00:00Z", d30: 999 },       // prima del "dal"
  { creatorId: 1, linkName: "X_lia", userId: "e", subStart: "2026-10-12T10:00:00Z", d30: 30 },        // aperta
  { creatorId: 1, linkName: "senza_padrone", userId: "f", subStart: "2026-09-12T10:00:00Z", d30: 5 },
];
const env = toEnvelopes({ fans, config, dataUntil: "2026-10-15T00:00:00Z" });
eq(env.length, 5, "esclusi il fan prima del 'dal' e quello del link senza publisher");
const A = env.find((e) => e.userId === "a"), B = env.find((e) => e.userId === "b"), E = env.find((e) => e.userId === "e");
ok(A.closed && A.day === 30 && A.closeMonth === "2026-10", "busta chiusa il 2/10: conta in ottobre");
ok(!B.closed && B.day === 25, "busta aperta: giorno 25 di 30 al 15/10");
eq(E.day, 3, "entrato il 12/10: giorno 3");
eq(A.bonus, 10, "10% di 100");
eq(env.find((e) => e.userId === "c").bonus, 2, "tariffa del profilo 4% su 50");

const oct = monthPayout({ envelopes: env, config, month: "2026-10" });
const mario = oct.publishers.find((p) => p.name === "Mario");
eq(mario.subs, 2, "ottobre: buste chiuse di a e c");
eq(mario.bonus, 12, "10 + 2");
eq(mario.total, 312, "più la base");
eq(mario.openCount, 1, "b ancora aperta");
eq(mario.openBonus, 2, "b sta maturando 2");
eq(mario.value, 34, "pulito per l'agenzia: 30 + 4");
eq(mario.margin, -278, "pulito − bonus − base");
ok(Math.abs(mario.topShare - 100 / 150) < 1e-9, "quota del fan più grosso sulle buste chiuse");
const sep = monthPayout({ envelopes: env, config, month: "2026-09" }).publishers.find((p) => p.name === "Mario");
eq(sep.subs, 1, "settembre: la busta di g, chiusa il 19/9");
const lia = oct.publishers.find((p) => p.name === "Lia");
ok(lia && lia.subs === 0 && lia.openCount === 1 && lia.total === 300, "Lia: nessuna busta chiusa, una aperta, solo la base");
eq(oct.publishers[0].name, "Mario", "ordine per totale");

const hist = monthsHistory(env.filter((e) => e.publisher === "Mario"), 300);
eq(hist.map((h) => h.month), ["2026-10", "2026-09"], "storico dal mese più recente");
eq(hist[0].closed, 2, "due buste chiuse in ottobre");
eq(hist[1].total, 307, "settembre: 7 + 300");

console.log(`publisher-x: ${n} asserzioni ok`);
