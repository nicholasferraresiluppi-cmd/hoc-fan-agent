// node tests/confronto-lettura.mjs
import assert from "node:assert/strict";
import { median, ratiosOf, groupMedians, letturaOf, withLettura } from "../src/lib/confronto-lettura.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const row = (o) => ({ gross: 50000, gross_prev: 50000, gross_delta: 0, reach: 100000, payers: 500, payers_prev: 500, payers_delta: 0,
  ns_subs: 1000, ns_conv: 100, fan_gross: 50000, top10: 5000, reach_delta: 0, clicks_delta: 0, ...o });

ok(median([3, 1, 2]) === 2 && median([1, 2, 3, 4]) === 2.5 && median([null, NaN]) === null, "mediana");
// floor di campione: rapporti su numeri piccoli = null
const tiny = ratiosOf(row({ payers: 10, ns_subs: 20, reach: 500 }));
ok(tiny.arppu === null && tiny.conv === null && tiny.top10 === null && tiny.eff === null, "sotto i floor nessun rapporto");

const group = [row({}), row({}), row({}), row({ gross: 150000 }), row({ gross: 20000, reach: 200000 }), row({ ns_conv: 40, reach_delta: 0.9 }), row({ top10: 20000 })];
const med = groupMedians(group);
ok(med.eff === 500 && med.conv === 0.1, "mediane del gruppo");
ok(letturaOf(group[0], med) === "In linea con il gruppo.", "in linea");
ok(/Il pubblico rende molto/.test(letturaOf(group[3], med)) && /\$1\.500/.test(letturaOf(group[3], med)), "rende di più, cifra col punto delle migliaia");
ok(/Tanto pubblico che rende poco: \$100/.test(letturaOf(group[4], med)), "tanto pubblico rende poco");
ok(/Traffico in forte crescita \(\+90%\), ma paga solo il 4% dei nuovi \(tipica 10%\)/.test(letturaOf(group[5], med)), "traffico su, conversione giù");
ok(/il 40% del lordo da 10 fan/.test(letturaOf(group[6], med)), "dipendenza dai top 10");
ok(letturaOf(row({ gross: 0 }), med) === "Nessun incasso nel periodo.", "senza incasso");
// al massimo due frasi, le più forti
const many = row({ gross: 10000, reach: 200000, payers: 400, ns_conv: 30, top10: 6000, fan_gross: 10000, gross_delta: -0.5, gross_prev: 20000 });
ok(letturaOf(many, med).split(". ").length <= 3, "massimo due frasi");
// il calo del lordo richiede un periodo prima non trascurabile
ok(!/calo/.test(letturaOf(row({ gross_delta: -0.9, gross_prev: 500 }), med)), "niente calo su base minuscola");
ok(withLettura(group).rows.every((r) => typeof r.lettura === "string"), "withLettura su ogni riga");
console.log(`confronto-lettura: ${n} asserzioni ok`);
