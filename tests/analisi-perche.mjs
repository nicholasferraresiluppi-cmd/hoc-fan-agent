// node tests/analisi-perche.mjs
import assert from "node:assert/strict";
import { norm, labelFans, buildPack, verifyQuotes, parseAnalysis, dirOf, PERCHE_SCHEMA, PERCHE_MODEL } from "../src/lib/analisi-perche-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

ok(PERCHE_MODEL === "claude-sonnet-5", "modello scelto: Sonnet 5");
ok(norm("  Ciao   «amo»  ") === "ciao amo", "normalizza spazi e virgolette");

const fans = [{ creator_id: 7, user_id: 111, prev: 876, cur: 0, username: "marco_segreto" }, { creator_id: 7, user_id: 222, prev: 430, cur: 50.4 }];
const chats = [
  { creator_id: 7, user_id: 222, sent_at: "2026-08-29T17:49:00Z", from_fan: true, price: null, text: "Haha of course but not paying for it sweety 😘" },
  { creator_id: 7, user_id: 111, sent_at: "2026-08-28T09:18:00Z", from_fan: false, price: 0, text: "buongiorno comunque💙" },
  { creator_id: 7, user_id: 111, sent_at: "2026-08-16T21:08:00Z", from_fan: false, price: 100, text: "apri qui e ti mando il video" },
  { creator_id: 7, user_id: 222, sent_at: "2026-08-29T18:00:00Z", from_fan: false, price: null, text: "gratis i can't" },
];
const L = labelFans(fans, chats, { 7: "Alessandra Sparagno - IT" });
ok(L[0].label === "F01" && L[1].label === "F02", "etichette nell'ordine del codice");
ok(L[0].messages[0].at < L[0].messages[1].at && L[0].messages[0].ppv === 100, "messaggi in ordine di tempo, PPV letto");
ok(L[1].messages[0].who === "FAN" && L[1].messages[1].who === "NOI", "chi scrive");

const pack = buildPack({ person: "Alessandra Sparagno", range: { from: "2026-08-22", to: "2026-09-04" }, previous: { from: "2026-08-08", to: "2026-08-21" }, dir: "down",
  stats: { base_fans: 122, fans: 114, stopped: 98, spent_prev: 21970, spent_cur: 914, fan_silent: 72, us_silent: 43 },
  blasts: [{ t: "buonanotte💙", first_at: "2026-08-26T00:23:50Z", fans: 134, minutes: 5 }], fans: L, reasons: ["Meno fan che spendono: 249 invece di 281 (−11%)."] });
ok(pack.includes("hanno smesso del tutto di comprare: 98") && pack.includes('"buonanotte💙" → 134 fan in 5 min'), "pacchetto con i conti del codice");
ok(pack.includes("=== F01 (Alessandra Sparagno - IT) — speso $876") && pack.includes("[PPV $100]"), "pacchetto con le chat etichettate");
const packN = buildPack({ person: "X", range: { from: "2026-08-22", to: "2026-09-04" }, previous: { from: "2026-08-08", to: "2026-08-21" }, dir: "down", fans: L, normal: { base: 25570, prev: 27368, cur: 17993 } });
ok(packN.includes("+7% sul normale") && packN.includes("NON era un picco"), "il livello normale arriva all'AI col giudizio del codice");
ok(buildPack({ person: "X", range: { from: "a", to: "b" }, previous: { from: "a", to: "b" }, dir: "down", fans: L, normal: { base: 10000, prev: 14000, cur: 9000 } }).includes("ERA un picco"), "picco dichiarato");
ok(!pack.includes("111") && !pack.includes("222") && !pack.includes("marco_segreto"), "nessun id né username fan esce verso l'AI");
ok(L[0].username === "marco_segreto" && L[0].user_id === 111, "username e id restano per la pagina");

const ai = {
  sintesi: "I fan grossi sono stati lasciati soli.",
  cause: [{
    titolo: "Riprese tutte uguali", spiegazione: "…", tipo: "metodo", fan_letti: 40,
    esempi: [
      { fan: "F01", chi: "noi", citazione: "buongiorno comunque💙" }, // vera
      { fan: "f02", chi: "fan", citazione: "not paying for it" },       // vera, etichetta minuscola, pezzo di riga
      { fan: "F02", chi: "noi", citazione: "not paying for it" },       // lato sbagliato → scartata
      { fan: "F01", chi: "noi", citazione: "ti amo tanto" },            // inventata → scartata
      { fan: "F09", chi: "noi", citazione: "gratis i can't" },          // fan inesistente → scartata
    ],
  }],
  azioni: [{ chi: "operatore", cosa: "Ripresa personale" }],
  limiti: "Pochi fan.",
};
const v = verifyQuotes(ai, L);
ok(v.citazioni.verificate === 2 && v.citazioni.scartate === 3, "2 citazioni vere tenute, 3 scartate");
ok(v.cause[0].esempi[1].fan === "F02" && v.cause[0].esempi[1].spent_prev === 430, "esempio arricchito con la spesa del fan");
ok(v.cause[0].fan_letti === 2, "fan_letti non supera i fan letti");
ok(parseAnalysis('```json\n{"a":1}\n```').a === 1 && parseAnalysis('{"a":2}').a === 2, "JSON puro o in blocco");
ok(dirOf({ metrics: { revenue_diff: -10 } }) === "down" && dirOf({ metrics: { revenue_diff: 5 } }) === "up", "direzione dalla revenue");
ok(PERCHE_SCHEMA.required.includes("cause") && PERCHE_SCHEMA.properties.cause.items.properties.esempi, "schema risposta");
console.log(`analisi-perche: ${n} asserzioni ok`);
