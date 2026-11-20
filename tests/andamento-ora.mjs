// Unit test — Dentro un'ora (andamento-ora-core + insideHourSql). Esegui: node tests/andamento-ora.mjs
// Copre: lettura «un fan solo» sul caso vero (Alessandra 18/11 ore 19), scala di prezzi solo dentro lo stesso
// giorno, ora/id validati nell'SQL, organizzazione HOC sempre filtrata, handle mai il nome per esteso.
import assert from "node:assert/strict";
import { buildInsideHour, isRising, peakHour, vowelNumber, readInsideHour } from "../src/lib/andamento-ora-core.js";
import { insideHourSql } from "../src/lib/andamento-orario-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ORG = "5598597c-7fab-4fe1-acb3-5358df7d9dc5";
const refs = { attributed: "p.onlyfans.attributed_transactions", mass: "p.onlyfans.mass_transactions", subs: "p.onlyfans.subscriptions_intervals" };

// ── SQL ──
const sql = insideHourSql(refs, { ids: [1000000377, "x; DROP"], org: ORG, from: "2026-11-18", to: "2026-11-18", h: 19 });
ok(sql.includes("creator_id IN (1000000377)") && !sql.includes("DROP"), "solo id numerici");
ok(sql.includes(`organization_id = '${ORG}'`), "organizzazione HOC");
ok(sql.includes("EXTRACT(HOUR FROM DATETIME(created_at, 'Europe/Rome')) = 19"), "ora italiana");
ok(sql.includes("onlyfans\\\\.com/") || sql.includes("onlyfans\\.com/"), "handle dalla URL, non dal nome");
assert.throws(() => insideHourSql(refs, { ids: [1], org: ORG, from: "2026-11-18", to: "2026-11-18", h: 24 }), /ora non valida/); n++;
assert.throws(() => insideHourSql(refs, { ids: [1], org: ORG, from: "2026-11-18", to: "2026-11-18", h: "7; x" }), /ora non valida/); n++;

// ── scala ──
ok(isRising([16, 30, 80, 135, 200]), "scala vera");
ok(!isRising([16, 30]), "almeno 3 acquisti");
ok(!isRising([20, 20, 20]), "prezzo fermo non è una scala");
ok(!isRising([16, 80, 30]), "se scende non è una scala");

// ── caso vero ──
const J = (k, o) => ({ k, j: JSON.stringify(o) });
const buys = [[16, 12.8, "19:04"], [30, 24, "19:10"], [80, 64, "19:15"], [135, 108, "19:26"], [200, 160, "19:32"]]
  .map(([price, net, t]) => ({ ts: `2026-11-18T${t}`, price, net, kind: "chat" }));
const rows = [
  J("tot", { net: 544, tx: 7, fans: 3, days: 1 }),
  J("kind", { kind: "chat", net: 544, tx: 7, fans: 3 }),
  J("fan", { creator_id: 1, user_id: 10, handle: "tbrr7", tx: 5, net: 368.8, days: 1, buys, first_buy: "2026-10-12", before_net: 27.2, sub_from: null }),
  J("fan", { creator_id: 1, user_id: 11, handle: "jonny", tx: 1, net: 160, days: 1, buys: [{ ts: "2026-11-18T19:27", price: 200, net: 160, kind: "chat" }], first_buy: "2026-11-13", before_net: 59.2, sub_from: "2026-11-13" }),
  J("fan", { creator_id: 1, user_id: 12, handle: "u6", tx: 1, net: 15.2, days: 1, buys: [{ ts: "2026-11-18T19:59", price: 19, net: 15.2, kind: "chat" }], first_buy: "2026-11-18", before_net: 0, sub_from: null }),
];
const d = buildInsideHour(rows, { h: 19, from: "2026-11-18", to: "2026-11-18", names: { 1: "Alessandra Sparagno - IT" } });
ok(d.fans[0].handle === "tbrr7" && d.fans[0].rising, "il fan più grande in testa, scala riconosciuta");
ok(Math.round(d.top1_share * 100) === 68, "quota del fan più grande");
ok(d.reading[1].startsWith("È l'ora di un fan solo: tbrr7 vale il 68%"), "lettura: un fan solo");
ok(d.reading[1].includes("$16 → $30 → $80 → $135 → $200"), "lettura: i prezzi in sequenza");
ok(d.reading[1].includes("prima di quel giorno aveva speso $27"), "lettura: quanto aveva speso prima");
ok(d.fans[1].new_sub && d.fans[2].first_in_period, "iscritto da poco / primo acquisto");
ok(d.reading.some((s) => s.includes("1 compra per la prima volta")), "lettura: clienti nuovi");

// ── più giorni: la scala non si costruisce mescolando giorni diversi ──
const multi = buildInsideHour([
  J("tot", { net: 90, tx: 3, fans: 1, days: 3 }),
  J("kind", { kind: "chat", net: 90, tx: 3, fans: 1 }),
  J("fan", { creator_id: 1, user_id: 10, handle: "a", tx: 3, net: 90, days: 3, buys: ["01", "02", "03"].map((g, i) => ({ ts: `2026-11-${g}T16:10`, price: 10 * (i + 1), net: 8 * (i + 1), kind: "chat" })), first_buy: "2026-01-01", before_net: 500 }),
], { h: 16, from: "2026-11-01", to: "2026-11-03" });
ok(!multi.fans[0].rising, "tre giorni a prezzo crescente non sono una scala");
ok(multi.reading[0].includes("$30 al giorno"), "media al giorno su più giorni");

// ── vuota e picco ──
ok(buildInsideHour([J("tot", { net: 0, tx: 0, fans: 0, days: 0 })], { h: 3, from: "2026-11-18", to: "2026-11-18" }).reading[0].includes("non è entrato niente"), "ora vuota");
ok(peakHour([{ h: 1, net: 5 }, { h: 19, net: 544 }, { h: 20, net: 45 }]) === 19, "ora di picco");
ok(peakHour([{ h: 1, net: 0 }]) === null, "nessun picco senza incasso");

// ── italiano: «l'81%», «degli 8» ──
ok(vowelNumber(81) && vowelNumber(8) && vowelNumber(11) && vowelNumber(1) && !vowelNumber(18) && !vowelNumber(68), "numeri con la vocale");
const eight = buildInsideHour([
  J("tot", { net: 100, tx: 10, fans: 8, days: 1 }),
  J("kind", { kind: "chat", net: 77, tx: 4, fans: 4 }), J("kind", { kind: "mass", net: 23, tx: 6, fans: 6 }),
  ...[30, 27, 24, 4, 4, 4, 4, 3].map((v, i) => J("fan", { creator_id: 1, user_id: i, handle: `f${i}`, tx: 1, net: v, days: 1, buys: [{ ts: "2026-11-18T16:0" + i, price: v, net: v, kind: "chat" }], first_buy: "2026-11-18", before_net: 0 })),
], { h: 16, from: "2026-11-18", to: "2026-11-18" });
ok(eight.reading.some((x) => x.includes("valgono l'81%")), "l'81%");
ok(eight.reading.some((x) => x.startsWith("Degli 8 fan")), "Degli 8");
ok(eight.reading.filter((x) => x.includes("massivi")).length === 1, "massivi detti una volta sola");
ok(readInsideHour(eight).join() === eight.reading.join(), "la lettura si rifà uguale dai dati");

console.log(`andamento-ora: ${n} asserzioni ok`);
