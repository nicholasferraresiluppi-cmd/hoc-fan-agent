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

// 19/10/2026: il sottotask aperto segue la scheda (mansione aggiunta dopo, testo con i nomi di ClickUp)
{
  const { subtaskSig, subtaskDescription } = await import("../src/lib/hr-contract-milestone-core.js");
  const before = P("a", { mansioni: [] });
  const after = P("a", { mansioni: ["Chatter"] });
  const items = { a: { taskId: "1", state: "open", sig: subtaskSig(before) } };
  const plan = planMilestones([after], items);
  if (plan.update.length !== 1 || plan.create.length || plan.close.length) throw new Error("update atteso");
  if (planMilestones([after], { a: { taskId: "1", state: "open", sig: subtaskSig(after) } }).update.length) throw new Error("niente update se uguale");
  if (planMilestones([after], { a: { taskId: "1", state: "open" } }).update.length !== 1) throw new Error("sottotask vecchi senza impronta: si riscrivono una volta");
  const d = subtaskDescription(P("a", { hvContractStatus: "Firma richiesta" }));
  if (!d.includes("HV Contract Status nel CRM: Signature Requested.") || !d.includes("«Signed»")) throw new Error("testo con i nomi di ClickUp: " + d);
  console.log("sottotask allineati alla scheda: ok");
}

// 19/10/2026: firmato ma non più valido — rientro o cambio di mansione
{
  const { contractChecks } = await import("../src/lib/hr-contract-milestone-core.js");
  const S = (id, f) => P(id, { hvContractStatus: "Firmato", ...f });
  // primo giro: tutti i firmati diventano punto di partenza, nessun allarme
  let r = contractChecks([S("a"), S("b", { mansioni: [] }), P("c")], {});
  if (r.resets.length) throw new Error("primo giro senza allarmi");
  // b riceve la prima mansione: non è un cambio
  r = contractChecks([S("b", { mansioni: ["Chatter"] })], r.snaps);
  if (r.resets.length) throw new Error("prima mansione non è un cambio");
  // a cambia mansione → contratto nuovo
  const r2 = contractChecks([S("a", { mansioni: ["Sales Manager"] })], r.snaps);
  if (r2.resets.length !== 1 || !/cambio di mansione/.test(r2.resets[0].reason)) throw new Error("cambio mansione");
  // uscita e rientro con lo stato rimasto «Firmato» → contratto nuovo
  let s = contractChecks([S("x")], {}).snaps;
  s = contractChecks([S("x", { collaborationStatus: "Uscita" })], s).snaps;
  const r3 = contractChecks([S("x", { collaborationStatus: "In ingresso" })], s);
  if (r3.resets.length !== 1 || !/rientro/.test(r3.resets[0].reason)) throw new Error("rientro");
  // firmato di nuovo dopo il reset: nuovo punto di partenza, niente allarme
  const r4 = contractChecks([S("a", { mansioni: ["Sales Manager"] })], r2.snaps);
  if (r4.resets.length) throw new Error("dopo la nuova firma niente allarmi");
  console.log("contratto non più valido (rientro, cambio mansione): ok");
}
