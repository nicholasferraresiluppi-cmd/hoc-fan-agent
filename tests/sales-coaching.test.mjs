#!/usr/bin/env node
/**
 * Unit test del core puro del coaching vendite (src/lib/sales-coaching-core.js).
 * Zero dipendenze: `node tests/sales-coaching.test.mjs`.
 */
import {
  compactRows, summarizePages, summarizeOperators, weeklySeries, referenceBenchmark,
  behaviorLifts, experimentView, mondayOf, pickExamples, assembleExamples,
  stripExampleForOperators, shrinkIndex, MIN_OP_PPV, SHRINK,
} from "../src/lib/sales-coaching-core.js";
import { exampleMessagesSQL, salesCoachingSQL, windowBounds } from "../src/lib/sales-coaching-sql.js";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error("  ✗ " + msg); } }
const near = (a, b, eps = 1e-9) => a != null && Math.abs(a - b) < eps;

// riga agg in formato warehouse
const agg = (o) => ({ kind: "agg", wk: "2026-08-03", creator_id: 1, op: "Anna", welcome: false, prior: false, n: 0, buys: 0, net: 0, e_buy: 0, e_net: 0, live_n: 0, live_buys: 0, dead_n: 0, dead_buys: 0, tech_n: 0, tech_buys: 0, ...o });

// 1) compattazione: tipi normalizzati, kind separati
const c1 = compactRows([
  agg({ n: "10", buys: "2", welcome: "true" }),
  { kind: "lift", creator_id: 1, prior: false, kb: "1", feature: "live", fval: true, n: 30, buys: 6 },
  { kind: "cand", creator_id: 1, uid: "99", ts: "2026-08-04T10:00:00Z", op: "Anna", price: 20, net: 16 },
]);
ok(c1.agg.length === 1 && c1.lift.length === 1 && c1.cand.length === 1, "compact separa i kind");
ok(c1.agg[0][5] === 10 && c1.agg[0][3] === true, "compact converte numeri e booleani da stringa");

// 2) pagine: il benvenuto NON entra nella conversione in chat
const weeks = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"];
const rows2 = [];
for (const wk of weeks) {
  rows2.push(agg({ wk, n: 100, buys: 10, net: 200, live_n: 70, dead_n: 20, tech_n: 5 })); // mai paganti 10%
  rows2.push(agg({ wk, prior: true, n: 50, buys: 20, net: 600, live_n: 40 }));          // paganti 40%
  rows2.push(agg({ wk, welcome: true, n: 300, buys: 12, net: 60 }));                    // benvenuto 4%
}
const c2 = compactRows(rows2);
const pg = summarizePages(c2.agg);
ok(pg.recent_weeks.length === 4 && pg.prev_weeks.length === 4, "4 settimane recenti + 4 precedenti");
ok(near(pg.total.conv_nonpayer, 0.1), "conversione mai-paganti = 10% (benvenuto escluso)");
ok(near(pg.total.conv_payer, 0.4), "conversione già-paganti = 40%");
ok(near(pg.total.conv_welcome, 0.04), "benvenuto misurato a parte");
ok(near(pg.total.live_share, 110 / 150), "quota chat viva sulle vendite in chat");
ok(pg.total.net === 4 * (200 + 600 + 60), "incasso include anche il benvenuto");

// 3) indice operatore: shrinkage e soglia di affidabilità
ok(near(shrinkIndex(0, 0, SHRINK), 1), "nessun dato → indice 1 (non estremo)");
const rows3 = [
  agg({ op: "Brava", n: 200, buys: 60, net: 1200, e_buy: 30, e_net: 600 }),
  agg({ op: "Piccola", n: 20, buys: 20, net: 400, e_buy: 2, e_net: 40 }),
  agg({ op: "(duo)", n: 500, buys: 50, net: 1000, e_buy: 50, e_net: 1000 }),
  agg({ op: "Brava", welcome: true, n: 999, buys: 999, net: 9999 }),
];
const ops = summarizeOperators(compactRows(rows3).agg);
const brava = ops.find((o) => o.op === "Brava");
const piccola = ops.find((o) => o.op === "Piccola");
ok(!ops.some((o) => o.op.startsWith("(")), "duo/nessun turno esclusi dagli operatori");
ok(brava.ppv === 200, "benvenuto escluso dal volume dell'operatore");
ok(brava.index_net > 1 && brava.index_net < 2, "indice sopra 1 ma ridotto dallo shrinkage");
ok(piccola.reliable === false && piccola.index_net === null, `sotto ${MIN_OP_PPV} PPV l'indice non si mostra`);
ok(ops[0].op === "Brava", "ordinamento per indice, i non affidabili in fondo");

// 4) serie settimanale per operatore
const ser = weeklySeries(c2.agg, { op: "Anna" });
ok(ser.length === 8 && near(ser[0].conv, 0.1), "serie settimanale = mai-paganti, benvenuto e paganti esclusi");

// 5) riferimento HOC: pagine modello (conversione assoluta) + operatori modello
const rows5 = [];
for (let i = 0; i < 12; i++) rows5.push(agg({ creator_id: 100 + i, op: "op" + i, n: 500, buys: 10 + i * 10, net: 100 + i * 50, e_buy: 30 + i * 10, e_net: 300, live_n: 100 + i * 5, tech_n: i * 3 }));
rows5.push(agg({ creator_id: 999, op: "piccola", n: 50, buys: 49 })); // pagina sotto soglia volume
const ref = referenceBenchmark(compactRows(rows5).agg, { top: 3, modelPages: 2, minPagePpv: 400 });
ok(ref.model_pages.length === 2 && ref.model_pages[0].creator_id === 111, "pagine modello = conversione mai-paganti più alta");
ok(!ref.model_pages.some((p) => p.creator_id === 999), "pagina sotto il volume minimo esclusa dalle modello");
ok(near(ref.goal.conv_nonpayer, (120 + 110) / 1000), "obiettivo = pagine modello insieme (pooled)");
ok(ref.operators.some((o) => o.source === "team modello") && ref.operators.some((o) => o.source === "indice più alto"), "operatori modello da entrambe le fonti");
ok(new Set(ref.operators.map((o) => o.op)).size === ref.operators.length, "nessun operatore duplicato");
ok(ref.operators_evaluated === 12, "conta gli operatori valutati");

// 6) lift stratificati: effetto dentro la cella, non tra celle
// cella A (creator 1): con=30% su 100, senza=10% su 100 ; cella B (creator 2): con=50% su 30, senza=40% su 300
const L = (cid, fval, n, buys, prior = false) => ({ kind: "lift", creator_id: cid, prior, kb: "1", feature: "bonus", fval, n, buys });
const c6 = compactRows([L(1, true, 100, 30), L(1, false, 100, 10), L(2, true, 30, 15), L(2, false, 300, 120), L(3, true, 10, 9), L(3, false, 100, 1), L(1, true, 500, 500, true)]);
const lf = behaviorLifts(c6.lift, { minCell: 25 });
// pesi: A=100, B=30 ; con = (100*.3+30*.5)/130 ; senza = (100*.1+30*.4)/130
ok(near(lf.bonus.with, (30 + 15) / 130) && near(lf.bonus.without, (10 + 12) / 130), "media pesata per cella (min n)");
ok(lf.bonus.cells === 2, "cella sotto soglia esclusa (creator 3)");
ok(near(lf.bonus.usage, 140 / 640), "uso calcolato su tutti i mai-paganti");
ok(lf.live.with === null, "feature senza dati → null, non 0");
const lfSplit = behaviorLifts(c6.lift, { creatorIds: [2], minCell: 25 });
ok(near(lfSplit.bonus.diff, 0.1), "filtro split: solo le celle delle sue pagine");

// 7) esperimento: baseline prima dell'inizio, periodo dopo
ok(mondayOf("2026-08-06") === "2026-08-03", "mondayOf porta al lunedì");
ok(mondayOf("2026-08-03") === "2026-08-03", "mondayOf su lunedì resta uguale");
ok(mondayOf("boh") === null, "mondayOf data invalida → null");
const rows7 = [];
weeks.forEach((wk, i) => rows7.push(agg({ wk, op: i >= 6 ? "Nuovo" : "Anna", n: 100, buys: i >= 6 ? 20 : 8 })));
const ev = experimentView(compactRows(rows7).agg, { creator_id: 1, start: "2026-08-12", target: 0.1, operators: ["Nuovo"] });
ok(near(ev.baseline, 0.08) && ev.baseline_ppv === 400, "baseline = 4 settimane prima dell'inizio");
ok(near(ev.during, 48 / 300) && ev.during_ppv === 300, "periodo del test dal lunedì di inizio (settimana di avvio inclusa)");
ok(ev.enough_data === true, "campione sufficiente sopra 150 PPV");
ok(near(ev.operators[0].conv, 0.2), "conversione per operatore del test");

// 8) esempi: max per operatore, varietà di creator, deterministico
const cand = [
  { creator_id: 1, uid: "1", ts: "a", op: "X", price: 20, net: 50 },
  { creator_id: 1, uid: "2", ts: "b", op: "X", price: 20, net: 40 },
  { creator_id: 2, uid: "3", ts: "c", op: "X", price: 20, net: 10 },
  { creator_id: 3, uid: "4", ts: "d", op: "Y", price: 20, net: 10 },
  { creator_id: 3, uid: "5", ts: "e", op: "Z", price: 20, net: 99 },
];
const picks = pickExamples(cand, ["X", "Y"], { perOp: 2 });
ok(picks.length === 3, "solo operatori-riferimento, max per operatore");
ok(picks[0].uid === "1" && picks[1].creator_id === 2, "prima creator diverse, poi per incasso");
const msgs = [
  { creator_id: 1, uid: "1", ts: "a", at: "t1", out_: false, price: null, txt: "ciao" },
  { creator_id: 1, uid: "1", ts: "a", at: "t2", out_: true, price: null, txt: "ciao  [nome]" },
  { creator_id: 1, uid: "1", ts: "a", at: "t3", out_: true, price: 20, txt: "eccolo" },
  { creator_id: 2, uid: "3", ts: "c", at: "t1", out_: true, price: 20, txt: "solo uno" },
];
const exs = assembleExamples(msgs, picks, (p) => "id-" + p.uid);
ok(exs.length === 1 && exs[0].id === "id-1", "esempi con meno di 3 messaggi scartati");
ok(exs[0].messages[1].text === "ciao [nome]", "spazi normalizzati, oscuramento preservato");
const stripped = stripExampleForOperators({ ...exs[0], note: "guarda il pacchetto" }, "Martina");
ok(!("op" in stripped) && !("creator_id" in stripped) && stripped.creator === "Martina", "versione operatori senza nome operatore né id interni");
ok(!JSON.stringify(stripped).includes("uid"), "nessun uid nel payload operatori");

// 9) SQL generato: escape e finestra letterale (bug reale set 2026: '\\b' nel
// sorgente JS usciva come '\b' = BACKSPACE in BigQuery → nomi dei fan non oscurati)
const exSql = exampleMessagesSQL({ dataProject: "P", picks: [{ creator_id: 1, uid: "2", ts: "2026-09-01T10:00:00Z" }] });
ok(exSql.includes("CONCAT('(?i)\\\\b', nm.fn, '\\\\b')"), "confine di parola emesso come \\\\b nel literal BigQuery");
ok(!exSql.includes("(?!"), "nessun lookahead (RE2 non lo supporta)");
ok(/BETWEEN TIMESTAMP\('2026-09-01T09:00:00.000Z'\) AND TIMESTAMP\('2026-09-01T11:00:00.000Z'\)/.test(exSql), "finestra esempio letterale ±1h");
const wb = windowBounds(new Date("2026-09-24T12:00:00Z"));
ok(wb.t1 === "2026-09-21" && wb.t0 === "2026-07-27", "finestra: lunedì di (oggi−3g), 8 settimane indietro");
const mainSql = salesCoachingSQL({ dataProject: "P", orgId: "O", now: new Date("2026-09-24T12:00:00Z") });
ok(mainSql.includes("c.created_at >= TIMESTAMP('2026-07-25')") && !mainSql.includes("SELECT t0 FROM bounds"), "ws_chat filtrata con costanti (potatura partizioni)");

console.log(`sales-coaching: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
