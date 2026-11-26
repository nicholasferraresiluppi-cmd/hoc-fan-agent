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
    // invio email finto: globalThis.__mail = { ready, fail, sent: [] }
    if (specifier === "@/lib/welcome-store") return mod(`export const mailStatus = () => ({ ready: !!globalThis.__mail?.ready });
      export const sendMail = async (m) => { if (globalThis.__mail.fail) throw new Error("resend giù"); globalThis.__mail.sent.push(m); return "id"; };`);
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

// Email italiana nostra (26/11/2026): con mittente verificato l'invito su Clerk è muto e
// l'email la mandiamo noi, col link dentro
globalThis.__mail = { ready: true, fail: false, sent: [] };
const f = await referenteInvitation({ ...base, email: "sofia@gmail.com" });
const fi = invs.find((i) => i.emailAddress === "sofia@gmail.com");
assert.equal(fi.notify, false, "Clerk non manda la sua email inglese");
assert.equal(globalThis.__mail.sent.length, 1);
const m = globalThis.__mail.sent[0];
assert.equal(m.to, "sofia@gmail.com"); assert.equal(m.subject, "Il tuo invito a HOC Pro");
assert.ok(m.html.includes(f.url) && m.text.includes(f.url), "il link d'invito è nell'email");
assert.ok(m.text.includes("Claudia ti ha invitato"), "dice chi invita"); n += 6;

// «Manda di nuovo» con mittente verificato: anche il rinnovo parte in italiano
await referenteInvitation({ ...base, email: "sofia@gmail.com" });
assert.equal(globalThis.__mail.sent.length, 2); assert.equal(invs.filter((i) => i.emailAddress === "sofia@gmail.com" && i.status === "pending").length, 1); n += 2;

// la nostra email non parte → l'invito muto si annulla e riparte quello standard di Clerk
globalThis.__mail = { ready: true, fail: true, sent: [] };
await referenteInvitation({ ...base, email: "giada@gmail.com" });
const gi = invs.filter((i) => i.emailAddress === "giada@gmail.com");
assert.equal(gi.length, 2); assert.equal(gi[0].notify, false); assert.equal(gi[0].status, "revoked");
assert.equal(gi[1].notify, true); assert.equal(gi[1].status, "pending"); n += 5;

// «Copia il link» resta senza nessuna email, neanche la nostra
globalThis.__mail = { ready: true, fail: false, sent: [] };
await referenteInvitation({ ...base, email: "nora@gmail.com", linkOnly: true });
assert.equal(globalThis.__mail.sent.length, 0); assert.equal(invs.at(-1).notify, false); n += 2;

console.log(`ok — ${n} asserzioni`);
