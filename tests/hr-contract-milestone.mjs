// Unit test — Contratti da recuperare (18/10/2026). Esegui: node tests/hr-contract-milestone.mjs
import assert from "node:assert/strict";
import { planMilestones, needsContract, subtaskName } from "../src/lib/hr-contract-milestone-core.js";

let n = 0; const t = (name, fn) => { fn(); n++; };
const P = (id, f = {}, extra = {}) => ({ id, fields: { firstName: "Anna", surname: id, mansioni: ["Chatter"], collaborationStatus: "Attiva", ...f }, ...extra });

t("chi serve", () => {
  assert.equal(needsContract(P("a")), true);
  assert.equal(needsContract(P("b", { hvContractStatus: "Firmato" })), false);
  assert.equal(needsContract(P("c", { collaborationStatus: "Uscita" })), false);
  assert.equal(needsContract(P("d", {}, { archived: true })), false);
  assert.equal(needsContract(P("e", { mansioni: ["Board"] })), false);
  assert.equal(needsContract(P("f", { hvContractStatus: "Firma richiesta" })), true);
});

t("primo giro: un sottotask per chi non ha il contratto", () => {
  const plan = planMilestones([P("a"), P("b", { hvContractStatus: "Firmato" }), P("c")], {});
  assert.deepEqual(plan.create.map((p) => p.id), ["a", "c"]);
  assert.deepEqual(plan.close, []);
});

t("firmato → si chiude; già aperto → niente doppioni", () => {
  const items = { a: { taskId: "1", state: "open" }, c: { taskId: "2", state: "open" } };
  const plan = planMilestones([P("a", { hvContractStatus: "Firmato" }), P("c")], items);
  assert.deepEqual(plan.close, ["a"]);
  assert.deepEqual(plan.create, []);
});

t("chiuso da noi e poi di nuovo senza contratto (cambio mansione) → sottotask nuovo", () => {
  const plan = planMilestones([P("a", { hvContractStatus: "Da preparare" })], { a: { taskId: "1", state: "done" } });
  assert.deepEqual(plan.create.map((p) => p.id), ["a"]);
});

t("uscita o scheda sparita → si chiude", () => {
  const plan = planMilestones([P("a", { collaborationStatus: "Uscita" })], { a: { taskId: "1", state: "open" }, z: { taskId: "9", state: "open" } });
  assert.deepEqual(plan.close.sort(), ["a", "z"]);
});

t("nome del sottotask", () => {
  assert.equal(subtaskName(P("Rossi", { mansioni: ["Chatter", "Publisher"] })), "Anna Rossi · Chatter, Publisher");
});

console.log(`contratti da recuperare: ${n} prove OK`);
