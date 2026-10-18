// Unit test — note a due vie e ruolo People Partner (18/10/2026). Esegui: node tests/hr-notes-people.mjs
import assert from "node:assert/strict";
import {
  taskToPerson, personToClickup, incomingTimestamps, notesFromDescription, HOC_BLOCK_START, withHocBlock,
} from "../src/lib/hr-clickup-map.js";
import { restrictionFor, pathAllowed } from "../src/lib/restricted-roles.js";
import { normalizePersonInput } from "../src/lib/hr-people-core.js";
import { attachmentKind, publicAttachment } from "../src/lib/hr-documents-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

// ── Note dalla descrizione ───────────────────────────────────────────────────
t("note = testo sopra il blocco", () => {
  const desc = `Ha chiesto il turno serale.\r\nRichiamare a novembre.\n\n${HOC_BLOCK_START}\nID HOC Pro: p_1\n(nota)`;
  assert.equal(notesFromDescription(desc), "Ha chiesto il turno serale.\nRichiamare a novembre.");
  assert.equal(notesFromDescription(`${HOC_BLOCK_START}\nID HOC Pro: p_1`), null);
  assert.equal(notesFromDescription(""), null);
  assert.equal(notesFromDescription(null), null);
});

t("taskToPerson legge le note solo se il task porta la descrizione", () => {
  const withDesc = taskToPerson({ id: "t1", name: "Anna", custom_fields: [], description: `Nota.\n\n${HOC_BLOCK_START}\nID HOC Pro: p_1` });
  assert.equal(withDesc.fields.notes, "Nota.");
  const empty = taskToPerson({ id: "t1", name: "Anna", custom_fields: [], description: "" });
  assert.equal(empty.fields.notes, null); // descrizione svuotata su ClickUp = note svuotate
  const noDesc = taskToPerson({ id: "t1", name: "Anna", custom_fields: [] });
  assert.ok(!("notes" in noDesc.fields)); // task senza descrizione nel payload: le note non si toccano
});

t("il webhook della descrizione porta anche le note", () => {
  const ts = incomingTimestamps([{ field: "content", date: "1000" }], [], 1);
  assert.equal(ts.notes, 1000);
  assert.equal(ts.currentJob, undefined); // «Mansione attuale» ritirata il 18/10
});

// ── Note verso ClickUp ───────────────────────────────────────────────────────
const person = { id: "p_1", fields: { firstName: "Anna", notes: "Nota scritta in app." } };
const task = { id: "t1", description: `Nota scritta su ClickUp.\n\n${HOC_BLOCK_START}\nvecchio` };

t("note cambiate in app → scritte sopra il blocco", () => {
  const plan = personToClickup(person, [], { keys: ["notes"], currentDescription: task.description, currentTask: task });
  assert.ok(plan.description.startsWith("Nota scritta in app."));
  assert.ok(plan.description.includes(HOC_BLOCK_START));
  assert.ok(!plan.description.includes("vecchio"));
  assert.ok(plan.blockKeys.includes("notes")); // eco registrata: il webhook di ritorno non è un cambio
});

t("un push di altri campi NON schiaccia le note scritte su ClickUp", () => {
  const plan = personToClickup(person, [], { keys: ["gender"], currentDescription: task.description, currentTask: task });
  assert.ok(plan.description.startsWith("Nota scritta su ClickUp."));
  assert.ok(!plan.blockKeys.includes("notes"));
  const full = personToClickup(person, [], { keys: null, currentDescription: task.description, currentTask: task });
  assert.ok(full.description.startsWith("Nota scritta su ClickUp.")); // anche il push completo la rispetta
});

t("task nuovo → le note dell'app nella descrizione", () => {
  const plan = personToClickup(person, [], { keys: null, currentDescription: "", currentTask: null });
  assert.ok(plan.description.startsWith("Nota scritta in app."));
  assert.ok(plan.blockKeys.includes("notes"));
});

t("andata e ritorno: quello che si scrive è quello che si rilegge", () => {
  const plan = personToClickup(person, [], { keys: ["notes"], currentDescription: task.description, currentTask: task });
  assert.equal(notesFromDescription(plan.description), person.fields.notes);
  assert.equal(notesFromDescription(withHocBlock("  a\n\nb  ", ["ID HOC Pro: p_1"])), "a\n\nb");
});

t("le note si modificano dalla scheda (campo modificabile, max 4000)", () => {
  const r = normalizePersonInput({ notes: "x".repeat(5000) });
  assert.equal(r.values?.notes?.length ?? r.fields?.notes?.length ?? r.notes?.length, 4000);
});

// ── Ruolo People Partner ─────────────────────────────────────────────────────
t("People Partner vede solo CRM persone (e Contabilità se aperta dal titolare)", () => {
  const r = restrictionFor({ admin: false, roles: ["people"] });
  assert.equal(r.home, "/admin/hr");
  assert.ok(pathAllowed(r, "/admin/hr/p_123"));
  assert.ok(pathAllowed(r, "/admin/hr/contratti"));
  assert.ok(!r.paths.includes("/contabilita")); // senza accesso contabilità la scheda non c'è
  const withAcc = restrictionFor({ admin: false, roles: ["people"], capabilities: { "accounting.private": "all" } });
  assert.ok(withAcc.paths.includes("/contabilita"));
  assert.ok(!pathAllowed(r, "/admin/pnl-live"));
  assert.ok(!pathAllowed(r, "/leaderboard/sales-cp"));
  assert.equal(restrictionFor({ admin: true, roles: ["people"] }), null);
});

// ── Documenti ClickUp in app ─────────────────────────────────────────────────
t("tipo di documento dal titolo", () => {
  assert.equal(attachmentKind("Documento didentità (fronte) - Giorgia Pepe.pdf"), "id");
  assert.equal(attachmentKind("Contratto H.O.C. Chatter Giorgia Pepe (firmato 2026-07-19).pdf"), "contract");
  assert.equal(attachmentKind("CV - Giorgia Pepe.pdf"), "cv");
  assert.equal(attachmentKind("foto.jpg"), "other");
});

t("all'interfaccia non esce mai l'URL dell'allegato", () => {
  const a = publicAttachment({ id: "abc.pdf", title: "CV - X.pdf", extension: "pdf", size: 10, date: "1791195293968", url: "https://t1.p.clickup-attachments.com/x", url_w_query: "https://…" });
  assert.equal(a.url, undefined);
  assert.equal(a.url_w_query, undefined);
  assert.equal(a.kind, "cv");
  assert.equal(a.date, 1791195293968);
});

console.log(`note + People Partner + documenti: ${n} prove OK`);

// 18/10/2026: la riga «Prepara il contratto» non si scrive più e si toglie dalle descrizioni esistenti
{
  const { withoutContractLink, hocBlockLines } = await import("../src/lib/hr-clickup-map.js");
  const desc = "Nota.\n\n— Dati HOC Pro —\nID HOC Pro: p_1\nPrepara il contratto: https://houseofcreators.app/admin/hr/p_1/contratto\nDove vive (testo): Via Roma 1\n(nota)";
  const out = withoutContractLink(desc);
  if (!out || out.includes("Prepara il contratto") || !out.includes("Dove vive (testo): Via Roma 1") || !out.startsWith("Nota.")) throw new Error("withoutContractLink");
  if (withoutContractLink("niente da togliere") !== null) throw new Error("withoutContractLink null");
  if (hocBlockLines({ id: "p_1", fields: {} }, new Map()).some((l) => l.startsWith("Prepara il contratto"))) throw new Error("riga ancora scritta");
  console.log("riga «Prepara il contratto»: ok");
}

// 18/10/2026: campi del vecchio CRM ritirati — non si sincronizzano e non si modificano più
{
  const F = await import("../src/lib/hr-fields.js");
  const OLD = ["role", "additionalRole", "currentJob", "department", "project", "skills", "timeSlots"];
  for (const k of OLD) if (!F.FIELD_BY_KEY[k].retired || F.FIELD_BY_KEY[k].cu || F.EDITABLE_KEYS.includes(k)) throw new Error("non ritirato: " + k);
  const { hocBlockLines } = await import("../src/lib/hr-clickup-map.js");
  if (hocBlockLines({ id: "p_1", fields: { currentJob: "x" } }, new Map()).some((l) => l.startsWith("Mansione attuale"))) throw new Error("riga Mansione attuale ancora scritta");
  const plan = personToClickup({ id: "p_1", fields: { firstName: "A", role: ["HR"], timeSlots: ["7:00 - 12:00"], skills: ["AI"] } }, [{ id: "r", name: "Role", type: "labels" }, { id: "t", name: "Time Slots", type: "labels" }], { keys: null, currentDescription: "", currentTask: null });
  if (JSON.stringify(plan).includes('"r"') || JSON.stringify(plan).includes('"t"')) throw new Error("campo ritirato scritto su ClickUp");
  console.log("campi vecchi ritirati: ok");
}
