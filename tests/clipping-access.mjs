// Unit test — ruoli e permessi della dashboard Clipping. Esegui: node tests/clipping-access.mjs
import assert from "node:assert/strict";
const M = await import("../src/lib/clipping-access-core.js");

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗ " + name); throw e; } };

const doc = {
  active: true,
  roles: [
    { id: "r1", name: "Editor Juli", grants: { julii: ["oggi", "acct"], about: ["oggi"] }, users: ["u1"] },
    { id: "r2", name: "Dati", grants: { about: ["dati"], fish: ["radar"] }, users: ["u1", "u2"] },
  ],
};

t("admin e ruoli spenti: vede tutto", () => {
  assert.deepEqual(M.accessFor("u1", { admin: true, doc }), { all: true });
  assert.deepEqual(M.accessFor("u9", { admin: false, doc: { ...doc, active: false } }), { all: true });
  assert.deepEqual(M.accessFor("u9", { admin: false, doc: null }), { all: true }); // chiave mai creata = come prima
});

t("senza ruoli (attivi): nessun account, nessuna finestra", () => {
  const a = M.accessFor("u9", { doc });
  assert.deepEqual(a, { all: false, accounts: {} });
  for (const w of M.WINDOW_KEYS) assert.equal(M.canWindow(a, w), false);
  assert.equal(M.canAccount(a, "julii"), false);
  assert.deepEqual(M.filterAccounts(a, [{ id: "julii" }]), []);
});

t("più ruoli: i permessi si sommano", () => {
  const a = M.accessFor("u1", { doc });
  assert.deepEqual(a.accounts.about, ["oggi", "dati"]);
  assert.deepEqual(a.accounts.julii, ["oggi", "acct"]);
  assert.deepEqual(a.accounts.fish, ["radar"]);
  assert.equal(M.canAccount(a, "about", "acct"), false);
  assert.equal(M.canAccount(a, "about", "dati"), true);
  assert.equal(M.canAccount(a, "fish"), true);
  assert.equal(M.canWork(a, "fish"), false); // solo Radar: niente spunte né dati su quell'account
  assert.equal(M.canWork(a, "about"), true);
  assert.equal(M.canWindow(a, "radar"), true);
  assert.equal(M.canWindow(a, "contenuti"), false);
  assert.deepEqual(M.filterAccounts(a, [{ id: "julii" }, { id: "about" }, { id: "x" }], "oggi").map((x) => x.id), ["julii", "about"]);
});

t("u2 vede solo i suoi", () => {
  const a = M.accessFor("u2", { doc });
  assert.deepEqual(Object.keys(a.accounts).sort(), ["about", "fish"]);
  assert.equal(M.canWindow(a, "oggi"), false);
});

t("cleanRole: nome obbligatorio, finestre e account ripuliti", () => {
  assert.equal(M.cleanRole({ name: " " }).ok, false);
  const r = M.cleanRole({ id: "r1", name: "  Clipper team A ", grants: { a: ["dati", "oggi", "boh", "oggi"], b: [], z: ["oggi"] }, users: ["u1", "u1", ""] }, { accountIds: ["a", "b"], now: 5, by: "Nick" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.role, { id: "r1", name: "Clipper team A", grants: { a: ["oggi", "dati"] }, users: ["u1"], updatedAt: 5, by: "Nick" });
  assert.match(M.cleanRole({ name: "Nuovo" }).role.id, /^r/);
});

console.log(`clipping-access: ${n} gruppi di asserzioni ok`);
