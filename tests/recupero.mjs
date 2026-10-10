// node tests/recupero.mjs
import assert from "node:assert/strict";
import { pickFans, attachChats, buildPack, guardDraft, mergeResult, outcomeOf, daysBetween, RECUPERO_MODEL } from "../src/lib/recupero-core.js";
import { candidatesSql, recuperoChatSql, rebuySql, RECUPERO } from "../src/lib/recupero-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
ok(RECUPERO_MODEL === "claude-sonnet-5", "Sonnet 5");

// scelta: IT+EN insieme, tolti i lavorati, per valore
const names = { 1: "Rebecca Bardaro - IT", 2: "Rebecca Bardaro - EN", 3: "Stormy - IT" };
const cand = [
  { creator_id: 1, user_id: 10, username: "u10", spent60: "300", buys60: 5, last_buy: "2026-09-20" },
  { creator_id: 2, user_id: 20, username: "u20", spent60: "900", buys60: 9, last_buy: "2026-09-25" },
  { creator_id: 1, user_id: 11, username: "u11", spent60: "500", buys60: 2, last_buy: "2026-09-10" },
  { creator_id: 3, user_id: 30, username: null, spent60: "150", buys60: 1, last_buy: "2026-09-30" },
];
const g = pickFans(cand, names, new Set(["1:11"]), 12);
ok(g.length === 2 && g[0].person === "Rebecca Bardaro" && g[0].fans.map((f) => f.key).join() === "2:20,1:10", "persona unica, ordine per valore, lavorato tolto");
ok(g[0].fans[0].label === "F01" && g[0].fans[1].label === "F02", "etichette");
ok(pickFans(cand, names, new Set(), 1)[0].fans.length === 1, "tetto per creator");

const chats = [
  { creator_id: 2, user_id: 20, sent_at: "2026-09-26T10:00:00Z", from_fan: true, price: 0, text: "sono a Ibiza questa settimana" },
  { creator_id: 2, user_id: 20, sent_at: "2026-09-25T10:00:00Z", from_fan: false, price: 40, text: "guarda qui" },
];
const g2 = attachChats(g, chats);
ok(g2[0].fans[0].messages[0].ppv === 40 && g2[0].fans[0].messages[1].who === "FAN", "chat attaccate in ordine, PPV letto");
const pack = buildPack(g2[0], "2026-10-10");
ok(pack.includes("=== F01 — ha speso $900") && pack.includes("ultimo acquisto 15 giorni fa") && pack.includes("[PPV $40]"), "pacchetto");
ok(!pack.includes("u20") && !pack.includes(":20"), "niente username né id all'AI");
ok(daysBetween("2026-10-03T23:59:00Z", "2026-10-10") === 7 && daysBetween(null, "2026-10-10") === null, "giorni");

// il controllo sulle bozze
ok(guardDraft("Com'è andata a Ibiza? Spero tu ti sia riposato 😊").ok, "bozza buona passa");
ok(guardDraft("perché non mi rispondi più?").reason === "senso di colpa o rimprovero", "colpa bloccata");
ok(guardDraft("ho un video nuovo a 20$ per te").reason === "vende nel primo messaggio", "prezzo bloccato");
ok(guardDraft("ti faccio uno sconto speciale").reason === "vende nel primo messaggio", "sconto bloccato");
ok(guardDraft("solo oggi per te").reason === "urgenza finta", "urgenza bloccata");
ok(guardDraft("why are you ignoring me?").reason === "senso di colpa o rimprovero", "colpa in inglese");
ok(guardDraft("x".repeat(300)).reason === "troppo lunga" && guardDraft("").reason === "vuota", "lunghezza");

ok(guardDraft("Hey, just thinking about you after yesterday", 36).reason.includes("ieri") && guardDraft("Hey, just thinking about you after yesterday", 1).ok, "'ieri' solo se la chat è recente");
ok(guardDraft("ripensavo a ieri sera", null).ok, "senza data della chat non si blocca");
// unione risposta AI
const merged = mergeResult(g2[0], { fan: [
  { etichetta: "F01", perche: "è in vacanza", scrivere: "si", messaggio: "Com'è Ibiza? 😊", motivo_no: "" },
  { etichetta: "f02", perche: "ha detto basta", scrivere: "no", messaggio: "", motivo_no: "ha chiesto di non scrivergli" },
] }, "2026-10-10");
ok(merged[0].messaggio === "Com'è Ibiza? 😊" && merged[0].last_fan_text === "sono a Ibiza questa settimana" && merged[0].days_since_buy === 15, "scheda completa");
ok(merged[1].scrivere === "no" && merged[1].messaggio === null && merged[1].motivo_no.includes("non scrivergli"), "non scrivere rispettato");
const bad = mergeResult(g2[0], { fan: [{ etichetta: "F01", perche: "x", scrivere: "si", messaggio: "mi hai dimenticata?", motivo_no: "" }] }, "2026-10-10");
ok(bad[0].messaggio === null && bad[0].scartata.includes("senso di colpa") && bad[1].scartata.includes("non ha risposto"), "bozza scartata + fan senza risposta");

// esito
const o = outcomeOf([{ sent: true, spent_after: 50 }, { sent: true, spent_after: 0 }, { sent: false, spent_after: 0 }, { sent: false, spent_after: 0 }, { sent: false, spent_after: 20 }]);
ok(o.sent.fans === 2 && o.sent.rebought === 1 && o.sent.rate === 0.5 && o.sent.revenue === 50 && o.not_sent.rate === 1 / 3, "esito contattati vs no");

// SQL: parametri validati
const refs = { attributed: "a", chat: "c", users: "u" };
ok(candidatesSql(refs, [1, 2], "2026-10-10").includes(`spent60 >= ${RECUPERO.MIN_SPEND}`), "soglia spesa nella query");
assert.throws(() => candidatesSql(refs, [1], "ieri")); n++;
assert.throws(() => recuperoChatSql(refs, [["x", 1]], "2026-10-10")); n++;
ok(rebuySql(refs, [{ creator_id: 1, user_id: 2, from: "2026-10-01" }]).includes("DATE '2026-10-01'"), "rebuy");
console.log(`recupero: ${n} asserzioni ok`);
