// node tests/sede-controllori.mjs — Controllo delle uscite (logica pura)
import assert from "node:assert/strict";
import { CONTROLLI, controlloById, runControl } from "../src/lib/sede-controllori.js";
let n = 0; const t = (name, fn) => { fn(); n++; };
const now = Date.parse("2026-10-05T05:30:00Z");
const iso = (h) => new Date(now - h * 3600e3).toISOString();
const run = (id, d, prev) => runControl(controlloById(id), d, prev, now);

t("un controllo per ognuno dei 6 uffici", () => assert.equal(CONTROLLI.length, 6));
t("risultato mancante = non credibile (caso Misura del progresso)", () => {
  for (const c of CONTROLLI) assert.equal(runControl(c, null, null, now).ok, false, c.id);
});
t("segnali operatori: buono, vecchio, crollato, mediane rotte", () => {
  const good = { operators: 175, generated_at: iso(3), org_medians: { question_rate: 0.3, avg_ppv_price: 30, ppv_per_h: 4, msgs_per_h: 40, slow_reply_rate: 0 } };
  assert.equal(run("operator-signals", good, { operatori: 170 }).ok, true);
  assert.match(run("operator-signals", { ...good, generated_at: iso(40) }).problemi.join(), /vecchio/);
  assert.match(run("operator-signals", { ...good, operators: 90 }, { operatori: 175 }).problemi.join(), /crollati/);
  assert.match(run("operator-signals", { ...good, org_medians: { ...good.org_medians, avg_ppv_price: null } }).problemi.join(), /non validi/);
});
t("cosa fa vendere: segnale chiave che si ribalta = da verificare", () => {
  const sig = (key, dir, cons) => ({ key, label: key, direction: dir, consistency: cons });
  const good = { shifts_analyzed: 5344, creators_analyzed: 38, generated_at: iso(3), signals: [sig("ppv_avg_price", "up", 0.97), sig("ppv_cadence", "up", 0.95)] };
  assert.equal(run("academy-signals", good).ok, true);
  const flip = { ...good, signals: [sig("ppv_avg_price", "down", 0.4), sig("ppv_cadence", "up", 0.95)] };
  assert.match(run("academy-signals", flip).problemi.join(), /non conferma più lo studio/);
});
t("misura del progresso: poche traiettorie", () => {
  assert.equal(run("transfer", { operators: Array(120).fill({}), months: ["a", "b", "c"] }).ok, true);
  assert.equal(run("transfer", { operators: Array(5).fill({}), months: ["a"] }).ok, false);
});
t("difficoltà creator: troppi indici mancanti", () => {
  const profiles = Array.from({ length: 48 }, (_, i) => ({ difficulty_index: i < 38 ? 50 : null }));
  assert.equal(run("creator-difficulty", { creators_total: 48, profiles, generated_at: iso(30) }).ok, true);
  const few = profiles.map((p, i) => ({ difficulty_index: i < 5 ? 50 : null }));
  assert.match(run("creator-difficulty", { creators_total: 48, profiles: few, generated_at: iso(30) }).problemi.join(), /indice/);
});
t("il lunedì della città: non uscito o email non partita", () => {
  assert.equal(run("citta-lunedi", { weekly: { at: now - 2 * 86400e3, open: [] }, beat: { ok: true } }).ok, true);
  assert.match(run("citta-lunedi", { weekly: { at: now - 10 * 86400e3, open: [] } }).problemi.join(), /non è uscito/);
  assert.match(run("citta-lunedi", { weekly: { at: now - 86400e3, open: [] }, beat: { ok: false } }).problemi.join(), /email non è partita/);
});
t("fan in attesa: zero improbabile, crollo", () => {
  assert.equal(run("queue", { at: now - 3 * 3600e3, creators: 40, fans_total: 1844 }, { fan: 1700 }).ok, true);
  assert.match(run("queue", { at: now - 3 * 3600e3, creators: 40, fans_total: 0 }).problemi.join(), /Zero fan/);
  assert.match(run("queue", { at: now - 3 * 3600e3, creators: 40, fans_total: 200 }, { fan: 1844 }).problemi.join(), /crollati/);
});
t("un controllo che si rompe non fa cadere niente: diventa un problema", () => {
  const r = runControl({ check() { throw new Error("boom"); } }, {}, null, now);
  assert.equal(r.ok, false); assert.match(r.problemi[0], /boom/);
});
console.log(`sede-controllori: ${n} test ok`);
