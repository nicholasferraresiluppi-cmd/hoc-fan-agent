// node tests/analisi-vendite-diagnosi.mjs
import assert from "node:assert/strict";
import { personOf, marketOf, groupPersons, metricsOf, statusOf, reasonsOf, buildDiagnosi, summaryOf, oddPrevOf } from "../src/lib/analisi-vendite-diagnosi.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const row = (id, o = {}) => ({ creator_id: id, revenue: 0, revenue_prev: 0, spenders: 0, spenders_prev: 0, subs: 0, subs_prev: 0, conv_base: 0, conv: 0, conv_base_prev: 0, conv_prev: 0, clicks: 0, clicks_prev: 0, d0: 0, d0_subs: 0, d0_prev: 0, d0_subs_prev: 0, chargebacks: 0, chargeback_amount: 0, chargeback_amount_prev: 0, ...o });

ok(personOf("Fishball - IT") === "Fishball" && personOf("Cubanita") === "Cubanita", "persona dall'alias");
ok(marketOf("Rebecca Bardaro - EN") === "EN" && marketOf("Cubanita") === "", "mercato dall'alias");

// IT ed EN della stessa persona si sommano
const names = { 1: "Fishball - IT", 2: "Fishball - EN", 3: "Stormy - IT" };
const persons = groupPersons([row(1, { revenue: 100, spenders: 10 }), row(2, { revenue: 50, spenders: 5 }), row(3, { revenue: 7 })], names, [{ creator_id: 1, day: "2026-10-01", revenue: 60 }, { creator_id: 2, day: "2026-10-01", revenue: 40 }]);
const fish = persons.find((p) => p.name === "Fishball");
ok(persons.length === 2 && fish.totals.revenue === 150 && fish.totals.spenders === 15 && fish.accounts.length === 2, "IT + EN = una persona");
ok(fish.daily["2026-10-01"] === 100, "andamento giornaliero sommato");

// caso reale Alessandra 2-8/10 contro 25/9-1/10: revenue −16%, fan −12%, spesa −4%, abbonati +12%, conversione 10,6% → 7,5%
const aleT = { revenue: 8079, revenue_prev: 9575, spenders: 106, spenders_prev: 120, transactions: 0, transactions_prev: 0, subs: 559, subs_prev: 500, conv_base: 559, conv: 42, conv_base_prev: 500, conv_prev: 53, clicks: 0, clicks_prev: 0, d0: 0, d0_subs: 0, d0_prev: 0, d0_subs_prev: 0, chargebacks: 0, chargeback_amount: 0, chargeback_amount_prev: 0 };
const ale = metricsOf(aleT);
ok(statusOf(ale) === "in-calo", "−16% e −$1.496 = in calo");
const rs = reasonsOf(ale);
ok(rs[0].kind === "spenders" && rs[0].text.includes("106 invece di 120"), "leva principale: meno fan che spendono");
ok(rs[1].kind === "conversion" && rs[1].text.startsWith("Arrivano più nuovi abbonati, ma ne comprano di meno") && rs[1].text.includes("7,5% invece di 10,6%"), "perché: più arrivi ma conversione giù — " + rs[1].text);

// congiunzioni: "ma" solo se le direzioni sono opposte
const upUp = reasonsOf(metricsOf({ ...aleT, revenue: 12000, spenders: 160, subs: 700, conv_base: 700, conv: 100 }));
ok(upUp[1].text.startsWith("Arrivano più nuovi abbonati e ne comprano di più"), "più arrivi e più conversione: 'e' — " + upUp[1].text);
const downUp = reasonsOf(metricsOf({ ...aleT, revenue: 12000, spenders: 160, subs: 300, conv_base: 300, conv: 50 }));
ok(downUp[1].text.startsWith("Arrivano meno nuovi abbonati, ma ne comprano di più"), "meno arrivi ma più conversione: 'ma' — " + downUp[1].text);

// spesa a testa come leva principale
const spend = metricsOf({ ...aleT, revenue: 6000, revenue_prev: 9000, spenders: 120, spenders_prev: 120 });
const rspend = reasonsOf(spend);
ok(rspend[0].kind === "spend" && rspend[0].text.includes("$50 a testa invece di $75"), "leva: ogni fan spende meno — " + rspend[0].text);

// stabile, crescita, pochi dati
ok(statusOf(metricsOf({ ...aleT, revenue: 9300, revenue_prev: 9575 })) === "stabile", "−3% = stabile");
ok(statusOf(metricsOf({ ...aleT, revenue: 12000, revenue_prev: 9575 })) === "in-crescita", "+25% = in crescita");
ok(statusOf(metricsOf({ ...aleT, revenue: 120, revenue_prev: 200 })) === "pochi-dati", "sotto $300 non si giudica");
ok(statusOf(metricsOf({ ...aleT, revenue: 9575 * 0.85, revenue_prev: 9575 })) === "in-calo", "−15% oltre $300 = in calo");
ok(statusOf(metricsOf({ ...aleT, revenue: 1700, revenue_prev: 1950 })) === "stabile", "−13% ma solo −$250: non è un calo da segnalare");

// segnali di contorno
const traffic = metricsOf({ ...aleT, clicks: 900, clicks_prev: 1650 });
ok(reasonsOf(traffic).some((r) => r.kind === "traffic" && r.text.includes("900 click invece di 1.650")), "traffico dai link in calo");
ok(!reasonsOf(metricsOf({ ...aleT, clicks: 90, clicks_prev: 150 })).some((r) => r.kind === "traffic"), "pochi click: niente segnale");
const cb = metricsOf({ ...aleT, chargebacks: 3, chargeback_amount: 300, chargeback_amount_prev: 50 });
ok(reasonsOf(cb).some((r) => r.kind === "chargeback"), "chargeback raddoppiati");

// un solo fan pesa tanto: lo si dice per primo
const whale = reasonsOf(metricsOf({ ...aleT, revenue: 775, revenue_prev: 3236, spenders: 22, spenders_prev: 16, top_fan: 120, top_fan_prev: 2500 }));
ok(whale[0].kind === "whale" && whale[0].text.includes("$2.500") && whale[0].text.includes("77%"), "fan grosso nel periodo prima — " + whale[0].text);
const noWhale = reasonsOf(metricsOf({ ...aleT, top_fan: 200, top_fan_prev: 300 }));
ok(!noWhale.some((r) => r.kind === "whale"), "nessun fan dominante: niente frase");

// ordinamento: prima chi perde più dollari, in fondo chi ha pochi dati
const out = buildDiagnosi(
  [row(1, { revenue: 9000, revenue_prev: 10000, spenders: 90, spenders_prev: 100 }), row(3, { revenue: 1000, revenue_prev: 2000, spenders: 10, spenders_prev: 20 }), row(4, { revenue: 50, revenue_prev: 40 }), row(5, { revenue: 5000, revenue_prev: 3000, spenders: 50, spenders_prev: 30 })],
  { 1: "Grande - IT", 3: "Piccola - IT", 4: "Minima - IT", 5: "Cresce - IT" },
  [], ["2026-10-01"]
);
ok(out[0].name === "Grande" && out[1].name === "Piccola" && out[out.length - 1].name === "Minima", "in calo prima; a pari dollari persi la più grande; pochi dati in fondo");
ok(out.find((p) => p.name === "Cresce").status === "in-crescita", "crescita riconosciuta");
const s = summaryOf(out);
ok(s.down === 2 && s.up === 1 && s.few === 1 && s.revenue === 15050, "riassunto");


// livello normale (10/10): il periodo prima era un picco → tornare al normale non è un calo
const peakT = { ...aleT, revenue: 10000, revenue_prev: 14000, revenue_base: 10200, base_missing: 0 };
const peak = metricsOf(peakT);
ok(oddPrevOf(peak) === "peak", "periodo prima +37% sul normale = picco");
ok(statusOf(peak) === "stabile", "−29% sul periodo prima ma −2% sul normale = stabile");
const pr = reasonsOf(peak);
ok(pr[0].kind === "peak" && pr[0].text.includes("sopra il solito") && pr[0].text.includes("in linea con il normale"), "il picco si dice per primo — " + pr[0].text);
// caso reale Alessandra 22/8-4/9: periodo prima solo +7% sul normale → NON è un picco, il calo resta
const realAle = metricsOf({ ...aleT, revenue: 17993, revenue_prev: 27368, revenue_base: 25570, base_missing: 0 });
ok(oddPrevOf(realAle) === null && statusOf(realAle) === "in-calo", "Alessandra: Ferragosto non era un picco, il calo è vero");
// sotto il picco ma ancora molto sotto il normale → in calo, con la frase
const deep = metricsOf({ ...peakT, revenue: 7000 });
ok(statusOf(deep) === "in-calo" && reasonsOf(deep)[0].text.includes("−31% rispetto al normale"), "dopo un picco ma sotto il normale = in calo");
// buco nel periodo prima → la ripresa non è una crescita
const dip = metricsOf({ ...aleT, revenue: 10000, revenue_prev: 7000, revenue_base: 9800, base_missing: 0 });
ok(oddPrevOf(dip) === "dip" && statusOf(dip) === "stabile" && reasonsOf(dip)[0].kind === "dip", "ripresa da un buco = stabile");
// senza 8 settimane di storia (o con un account nuovo) il livello normale non c'è
ok(metricsOf({ ...peakT, base_missing: 1 }).revenue_base === null && oddPrevOf(metricsOf({ ...peakT, base_missing: 1 })) === null, "senza storia niente livello normale");
// zero vendite dopo un periodo normale = account fermo, non "più fan che spendono: 0 invece di 28"
const zero = reasonsOf(metricsOf({ ...aleT, revenue: 0, spenders: 0, revenue_prev: 1519, spenders_prev: 28, subs: 0, conv_base: 0, conv: 0 }));
ok(zero.length === 1 && zero[0].kind === "nodata" && zero[0].text.includes("ancora collegato"), "zero vendite: si dice di controllare l'account — " + zero[0].text);
console.log(`analisi-vendite-diagnosi: ${n} asserzioni ok`);
