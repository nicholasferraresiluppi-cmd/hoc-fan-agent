// Unit test — supervisor-core (account social, telefoni, caselle). Esegui: node tests/supervisor.mjs
import assert from "node:assert/strict";
import {
  normalizeRecord, validateRecord, buildView, overviewStats, findIssues, mapHeaders, rowsToInputs,
  enumValue, normPhone, normLang, cleanLink, linkGroups, deviceMissing, naturalKey,
} from "../src/lib/supervisor-core.js";
import { restrictionFor, pathAllowed } from "../src/lib/restricted-roles.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("enum da etichette dello strumento di prima", () => {
  assert.equal(enumValue("platformStatus", "Not Recommended"), "not_recommended");
  assert.equal(enumValue("platformStatus", "Suspended"), "suspended");
  assert.equal(enumValue("platformStatus", "OK"), "ok");
  assert.equal(enumValue("platform", "IG"), "instagram");
  assert.equal(enumValue("platform", "TT"), "tiktok");
  assert.equal(enumValue("platform", "Snapchat"), "other");
  assert.equal(enumValue("ownerType", "Agency"), "agency");
  assert.equal(enumValue("deviceUsage", "Remote"), "remote");
  assert.equal(enumValue("contentType", "AI"), "ai");
  assert.equal(enumValue("creationStatus", "warming"), "warming");
  assert.equal(enumValue("schedulingStatus", ""), null);
});

t("numeri e lingue", () => {
  assert.equal(normPhone("+39 3473105569"), "+393473105569");
  assert.equal(normPhone("3520600570"), "+393520600570");
  assert.equal(normPhone("0039 347 1234567"), "+393471234567");
  assert.equal(normPhone("+393274433890 numero libero mail"), "+393274433890");
  assert.equal(normPhone(""), null);
  assert.equal(normLang("🇮🇹"), "IT");
  assert.equal(normLang("en"), "EN");
  assert.equal(normLang("Italiano"), "IT");
});

t("normalizzazione account + url dal nome", () => {
  const a = normalizeRecord("account", { username: "@MikyVibess", platform: "Instagram", email: " X@Libero.it ", retired: "false" });
  assert.equal(a.username, "mikyvibess");
  assert.equal(a.url, "https://www.instagram.com/mikyvibess/");
  assert.equal(a.email, "x@libero.it");
  assert.equal(a.retired, false);
  assert.equal(a.platformStatus, "ok");
  assert.equal(a.creationStatus, "done");
});

t("modifica: i campi assenti restano", () => {
  const prev = normalizeRecord("account", { username: "a", platform: "tiktok", creator: "Michela", alterego: "Segretaria" });
  const next = normalizeRecord("account", { platformStatus: "suspended" }, prev);
  assert.equal(next.creator, "Michela");
  assert.equal(next.alterego, "Segretaria");
  assert.equal(next.platform, "tiktok");
  assert.equal(next.platformStatus, "suspended");
});

t("validazione: doppioni e campi chiave", () => {
  const all = [{ id: "1", ...normalizeRecord("account", { username: "x", platform: "instagram" }) }];
  assert.deepEqual(validateRecord("account", normalizeRecord("account", { username: "x", platform: "tiktok" }), all), []);
  assert.equal(validateRecord("account", normalizeRecord("account", { username: "X", platform: "instagram" }), all).length, 1);
  assert.deepEqual(validateRecord("account", all[0], all, "1"), []); // se stesso non è doppione
  assert.equal(validateRecord("account", normalizeRecord("account", {}), []).length, 1);
  assert.equal(validateRecord("mailbox", normalizeRecord("mailbox", { email: "senza-chiocciola" }), []).length, 1);
  assert.equal(validateRecord("device", normalizeRecord("device", { name: "" }), []).length, 1);
});

const dev = (id, o = {}) => ({ id, ...normalizeRecord("device", { name: id, ...o }), secrets: o.secrets || {} });
const acc = (id, o = {}) => ({ id, ...normalizeRecord("account", { username: id, platform: "instagram", ...o }), secrets: o.secrets || {} });
const mail = (id, o = {}) => ({ id, ...normalizeRecord("mailbox", { email: `${id}@libero.it`, ...o }), secrets: {} });

const data = {
  devices: [
    dev("iph-pub3", { publishers: "Claudia Perris", imei: "1", model: "iPhone 12", icloudEmail: "a@b.c", phone: "3471234567", secrets: { icloudPassword: true } }),
    dev("iph-pub66", { publishers: "Grazia Fragasso" }),
    dev("iph-pub9", {}),
  ],
  accounts: [
    acc("mikyvibess", { deviceId: "iph-pub66", creator: "Michela", alterego: "AI", email: "m1@libero.it", secrets: { password: true } }),
    acc("sotto", { platform: "tiktok", deviceId: "iph-pub66", creator: "Michela", email: "m1@libero.it", secrets: { password: true } }),
    acc("sotto2", { platform: "tiktok", creator: "Michela", email: "m1@libero.it", platformStatus: "suspended", schedulingStatus: "active" }),
    acc("nodev", { creator: "Michela", secrets: { password: true } }),
    acc("creatorowned", { ownerType: "creator", creator: "Michela", secrets: { password: true } }),
    acc("old", { retired: true, deviceId: "iph-pub9" }),
    acc("warm", { creationStatus: "warming", creator: "Eva" }),
    acc("orphan", { email: "ghost@libero.it", secrets: { password: true } }),
  ],
  mailboxes: [mail("m1", { phone: "3331112222" }), mail("m2", { phone: "+39 333 111 2222" }), mail("m3")],
};
const view = buildView(data);

t("relazioni calcolate", () => {
  const miky = view.accounts.find((a) => a.id === "mikyvibess");
  assert.deepEqual(miky.publishers, ["Grazia Fragasso"]);
  assert.equal(miky.mailboxId, "m1");
  const d66 = view.devices.find((d) => d.id === "iph-pub66");
  assert.equal(d66.accountCount, 2);
  assert.deepEqual(d66.countByPlatform, { instagram: 1, tiktok: 1 });
  // gli account ritirati non contano sul telefono
  assert.equal(view.devices.find((d) => d.id === "iph-pub9").accountCount, 0);
  assert.equal(view.mailboxes.find((m) => m.id === "m1").accounts.length, 3);
});

t("credenziali mancanti del telefono", () => {
  assert.deepEqual(deviceMissing(view.devices[0]), []);
  assert.deepEqual(deviceMissing(view.devices[1]), ["IMEI", "modello", "email iCloud", "numero", "password iCloud"]);
});

t("panoramica", () => {
  const s = overviewStats(view);
  assert.equal(s.liveTotal, 6); // esclusi ritirato e in riscaldamento
  assert.equal(s.activeTotal, 5);
  assert.equal(s.creation.warming, 1);
  assert.equal(s.grid["instagram|agency|ok"], 3);
  assert.equal(s.grid["tiktok|agency|suspended"], 1);
  assert.equal(s.grid["instagram|creator|ok"], 1);
  assert.equal(s.devices.assigned, 2);
  assert.equal(s.devices.unassigned, 1);
  assert.equal(s.devices.missingCredentials, 2);
});

t("cose da sistemare", () => {
  const issues = Object.fromEntries(findIssues(view).map((i) => [i.code, i]));
  assert.deepEqual(issues["no-device"].ids, ["nodev", "orphan"]); // creatorowned è della creator: non serve telefono
  assert.deepEqual(issues["suspended-scheduled"].ids, ["sotto2"]);
  assert.deepEqual(issues["shared-email"].ids.sort(), ["sotto", "sotto2"]); // stessa email, stessa piattaforma
  assert.deepEqual(issues["no-mailbox"].ids, ["orphan"]);
  assert.deepEqual(issues["mail-shared-phone"].ids, ["m1", "m2"]); // numeri scritti diversi, stesso numero
  assert.deepEqual(issues["mail-unused"].ids, ["m2", "m3"]);
  assert.equal(issues["dup"], undefined);
  assert.deepEqual(issues["no-creator"].ids, ["orphan"]);
});

t("doppioni rilevati in vista", () => {
  const v = buildView({ accounts: [acc("a1", { username: "same" }), acc("a2", { username: "same" })], devices: [], mailboxes: [] });
  assert.equal(findIssues(v).find((i) => i.code === "dup").count, 2);
});

t("link in bio raggruppati", () => {
  assert.equal(cleanLink("https://www.heyliiink.com/miky?utm=1"), "heyliiink.com/miky");
  assert.equal(cleanLink("go.michela.com/"), "go.michela.com");
  const v = buildView({ accounts: [acc("a", { linkInBio: "https://x.com/l/" }), acc("b", { linkInBio: "x.com/l" }), acc("c")], devices: [], mailboxes: [] });
  const g = linkGroups(v);
  assert.equal(g[0].link, "x.com/l");
  assert.equal(g[0].accounts.length, 2);
  assert.equal(g[1].link, null);
});

t("import: intestazioni dello strumento di prima", () => {
  const headers = ["Name", "Account URL", "Platform", "Alteregos", "Platform Status", "Owner Type", "Assigned Device", "IG Linked Account", "Account Password (Plaintext)", "Email Password (Plaintext)", "SM Active Account (Next version)"];
  const { mapping, ignored } = mapHeaders("account", headers);
  assert.equal(mapping["Name"], "username");
  assert.equal(mapping["Account Password (Plaintext)"], "secret:password");
  assert.equal(mapping["Assigned Device"], "deviceId");
  assert.deepEqual(ignored, ["SM Active Account (Next version)"]);
  const [r] = rowsToInputs("account", [{ Name: "mikyvibess", "Account URL": "https://instagram.com/mikyvibess", Platform: "", Alteregos: "AI", "Platform Status": "OK", "Owner Type": "Agency", "Assigned Device": "🧑‍🎤✍️iph-pub66 (Manual)", "IG Linked Account": "🇮🇹😊 sottolascrivania(TT)", "Account Password (Plaintext)": "segreto", "Email Password (Plaintext)": "–" }], mapping);
  assert.equal(r.fields.platform, "instagram"); // dedotta dall'URL
  assert.equal(r.refs.device, "iph-pub66");
  assert.deepEqual(r.refs.linked, { username: "sottolascrivania", platform: "tiktok" });
  assert.deepEqual(r.secrets, { password: "segreto" }); // il trattino vuoto non diventa una password
});

t("import mail: più colonne placement in una lista", () => {
  const { mapping } = mapHeaders("mailbox", ["email", "numero", "Password", "IG Account", "Placement 1", "Placement 2"]);
  const [r] = rowsToInputs("mailbox", [{ email: "a@libero.it", numero: "+393", Password: "p", "IG Account": "x", "Placement 1": "Ig: lapiccola", "Placement 2": "Facebook" }], mapping);
  assert.deepEqual(r.fields.placements, ["Ig: lapiccola", "Facebook"]);
  assert.equal(r.secrets.password, "p");
  assert.equal(naturalKey("mailbox", normalizeRecord("mailbox", r.fields)), "a@libero.it");
});

t("import telefoni: nome ripulito", () => {
  const { mapping } = mapHeaders("device", ["Name & Info", "Assigned Publisher", "iCloud Password", "PIN"]);
  const [r] = rowsToInputs("device", [{ "Name & Info": "🧑‍🎤✍️iph-pub3 (Manual)", "Assigned Publisher": "Claudia Perris, Luisa Perrino", "iCloud Password": "x", PIN: "" }], mapping);
  assert.equal(r.fields.name, "iph-pub3");
  assert.deepEqual(r.fields.publishers, ["Claudia Perris", "Luisa Perrino"]);
  assert.deepEqual(r.secrets, { icloudPassword: "x" });
});

t("ruolo ristretto social", () => {
  const r = restrictionFor({ admin: false, roles: ["social"] });
  assert.equal(r.home, "/admin/supervisor");
  assert.equal(pathAllowed(r, "/admin/supervisor"), true);
  assert.equal(pathAllowed(r, "/admin/supervisor/"), true);
  assert.equal(pathAllowed(r, "/admin"), false);
  assert.equal(pathAllowed(r, "/"), false);
  assert.equal(pathAllowed(r, "/admin/supervisorx"), false);
  assert.equal(restrictionFor({ admin: true, roles: ["social"] }), null); // un admin non è mai ristretto
  assert.equal(restrictionFor({ admin: false, roles: ["social", "sales_manager"] }), null); // con un altro ruolo vede il suo menu
  assert.equal(restrictionFor({ admin: false, roles: ["operator"] }), null);
  assert.equal(restrictionFor({ admin: false, roles: [] }), null);
  assert.equal(pathAllowed(null, "/qualsiasi"), true);
});

console.log(`supervisor: ${n} gruppi di asserzioni ok`);
