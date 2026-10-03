// Test del sales manager AI (logica pura): node tests/sales-ai.mjs
import assert from "node:assert/strict";
import {
  quoteSpeaker, buildPacks, guard, renderMessage, citationExists, unknownPercents, normCaption, leverRoom,
  romeDayBounds, costUSD, LEVERS, BULK_MIN,
} from "../src/lib/sales-ai/core.js";
import { captionStatsFromRows } from "../src/lib/sales-ai/sql.js";
import { extractQuotes, FEEDBACK_SCHEMA } from "../src/lib/sales-ai/agents.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

const CID = "100";
const T0 = Date.parse("2026-10-03T06:00:00Z");
const min = (k) => new Date(T0 + k * 60e3).toISOString();
const shifts = [{ creator_id: CID, member_name: "Anna Bianchi", start: T0 - 3600e3, end: T0 + 5 * 3600e3 }];
const day = { dayStart: T0 - 6 * 3600e3, dayEnd: T0 + 18 * 3600e3, now: T0 + 20 * 3600e3 };

function convo(uid, startMin, { exchanges = 6, ppvPrice = 30, caption = "guarda cosa ti ho preparato", fanLast = 1 } = {}) {
  const ms = [];
  let k = startMin;
  for (let i = 0; i < exchanges; i++) {
    ms.push({ creator_id: CID, user_id: uid, at: min(k++), out: false, price: 0, text: `ciao ${i}` });
    ms.push({ creator_id: CID, user_id: uid, at: min(k++), out: true, price: 0, text: `risposta ${i}` });
  }
  ms.push({ creator_id: CID, user_id: uid, at: min(k + fanLast - 1), out: true, price: ppvPrice, text: caption });
  return ms;
}

t("PPV attribuito, scambi e minuti dall'ultimo messaggio", () => {
  const msgs = convo("u1", 10, { exchanges: 5 });
  const [p] = buildPacks({ messages: msgs, shifts, buys: [], ...day });
  assert.equal(p.operator, "Anna Bianchi");
  assert.equal(p.metrics.ppv_a_mano, 1);
  assert.equal(p.moments[0].scambi_ora_prima, 9);
  assert.ok(p.moments[0].min_da_ultimo_msg_fan <= 2);
  assert.equal(p.metrics.pct_ppv_fan_ha_scritto_2min, 1);
});

t("PPV di benvenuto escluso (fan mai scritto, entro 30')", () => {
  const msgs = [{ creator_id: CID, user_id: "u2", at: min(0), out: true, price: 10, text: "benvenuto" }];
  const packs = buildPacks({ messages: msgs, shifts, buys: [], ...day });
  assert.equal(packs[0]?.metrics.ppv_a_mano ?? 0, 0);
});

t("benvenuto riconosciuto anche col primo contatto fuori finestra", () => {
  const msgs = [{ creator_id: CID, user_id: "u3", at: min(100), out: true, price: 10, text: "eccomi" }];
  const packs = buildPacks({ messages: msgs, shifts, buys: [], firstSeen: { [`${CID}:u3`]: min(-500) }, ...day });
  assert.equal(packs[0].metrics.ppv_a_mano, 1, "fan vecchio senza messaggi: non è benvenuto");
});

t("invio di massa escluso (stesso testo ≥ soglia nella stessa ora)", () => {
  const msgs = [];
  for (let i = 0; i < BULK_MIN; i++) msgs.push({ creator_id: CID, user_id: `m${i}`, at: min(i % 50), out: true, price: 0, text: "heyy amo, che fai? 🤍" });
  msgs.push(...convo("u4", 70));
  const [p] = buildPacks({ messages: msgs, shifts, buys: [], ...day });
  assert.equal(p.metrics.ppv_a_mano, 1);
  assert.equal(p.metrics.pct_risposta_fan_15min, null, "i messaggi di massa non contano come testi dell'operatore");
});

t("turno in duo: niente attribuzione", () => {
  const duo = [...shifts, { creator_id: CID, member_name: "Bruno Neri", start: T0, end: T0 + 3600e3 }];
  const packs = buildPacks({ messages: convo("u5", 10), shifts: duo, buys: [], ...day });
  assert.equal(packs.length, 0);
});

t("acquisto entro 72h con lo stesso importo = venduto; importo diverso no", () => {
  const msgs = convo("u6", 10, { ppvPrice: 37 });
  const at = new Date(T0 + 3 * 3600e3).toISOString();
  const [p1] = buildPacks({ messages: msgs, shifts, buys: [{ creator_id: CID, user_id: "u6", at, amount: 37 }], ...day });
  assert.equal(p1.metrics.ppv_comprati, 1);
  const [p2] = buildPacks({ messages: msgs, shifts, buys: [{ creator_id: CID, user_id: "u6", at, amount: 20 }], ...day });
  assert.equal(p2.metrics.ppv_comprati, 0);
});

t("caption a bassa resa marcata solo con campione sufficiente", () => {
  const cap = "mi piacerebbe che tu mi togliessi tutto";
  const stats = { [CID]: { avg_rate: 0.12, captions: { [normCaption(cap)]: { n: 331, rate: 0.057 }, [normCaption("poco usata")]: { n: 12, rate: 0 } } } };
  const msgs = [...convo("u7", 10, { caption: cap }), ...convo("u8", 100, { caption: "poco usata" })];
  const [p] = buildPacks({ messages: msgs, shifts, buys: [], captionStats: stats, ...day });
  assert.equal(p.metrics.caption_bassa_resa_usi, 1);
  assert.equal(p.caption_ripetute[0].resa_creator_pct, 5.7);
});

t("normCaption conta i code point come SUBSTR (emoji)", () => {
  const s = "🤍".repeat(130);
  assert.equal(Array.from(normCaption(s)).length, 120);
  assert.equal(normCaption("  Ciao   <b>AMO</b> "), "ciao amo");
});

t("richiesta del fan di vedere → proposta entro 10'", () => {
  const msgs = [
    { creator_id: CID, user_id: "u9", at: min(5), out: false, price: 0, text: "dai fammi vedere" },
    { creator_id: CID, user_id: "u9", at: min(6), out: true, price: 0, text: "aspetta" },
    { creator_id: CID, user_id: "u9", at: min(8), out: true, price: 25, text: "eccomi" },
  ];
  const [p] = buildPacks({ messages: msgs, shifts, buys: [], firstSeen: { [`${CID}:u9`]: min(-900) }, ...day });
  assert.equal(p.metrics.richieste_fan, 1);
  assert.equal(p.metrics.pct_richieste_con_proposta, 1);
});

/* Garante */
const pack = buildPacks({ messages: convo("u10", 10, { caption: "te la apro tutta così mi dai il buongiorno" }), shifts, buys: [], ...day })[0];
const good = {
  decisione: "consegna", motivo: "", riscontro: "", apertura: "Ieri hai proposto al momento giusto.",
  forza: { momento_id: "M1", citazione: "te la apro tutta così", perche: "hai ripreso le sue parole" },
  regola: { leva: "proponi_a_chat_viva", quando: "il fan ti sta scrivendo", allora: "proponi adesso", esempio: "guarda" },
  cambio_facile: "", numeri: ["pct_ppv_fan_ha_scritto_2min"], per_la_direzione: "", incubatrice: [], confidenza: "media",
};

t("citazione vera passa, inventata no", () => {
  assert.ok(citationExists(pack, "M1", "te la apro tutta così"));
  assert.ok(!citationExists(pack, "M1", "una frase mai scritta"));
  assert.ok(!citationExists(pack, "M9", "te la apro tutta così"), "momento inesistente");
  assert.ok(!citationExists(pack, "M1", "ciao 0"), "riga del FAN non vale come citazione dell'operatore");
});

t("Garante: leva senza margine bloccata (già 100% a chat viva)", () => {
  const g = guard(good, pack);
  assert.ok(!g.ok);
  assert.ok(g.problems.some((p) => p.includes("margine")));
});

t("Garante: leva dell'incubatrice mai prescritta", () => {
  const g = guard({ ...good, regola: { ...good.regola, leva: "dopo_8_scambi" } }, pack);
  assert.ok(g.problems.some((p) => p.includes("incubatrice")));
  assert.equal(LEVERS.dopo_8_scambi.prescrivibile, false);
  assert.equal(LEVERS.ritmo.prescrivibile, false);
});

t("Garante: consigli vietati, confronti, cattive notizie, nomi, percentuali inventate", () => {
  const bad = { ...good, regola: { ...good.regola, leva: "nessuna" }, apertura: "Rispetto ai colleghi Bruno fa di più: fai più domande, sei scesa al 4%." };
  const g = guard(bad, pack, { operatorNames: ["Anna Bianchi", "Bruno Neri"] });
  const all = g.problems.join(" | ");
  for (const k of ["domande", "colleghi", "cattiva notizia", "Bruno", "4%"]) assert.ok(all.includes(k), `manca: ${k} in ${all}`);
});

t("Garante: feedback pulito con leva 'nessuna' passa", () => {
  const g = guard({ ...good, regola: { ...good.regola, leva: "nessuna" } }, pack, { operatorNames: ["Anna Bianchi"] });
  assert.deepEqual(g.problems, []);
});

t("percentuali: solo quelle presenti nel pacchetto", () => {
  assert.deepEqual(unknownPercents("ieri 100% partite mentre scriveva", pack), []);
  assert.deepEqual(unknownPercents("vendi il 37%", pack), [37]);
});

t("i numeri del messaggio li scrive il codice", () => {
  const msg = renderMessage({ ...good, regola: { ...good.regola, leva: "nessuna" } }, pack);
  assert.ok(msg.includes("proposte partite mentre il fan scriveva: 100%"));
  assert.ok(!msg.includes("Da provare oggi"), "leva nessuna: niente regola nel messaggio");
});

t("leverRoom", () => {
  assert.equal(leverRoom("caption_bassa_resa", { caption_bassa_resa_usi: 0 }), false);
  assert.equal(leverRoom("niente_ppv_a_freddo", { ppv_fan_zitto_1h: 2 }), true);
  assert.equal(leverRoom("fan_chiede_vedere", { richieste_fan: 3, pct_richieste_con_proposta: 0.33 }), true);
});

t("giornata italiana con ora legale e solare", () => {
  const s = romeDayBounds("2026-10-03");
  assert.equal(new Date(s.start).toISOString(), "2026-10-02T22:00:00.000Z");
  assert.equal(new Date(s.end).toISOString(), "2026-10-03T22:00:00.000Z");
  const w = romeDayBounds("2026-12-01");
  assert.equal(new Date(w.start).toISOString(), "2026-11-30T23:00:00.000Z");
  const cambio = romeDayBounds("2026-10-25"); // fine ora legale: giornata di 25 ore
  assert.equal((cambio.end - cambio.start) / 3600e3, 25);
});

t("costi: batch a metà prezzo", () => {
  const u = { input_tokens: 1e6, output_tokens: 1e5 };
  assert.equal(costUSD("claude-opus-5", u, { batch: false }), 5 + 2.5);
  assert.equal(costUSD("claude-opus-5", u), (5 + 2.5) / 2);
});

t("statistiche caption dalle righe SQL", () => {
  const s = captionStatsFromRows([{ creator_id: "1", cap: "a", n: "100", buys: "5" }, { creator_id: "1", cap: "b", n: "100", buys: "15" }, { creator_id: "1", cap: "c", n: "3", buys: "3" }]);
  assert.equal(s["1"].avg_rate, 23 / 203);
  assert.ok(!s["1"].captions.c, "sotto 10 invii non entra in tabella");
});

t("estrazione citazioni dai report", () => {
  const q = extractQuotes('In M21 lei scrive «te la apro tutta tutta» e poi M4: "mi piacerebbe che tu mi togliessi"');
  assert.deepEqual(q.map((x) => x.id), ["M21", "M4"]);
});

t("schema del feedback: solo leve prescrivibili + 'nessuna'", () => {
  const e = FEEDBACK_SCHEMA.properties.regola.properties.leva.enum;
  assert.ok(e.includes("nessuna") && !e.includes("dopo_8_scambi") && !e.includes("ritmo"));
  assert.ok(!FEEDBACK_SCHEMA.properties.numeri.items.enum.includes("ppv_ora"));
});

t("citazione con l'etichetta [PPV $x] del sistema: vale lo stesso (caso Kevin, 3/10)", () => {
  assert.ok(citationExists(pack, "M1", "te la apro tutta così [PPV $30]"));
});

t("verifica dei report: le frasi del fan risultano trovate, dette dal fan", () => {
  assert.equal(quoteSpeaker(pack, "M1", "ciao"), null, "troppo corta");
  assert.equal(quoteSpeaker(pack, "M1", "risposta 3"), "OPERATORE");
  const p2 = buildPacks({ messages: [{ creator_id: CID, user_id: "z", at: min(1), out: false, price: 0, text: "mi fai vedere la patatina" }, ...convo("z", 3)], shifts, buys: [], ...day })[0];
  assert.equal(quoteSpeaker(p2, "M1", "mi fai vedere la patatina"), "FAN");
});

t("niente «quando quando» nel messaggio", () => {
  const msg = renderMessage({ ...good, regola: { leva: "proponi_a_chat_viva", quando: "Quando il fan ti scrive", allora: "allora proponi", esempio: "" } }, pack);
  assert.ok(msg.includes("quando il fan ti scrive, proponi"), msg);
});

console.log(`sales-ai: ${n} test ok`);
