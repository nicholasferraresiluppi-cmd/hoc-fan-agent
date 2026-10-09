// node tests/analisi-vendite.mjs
import assert from "node:assert/strict";
import * as q from "../src/lib/analisi-vendite-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const now = new Date("2026-10-09T12:00:00Z");
const refs = { attributed: "p.onlyfans.attributed_transactions", subscriptions: "p.onlyfans.subscriptions", transactionsAnalytics: "p.onlyfans.transactions_analytics", kpi: "p.onlyfans.kpi", chargebacks: "p.postgres.public_chargebacks", users: "p.postgres.public_users", creators: "p.postgres.public_creators" };

// periodi di default come in Looker, fino a ieri
ok(JSON.stringify(q.defaultRange("recap", now)) === JSON.stringify({ from: "2026-09-25", to: "2026-10-08" }), "riepilogo: 14 giorni (Looker 25/9-8/10)");
ok(JSON.stringify(q.defaultRange("conversioni", now)) === JSON.stringify({ from: "2026-09-11", to: "2026-10-08" }), "conversioni: 28 giorni");
ok(q.defaultRange("rapporto", now).from === "2026-10-01", "rapporto: mese corrente");
// periodo precedente di pari durata (il % Δ)
ok(JSON.stringify(q.previousRange({ from: "2026-09-25", to: "2026-10-08" })) === JSON.stringify({ from: "2026-09-11", to: "2026-09-24" }), "periodo prima = 14 giorni subito prima");
ok(JSON.stringify(q.previousRange({ from: "2026-10-01", to: "2026-10-01" })) === JSON.stringify({ from: "2026-09-30", to: "2026-09-30" }), "un giorno → il giorno prima");
// variazione
ok(Math.abs(q.pctDelta(56945.36, 54545.36) - 0.044) < 0.001, "delta come Looker");
ok(q.pctDelta(10, 0) === null, "periodo prima a zero → nessuna percentuale");
// periodo richiesto: invertito, malformato, troppo lungo
ok(JSON.stringify(q.normalizeRange("recap", { from: "2026-10-08", to: "2026-10-01" }, now)) === JSON.stringify({ from: "2026-10-01", to: "2026-10-08" }), "date invertite rimesse in ordine");
ok(q.normalizeRange("recap", { from: "2026-13-40", to: "x" }, now).from === "2026-09-25", "date malformate → default");
ok(q.normalizeRange("recap", { from: "2020-01-01", to: "2026-10-08" }, now).from === "2025-09-03", "massimo 400 giorni");
// niente iniezioni: id solo numeri, date solo AAAA-MM-GG
ok(q.idList([1, "2", "3; DROP TABLE x", -4, 2]) === "1,2", "id non numerici scartati, doppioni tolti");
assert.throws(() => q.idList([]), /nessuna creator/); n++;
assert.throws(() => q.recapSql(refs, [1], { from: "2026-10-01' OR 1=1 --", to: "2026-10-08" }), /data non valida/); n++;
// le formule usano le tabelle e i filtri giusti
const conv = q.conversioniSql(refs, [1000000377], { from: "2026-09-11", to: "2026-10-08" });
ok(conv.includes("p.onlyfans.transactions_analytics") && conv.includes("DATE '2026-08-14'"), "conversioni leggono anche il periodo prima");
const rapp = q.rapportoSql(refs, [1], { from: "2026-10-01", to: "2026-10-08" });
ok(rapp.includes("net > 0") && rapp.includes("PERCENTILE_CONT(net, 0.5)") && rapp.includes("LAST_DAY"), "rapporto = hoc.sales_kpi (netto > 0, mediana vera, mese intero)");
ok(!/type\s*!=\s*'subscription'/.test(rapp), "rapporto NON esclude gli abbonamenti");
ok(q.transazioniSql(refs, [1], { from: "2026-10-01", to: "2026-10-08" }, 99999).includes("LIMIT 2000"), "tetto alle righe di transazioni");
ok(q.chargebackSql(refs, [1], { from: "2026-10-01", to: "2026-10-08" }).includes("created_at_transaction"), "chargeback per data della transazione");

console.log(`analisi-vendite: ${n} asserzioni ok`);
