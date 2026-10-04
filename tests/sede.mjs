// node tests/sede.mjs — la Sede (logica pura)
import assert from "node:assert/strict";
import { OFFICES, FLOORS, CADENCE, statusOf, gapsOf, lastWork, edges, officeById } from "../src/lib/sede.js";
let n = 0; const t = (name, fn) => { fn(); n++; };
const now = Date.parse("2026-10-04T10:00:00Z");

t("ogni ufficio ha piano, compito, risultato e cadenza validi; id unici", () => {
  const ids = new Set();
  for (const o of OFFICES) {
    assert.ok(!ids.has(o.id), o.id); ids.add(o.id);
    assert.ok(FLOORS.some((f) => f.id === o.piano), o.id);
    assert.ok(o.compito && o.risultato, o.id);
    assert.ok(CADENCE[o.cadenza], o.id);
  }
});
t("i flussi puntano solo a uffici esistenti", () => {
  for (const e of edges()) assert.ok(officeById(e.from) && officeById(e.to));
  assert.ok(edges().length > 10);
});
t("stato: lavora / in ritardo / errore / mai / persona / senza prova", () => {
  const cp = officeById("cp-sync");
  assert.equal(statusOf(cp, { at: now - 3600e3 }, now).stato, "lavora");
  assert.equal(statusOf(cp, { at: now - 40 * 3600e3 }, now).stato, "in_ritardo");
  assert.equal(statusOf(cp, { at: now - 3600e3, error: true }, now).stato, "errore");
  assert.equal(statusOf(cp, null, now).stato, "mai");
  assert.equal(statusOf(officeById("nicholas"), null, now).stato, "persona");
  assert.equal(statusOf(officeById("controllo-mattutino"), null, now).stato, "senza_prova");
});
t("coda ogni 5 minuti: in ritardo dopo mezz'ora", () => {
  const q = officeById("hr-queue");
  assert.equal(statusOf(q, { at: now - 10 * 60e3 }, now).stato, "lavora");
  assert.equal(statusOf(q, { at: now - 45 * 60e3 }, now).stato, "in_ritardo");
});
t("battito appena introdotto: in attesa fino alla prima notte, poi 'mai' è un buco", () => {
  const o = officeById("operator-signals");
  assert.equal(statusOf(o, null, now).stato, "attesa");
  assert.equal(statusOf(o, null, Date.parse("2026-10-06T10:00:00Z")).stato, "mai");
});
t("buchi: controllore, responsabile, prova, ritardo", () => {
  const o = officeById("operator-signals");
  const g = gapsOf(o, { owner: null, status: { stato: "in_ritardo" } }).map((x) => x.tipo);
  assert.deepEqual(g.sort(), ["controllore", "responsabile", "ritardo"].sort());
  assert.ok(gapsOf(officeById("controllo-mattutino"), { owner: "Nicholas" }).some((x) => x.tipo === "prova"));
  assert.deepEqual(gapsOf(officeById("nicholas"), {}), []);
});
t("ultimo lavoro leggibile", () => {
  assert.equal(lastWork(officeById("dispatch"), { failed_kicks: [] }), "Tutti i lavori partiti");
  assert.match(lastWork(officeById("alerts"), { checks: [{ found: 2 }, { found: 1, ok: false }] }), /2 controlli, 3 problemi/);
  assert.equal(lastWork(officeById("hr-queue"), { at: 1 }), "Coda vuota");
});
console.log(`sede: ${n} test ok`);
