// Unit test — la scaletta (funzioni pure). Esegui: node tests/scaletta.mjs
//
// Copre le decisioni facili da rompere per sbaglio:
//   - ogni rapporto ha il SUO denominatore (propone ancora / vendono, 2° comprato / 2° proposto)
//   - la stima "lasciato sul tavolo" conta SOLO i casi che dipendono da noi
//   - sotto campione → "pochi dati" (few), e il tasso del 2° gradino ripiega sul riferimento
//   - operatori: duo e "nessun turno" esclusi
//   - prove: inizio portato al lunedì, percentuali tra 0 e 1, esito nel verso giusto
import assert from "node:assert/strict";
import {
  compactMain, sumC, funnel, stopBreakdown, warmTable, massRecent, operatorTable, weeklySeries,
  cleanProva, provaView, suggestTargets, C_COLS, M_COLS, P_COLS, toRow, MIN_SESSIONS,
} from "../src/lib/scaletta-core.js";
import { windowBounds, scalettaSQL, massSQL, payersSQL } from "../src/lib/scaletta-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const near = (a, b, m, eps = 1e-9) => { assert.ok(Math.abs(a - b) < eps, `${m}: ${a} ≠ ${b}`); n++; };

const raw = (o) => ({ wk: "2026-10-05", creator_id: 1, op: "Anna", eng: "7-15", warm: false, n: 0, sold: 0, cont: 0, b2: 0, b3: 0, rev: 0, l1: 0, l2: 0, l3: 0, p2sum: 0, b2vid: 0,
  w_fin: 0, w_money: 0, w_go: 0, w_gone: 0, w_noreply: 0, w_chat: 0, w_asks: 0, w_gift: 0, ...o });

// ── compactMain: le due tabelle sommano gli stessi totali ──
const rows = [
  raw({ n: 100, sold: 20, cont: 12, b2: 6, b3: 3, rev: 2000, l1: 90, l2: 150, l3: 210, p2sum: 360, b2vid: 5, w_fin: 1, w_money: 1, w_go: 1, w_gone: 2, w_noreply: 1, w_chat: 2, w_asks: 1, w_gift: 3 }),
  raw({ op: "(duo)", eng: "0-2", warm: true, n: 50, sold: 5, cont: 1, b2: 1, rev: 300, p2sum: 50, w_gone: 2, w_chat: 2 }),
  raw({ op: "Anna", eng: "0-2", warm: "true", n: 10, sold: 1 }),
];
const { c, o } = compactMain(rows);
const tc = sumC(c, {});
eq(tc.n, 160, "totale conversazioni per creator");
eq(o.reduce((a, r) => a + r[3], 0), 160, "totale conversazioni per operatore = stesso totale");
eq(c.length, 2, "Anna/duo con stesso eng+warm si fondono nella tabella per creator");
eq(sumC(c, { warm: true }).n, 60, "warm come stringa 'true' riconosciuto");

// ── funnel: denominatori ──
const f = funnel(tc);
near(f.sold_rate, 26 / 160, "vendono / conversazioni");
near(f.cont_rate, 13 / 26, "propone ancora / conversazioni che vendono");
near(f.second_if_proposed, 7 / 13, "2° comprato / 2° proposto");
near(f.b3_rate, 3 / 26, "3+ / conversazioni che vendono");
eq(f.ladder, [30, 50, 70], "prezzi medi dei gradini sulle conversazioni 3+");
near(f.p2_avg, 410 / 7, "prezzo medio del 2°");
eq(f.stopped, 12, "ferme = somma dei motivi");
eq(funnel(sumC([], {})).sold_rate, null, "niente dati → null, mai 0");
ok(funnel(sumC([], {})).few, "niente dati → pochi dati");

// ── stopBreakdown: solo i casi nostri nella stima ──
const sb = stopBreakdown(tc);
eq(sb.ours, 5, "nostri = resta e scrive + senza risposta");
near(sb.ours_share, 5 / 12, "quota nostra sulle ferme");
// pochi dati (cont=13 < MIN_SOLD=15, b2=7 < 15) → ripiega sul riferimento
const refT = sumC(compactMain([raw({ n: 1000, sold: 300, cont: 200, b2: 100, p2sum: 6000, w_chat: 10 })]).c, {});
const sb2 = stopBreakdown(tc, { fallback: refT });
near(sb2.lost, 5 * (100 / 200) * 60, "lost = nostri × tasso 2° (rif.) × prezzo 2° (rif.)");
const sides = sb.reasons.filter((r) => r.side === "noi").map((r) => r.key).sort();
eq(sides, ["w_chat", "w_noreply"], "solo due motivi dipendono da noi");

// ── warmTable ──
const wt = warmTable(c, {});
eq(wt.length, 4, "quattro fasce di coinvolgimento");
const cold = wt.find((r) => r.eng === "0-2");
near(cold.with, 6 / 60, "fan freddi con riscaldamento");
eq(cold.without, null, "fascia vuota → null");

// ── operatorTable: duo escluso ──
const ot = operatorTable(o, {});
eq(ot.map((r) => r.op), ["Anna"], "duo e nessun turno esclusi");
ok(ot[0].sessions === 110 && !ot[0].few, "Anna: 110 conversazioni, dati sufficienti");
ok(operatorTable(o.map((r) => { const x = [...r]; x[3] = 5; return x; }), {})[0].few, `sotto ${MIN_SESSIONS} conversazioni → pochi dati`);

// ── massRecent ──
const m = [
  toRow(M_COLS, { wk: "recent", cid: 1, n: 280, paid: 50, price_p50: 27, ppc_p50: 3.9, cheap: 16, sconto: 4, liste: 70 }),
  toRow(M_COLS, { wk: "recent", cid: 2, n: 140, paid: 50, price_p50: 15, ppc_p50: 4.1, cheap: 0, sconto: 2, liste: 0 }),
  toRow(M_COLS, { wk: "2026-10-05", cid: 1, n: 70, paid: 12, price_p50: 25, ppc_p50: 3.5, cheap: 4, sconto: 1, liste: 10 }),
];
const mr = massRecent(m, [1]);
near(mr.per_day, 10, "mass al giorno su 28 giorni");
near(mr.cheap_share, 16 / 50, "pacchetti scontati sulle mass a pagamento");
near(massRecent(m, [1, 2]).ppc_p50, 4.0, "più pagine: mediana dei p50");
eq(massRecent(m, [9]), null, "pagina senza mass → null");

// ── weeklySeries ──
const p = [toRow(P_COLS, { wk: "2026-10-05", cid: 1, payers: 160, net: 10000 })];
const ws = weeklySeries({ cRows: c, mRows: m, pRows: p, ids: [1], weeks: ["2026-09-28", "2026-10-05"] });
eq(ws[0].sold_rate, null, "settimana senza conversazioni → null");
eq(ws[1].payers, 160, "fan che pagano della settimana");
near(ws[1].cheap_share, 4 / 12, "pacchetti scontati della settimana");
eq(ws[1].ppc_p50, 3.5, "prezzo per contenuto della settimana (una pagina)");

// ── prove ──
const cp = cleanProva({ creator_id: "1000000358", start: "2026-10-22", targets: { sold_rate: 0.18, cont_rate: "0.65", payers: 190, cheap_share: "" } });
ok(cp.ok, "prova valida");
eq(cp.prova.start, "2026-10-19", "inizio portato al lunedì");
eq(cp.prova.targets, { sold_rate: 0.18, cont_rate: 0.65, payers: 190 }, "obiettivi vuoti ignorati");
ok(!cleanProva({ creator_id: 1, start: "2026-10-19", targets: { sold_rate: 18 } }).ok, "percentuale 18 (non 0,18) rifiutata");
ok(!cleanProva({ creator_id: 1, start: "19/10/2026" }).ok, "data non ISO rifiutata");
ok(!cleanProva({ creator_id: "x", start: "2026-10-19" }).ok, "profilo non valido rifiutato");
const series = [
  { wk: "2026-09-21", sold_rate: 0.14, cheap_share: 0.4 }, { wk: "2026-09-28", sold_rate: 0.15, cheap_share: 0.3 },
  { wk: "2026-10-05", sold_rate: 0.16, cheap_share: 0.3 }, { wk: "2026-10-12", sold_rate: 0.15, cheap_share: 0.2 },
  { wk: "2026-10-19", sold_rate: 0.19, cheap_share: 0.1 },
];
const pv = provaView({ creator_id: 1, start: "2026-10-19", targets: { sold_rate: 0.18, cheap_share: 0 } }, series);
const ms = Object.fromEntries(pv.measures.map((x) => [x.key, x]));
near(ms.sold_rate.base, 0.15, "partenza = media delle 4 settimane prima");
eq(ms.sold_rate.hit, true, "0,19 ≥ 0,18 → raggiunto");
eq(ms.cheap_share.hit, false, "0,10 > 0 → non ancora (verso: più basso è meglio)");
eq(ms.b3_rate.hit, null, "senza obiettivo → nessun esito");
eq(pv.weeks_running, 1, "una settimana dalla partenza");
eq(provaView(null, series), null, "nessuna prova → null");

const sug = suggestTargets({ sold_rate: 0.15, cont_rate: 0.53, b3_rate: 0.10 }, { sold_rate: 0.30, cont_rate: 0.65, b3_rate: 0.15 }, { ppc_p50: 3.9 }, null);
near(sug.sold_rate, 0.18, "vendono: +20% della distanza dal riferimento");
near(sug.cont_rate, 0.65, "propone ancora: fino al riferimento");
eq(sug.cheap_share, 0, "pacchetti scontati: zero (decisione HOC)");
near(suggestTargets({ sold_rate: 0.4 }, { sold_rate: 0.3 }, null, null).sold_rate, 0.4, "già sopra il riferimento → non si chiede di peggiorare");

// ── SQL: finestre letterali e niente sorprese ──
const wb = windowBounds(new Date("2026-10-16T10:00:00Z"), 8);
eq(wb, { t0: "2026-08-17", t1: "2026-10-12" }, "finestra: 8 settimane chiuse fino al lunedì");
const o2 = { dataProject: "p", orgId: "org" };
const s1 = scalettaSQL({ ...o2, now: new Date("2026-10-16T10:00:00Z") });
ok(s1.includes("TIMESTAMP('2026-08-16')") && s1.includes("TIMESTAMP('2026-10-13')"), "date letterali per potare le partizioni");
ok(/PARTITION BY c\.id ORDER BY c\.commit_timestamp/.test(s1), "dedup per id di ws_chat");
ok((s1.match(/hoc\.ws_chat/g) || []).length === 1, "ws_chat letta una sola volta");
ok(s1.includes("isFromQueue"), "mass/coda escluse");
ok(massSQL(o2).includes("status = 'SENT'") && payersSQL(o2).includes("organization_id = 'org'"), "mass inviate, transazioni della sola HOC");

console.log(`scaletta: ${n} asserzioni ok`);
