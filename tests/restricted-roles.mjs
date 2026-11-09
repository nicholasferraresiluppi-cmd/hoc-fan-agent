// Unit test — ruoli ristretti (lib/restricted-roles). Esegui: node tests/restricted-roles.mjs
import assert from "node:assert/strict";
import { restrictionFor, restrictedMenu, pathAllowed } from "../src/lib/restricted-roles.js";

const people = restrictionFor({ roles: ["people"], capabilities: {} });
assert.deepEqual(restrictedMenu(people).map((i) => i.href), ["/admin/hr", "/admin/hr/contratti", "/admin/referral", "/admin/publisher-x"], "People Partner: niente Contabilità senza accesso");
assert.ok(restrictedMenu(restrictionFor({ roles: ["people"], capabilities: { "accounting.private": true } })).some((i) => i.href === "/contabilita"), "Contabilità quando il titolare l'ha aperta");
assert.ok(restrictedMenu(people).every((i) => i.label && !i.label.startsWith("/")), "ogni voce ha un nome, mai l'indirizzo");
assert.ok(!restrictedMenu(restrictionFor({ roles: ["social"] })).some((i) => i.href === "/admin/editoriale"), "il rimando dell'Editoriale non è una voce");
assert.ok(pathAllowed(people, "/admin/hr/abc123"), "scheda persona permessa");
assert.ok(!pathAllowed(people, "/admin/bilancio"), "altre pagine no");
assert.equal(restrictionFor({ admin: true, roles: ["people"] }), null, "admin mai ristretto");
assert.equal(restrictionFor({ roles: ["people", "sales_manager"] }), null, "con un secondo ruolo non è ristretto");
assert.deepEqual(restrictedMenu(null), []);
console.log("restricted-roles: 9 asserzioni ok");
