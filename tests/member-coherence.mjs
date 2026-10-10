import assert from "node:assert/strict";
import { memberIssues, opensSalesData } from "../src/lib/member-coherence.js";

const codes = (r) => memberIssues(r).map((x) => x.code);
// Il caso reale (Antonio, ott 2026): 3 creator, nessun ruolo effettivo → operator (scores.view own)
assert.deepEqual(codes({ creators: { creators: ["A", "B", "C"] }, caps: { "scores.view": "own" }, workspace: "sales" }), ["creators-without-role", "view-mostly-empty"]);
// Sales Manager con le sue creator: tutto torna
assert.deepEqual(codes({ creators: { creators: ["A"] }, caps: { "scores.view": "all", "cm.cockpit": "all" }, workspace: "sales" }), []);
// Team lead (scope team) con tutte le creator: ok
assert.deepEqual(codes({ creators: { all: true }, caps: { "scores.view": "team" } }), []);
// Ruolo vendite senza creator
assert.deepEqual(codes({ creators: { all: false, creators: [] }, caps: { "scores.view": "all" } }), ["role-without-creators"]);
// Admin e sospesi: mai avvisi
assert.deepEqual(codes({ admin: { sources: ["env"] }, creators: null, caps: {} }), []);
assert.deepEqual(codes({ banned: true, creators: { creators: ["A"] }, caps: {} }), []);
// Operator puro senza creator: niente da dire
assert.deepEqual(codes({ creators: null, caps: { "scores.view": "own" } }), []);
assert.equal(opensSalesData(undefined), false);
assert.deepEqual(memberIssues(null), []);
// Vista Sales Manager scelta da un operatore senza creator: solo il menu incoerente
assert.deepEqual(codes({ creators: null, caps: { "scores.view": "own" }, workspace: "sales" }), ["view-mostly-empty"]);
// Sales Manager con poche creator: alcune voci "tutta l'agenzia" spariscono, ma la vista resta utile → niente avviso
const sm = memberIssues({ creators: { creators: ["A"] }, caps: { "scores.view": "all", "analytics.view": "all", review: "all", "cm.cockpit": "all" }, roles: ["sales_manager"] });
assert.deepEqual(sm, []);
console.log("member-coherence: 11 ok", sm.map((x) => x.text));
