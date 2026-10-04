import assert from "node:assert/strict";
import { shapeMetrics, weekWindows, provaMetricsSQL, METRICHE } from "../src/lib/manuale/prova-sql.js";
let n = 0; const t = (name, f) => { f(); n++; };
t("metriche: percentuali e divisioni per zero", () => {
  const m = shapeMetrics({ proposte: 3382, comprate: 513, acquisti: 513, seguito_dopo_acquisto: 277, rifiutate: 2869, ripresa_dopo_no: 847, scende_dopo_no: 442, prezzo_mediano: 37, prezzo_mediano_mai_paganti: null, a_fan_zitto: 86 });
  assert.equal(m.comprate_pct, 15.2); assert.equal(m.seguito_dopo_acquisto_pct, 54); assert.equal(m.scende_dopo_no_pct, 52.2);
  assert.equal(m.prezzo_mediano_mai_paganti, null);
  assert.equal(shapeMetrics({ proposte: 0 }).comprate_pct, null);
});
t("settimane: solo quelle chiuse da almeno un giorno", () => {
  const s = Date.parse("2026-10-05T00:00:00Z");
  assert.equal(weekWindows(s, s + 7 * 86400e3).length, 0);
  assert.equal(weekWindows(s, s + 8 * 86400e3).length, 1);
  assert.equal(weekWindows(s, s + 22 * 86400e3).length, 3);
});
t("sql: id creator numerico e finestre letterali", () => {
  const q = provaMetricsSQL({ dataProject: "p", creatorId: "123; DROP", from: 0, to: 86400e3 });
  assert.ok(!q.includes("DROP")); assert.ok(q.includes("TIMESTAMP('1970-01-02"));
});
t("ogni metrica con priorità ha una direzione", () => { for (const m of METRICHE) if (m.priorita) assert.ok(m.meglio); });
console.log(`manuale: ${n} test ok`);
