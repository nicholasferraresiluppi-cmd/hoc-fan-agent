// node tests/referral-invite.mjs — invito «Referente»: rimanda, link, inviti di altri (Clerk finto)
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const mod = (code) => ({ url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true });
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@clerk/nextjs/server") return mod("export const clerkClient = async () => globalThis.__cc;");
    if (specifier === "@/lib/admin") return mod("export const isUserIdAdmin = async () => false;");
    if (specifier === "@/lib/rbac") return mod(`export const ROLES = ["operator","referente","admin"]; export const ROLE_META = {};
      export const CAPABILITIES = { ACCESS_MGMT: "a", USERS_INVITE: "u", SEED: "s" };
      export const ROLE_CAPABILITIES = { operator: { "x": "own" }, referente: { "referral.self": "own" }, admin: { a: "all" } };
      export const listCustomRoles = async () => []; export const getEffectiveCapabilities = async () => ({ "referral.self": "own", "referral.manage": "all" });`);
    if (specifier.startsWith("@/")) return next(pathToFileURL(path.join(SRC, specifier.slice(2)) + ".js").href, context);
    return next(specifier, context);
  },
});

let n = 0;
const users = new Set();
let invs = [];
let seq = 0;
globalThis.__cc = {
  users: { getUserList: async ({ emailAddress }) => ({ data: [...users].filter((u) => emailAddress.includes(u)) }) },
  invitations: {
    getInvitationList: async ({ status, query }) => ({ data: invs.filter((i) => i.status === status && (!query || i.emailAddress.includes(query))) }),
    createInvitation: async (o) => {
      if (!o.ignoreExisting && invs.some((i) => i.status === "pending" && i.emailAddress === o.emailAddress)) throw new Error("duplicate_record"); // come Clerk
      const inv = { id: `inv_${++seq}`, emailAddress: o.emailAddress, status: "pending", publicMetadata: o.publicMetadata, url: `https://x/accept?t=${seq}`, notify: o.notify };
      invs.push(inv); return inv;
    },
    revokeInvitation: async (id) => { const i = invs.find((x) => x.id === id); i.status = "revoked"; return i; },
  },
};
const { referenteInvitation } = await import("../src/lib/invitations.js");
const base = { inviterId: "u_claudia", inviterName: "Claudia", origin: "https://houseofcreators.app" };

// primo invito: mail partita, ruolo referente
const a = await referenteInvitation({ ...base, email: "Angela@Gmail.com" });
assert.equal(invs[0].notify, true); assert.deepEqual(invs[0].publicMetadata.roles, ["referente"]); assert.ok(a.url); n += 3;

// «Manda di nuovo» da non-admin: prima era Bad Request, ora nuovo invito identico e il vecchio annullato
const b = await referenteInvitation({ ...base, email: "angela@gmail.com" });
assert.equal(b.renewed, true); assert.equal(invs[0].status, "revoked"); assert.equal(invs[1].status, "pending");
assert.deepEqual(invs[1].publicMetadata, invs[0].publicMetadata, "stessi ruoli: nessun potere in più"); n += 4;

// «Copia il link» con invito in attesa: stesso link, nessuna mail, nessun invito nuovo
const c = await referenteInvitation({ ...base, email: "angela@gmail.com", linkOnly: true });
assert.equal(c.url, invs[1].url); assert.equal(c.reused, true); assert.equal(invs.length, 2); n += 3;

// «Copia il link» senza invito: invito creato SENZA mail
const d = await referenteInvitation({ ...base, email: "rebecca@gmail.com", linkOnly: true });
assert.equal(invs.at(-1).notify, false); assert.ok(d.url); n += 2;

// invito in attesa fatto da Membri con altri ruoli: non si tocca, si dà il suo link
invs.push({ id: "inv_op", emailAddress: "mattia@gmail.com", status: "pending", publicMetadata: { role: "operator", roles: ["operator"] }, url: "https://x/op" });
const e = await referenteInvitation({ ...base, email: "mattia@gmail.com" });
assert.equal(e.otherRoles, true); assert.equal(e.url, "https://x/op"); assert.equal(invs.find((i) => i.id === "inv_op").status, "pending"); n += 3;

// ha già un account: nessun invito
users.add("helena@gmail.com");
await assert.rejects(referenteInvitation({ ...base, email: "helena@gmail.com" }), (err) => err.code === "exists"); n++;
await assert.rejects(referenteInvitation({ ...base, email: "non-una-mail" }), /Email non valida/); n++;

console.log(`ok — ${n} asserzioni`);
