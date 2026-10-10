import assert from "node:assert/strict";
import { memberIssues, opensSalesData } from "../src/lib/member-coherence.js";

const codes = (r) => memberIssues(r).map((x) => x.code);
// Il caso reale (Antonio, ott 2026): 3 creator, nessun ruolo effettivo → operator (scores.view own)
assert.deepEqual(codes({ creators: { creators: ["A", "B", "C"] }, caps: { "scores.view": "own" }, workspace: "sales" }), ["creators-without-role", "view-without-role"]);
// Sales Manager con le sue creator: tutto torna
assert.deepEqual(codes({ creators: { creators: ["A"] }, caps: { "scores.view": "all" }, workspace: "sales" }), []);
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
console.log("member-coherence: 9 ok");
