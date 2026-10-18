// Unit test — riallineamento viste CRM (18/10/2026). Esegui: node tests/hr-views.mjs
import assert from "node:assert/strict";
import { pickFields, planView, progettoForView, missingCreatorViews, desiredOrder, filtersMention } from "../src/lib/hr-views-core.js";

const meta = [
  { id: "r1", name: "Role", type: "labels" },
  { id: "m1", name: "Mansione", type: "labels" },
  { id: "p0", name: "Project", type: "labels", type_config: { options: [{ id: "o-el", label: "Model - Elisa" }] } },
  { id: "p1", name: "Progetto", type: "labels", type_config: { options: [
    { id: "g-ev", label: "Elisa Vimercati" }, { id: "g-fi", label: "Fishball ITA" }, { id: "g-fe", label: "Fishball ENG" },
    { id: "g-st", label: "Stormy" }, { id: "g-ms", label: "Martina Scavo" }, { id: "g-in", label: "Interno" },
  ] } },
  { id: "iv", name: "Partita IVA", type: "drop_down" },
];
const F = pickFields(meta);
let n = 0; const t = (name, fn) => { fn(); n++; };

const creatorView = (name) => ({
  id: "v1", name, type: "table", orderindex: 3, date_created: "1",
  grouping: { field: "cf_r1", dir: 1 },
  filters: { op: "AND", fields: [{ field: "cf_p0", op: "ANY", values: ["o-el"] }, { field: "cf_status", op: "NOT", values: ["Uscita"] }] },
  columns: { fields: [{ field: "cf_r1", hidden: false }, { field: "cf_p0", hidden: false }] },
});

t("vista creator: filtro su Progetto col nome della vista, raggruppa per Mansione", () => {
  const p = planView(creatorView("CRM Elisa Vimercati"), F);
  assert.equal(p.patch.grouping.field, "cf_m1");
  const f = p.patch.filters.fields[0];
  assert.equal(f.field, "cf_p1");
  assert.deepEqual(f.values, ["g-ev"]);
  assert.equal(p.patch.filters.fields[1].field, "cf_status"); // l'altro filtro resta
  assert.ok(p.patch.columns.fields.some((c) => c.field === "cf_m1" && !c.hidden));
  assert.ok(p.patch.columns.fields.some((c) => c.field === "cf_p1" && !c.hidden));
  assert.equal(p.patch.id, undefined); assert.equal(p.patch.orderindex, undefined); // non si rimandano
});

t("Fishball → ITA + ENG", () => {
  assert.deepEqual(progettoForView("CRM Fishball", F.progetto).optionIds, ["g-fi", "g-fe"]);
});

t("creator non più tra i Progetti: filtro lasciato com'è, con avviso", () => {
  const p = planView(creatorView("CRM Federica Pacela"), F);
  assert.ok(!filtersMention(p.patch.filters, "cf_p1"));
  assert.ok(p.warnings[0].includes("Federica Pacela"));
  assert.equal(p.patch.grouping.field, "cf_m1"); // il raggruppamento si sistema comunque
});

t("viste principali: colonna Partita IVA", () => {
  const p = planView({ name: "Anagrafica Collaboratori", grouping: { field: "cf_r1" }, columns: { fields: [] } }, F);
  assert.ok(p.changes.includes("colonna Partita IVA"));
  assert.ok(p.patch.columns.fields.some((c) => c.field === "cf_iv"));
  const q = planView({ name: "CRM Stormy", columns: { fields: [] } }, F);
  assert.ok(!q.changes.includes("colonna Partita IVA"));
});

t("vista già a posto → niente da scrivere", () => {
  const p = planView({ name: "Persone", grouping: { field: "status" }, columns: { fields: [{ field: "cf_iv", hidden: false }] } }, F);
  assert.equal(p.patch, null);
});

t("filtri annidati", () => {
  const v = { name: "CRM Stormy", filters: { op: "AND", fields: [{ op: "OR", fields: [{ field: "cf_p0", values: ["x"] }] }] } };
  const p = planView(v, F);
  assert.equal(p.patch.filters.fields[0].fields[0].field, "cf_p1");
  assert.deepEqual(p.patch.filters.fields[0].fields[0].values, ["g-st"]);
});

t("viste da creare: creator del Progetto senza vista (Interno escluso, Fishball una sola)", () => {
  const miss = missingCreatorViews([{ name: "CRM Elisa Vimercati" }, { name: "CRM Stormy" }], F).map((x) => x.name);
  assert.deepEqual(miss, ["CRM Fishball", "CRM Martina Scavo"]);
  assert.deepEqual(missingCreatorViews([{ name: "CRM Fishball" }], F).map((x) => x.name), ["CRM Elisa Vimercati", "CRM Stormy", "CRM Martina Scavo"]);
});

t("ordine: principali, creator A-Z, moduli in fondo", () => {
  const o = desiredOrder(["Form CRM", "CRM Stormy", "Elenco", "Persone", "HV Contract Tracking Modelle", "CRM Alice Cappella", "Collaboratori senza contratto"]);
  assert.deepEqual(o, ["Persone", "Collaboratori senza contratto", "Elenco", "CRM Alice Cappella", "CRM Stormy", "Form CRM", "HV Contract Tracking Modelle"]);
});

console.log(`viste CRM: ${n} prove OK`);
