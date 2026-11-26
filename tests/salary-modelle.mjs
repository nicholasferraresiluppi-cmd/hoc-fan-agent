// Unit test — modelle salary (funzioni pure + contenuto del manuale). Esegui: node tests/salary-modelle.mjs
// Il task di prova ha la stessa forma della card vera (nome «annuncio · paese, età · marketplace»,
// tabella markdown nella descrizione), con dati inventati.
import assert from "node:assert/strict";
import { STEPS, MESSAGES } from "../src/lib/salary-manuale.js";
import { stepIndex, parseInfoTable, splitTaskName, toModel, sortModels, countByStep, commentLine } from "../src/lib/salary-modelle-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("i 7 passi sono gli stati della lista Candidate, in ordine", () => {
  assert.deepEqual(STEPS.map((s) => s.status), ["trovata", "chiamata con gaia", "offerta inviata", "contratto", "conti aperti", "lancio", "attiva"]);
  assert.deepEqual(STEPS.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7]);
});

t("stepIndex: maiuscole e spazi non contano; scartata = -1; stato sconosciuto = null", () => {
  assert.equal(stepIndex("Offerta inviata "), 2);
  assert.equal(stepIndex("scartata"), -1);
  assert.equal(stepIndex("to do"), null);
  assert.equal(stepIndex(undefined), null);
});

t("parseInfoTable legge le righe e salta intestazione vuota e separatore", () => {
  const md = "Testo\n\n|  |  |\n| ---| --- |\n| Età | 19 |\n| **Paese** | Paese finto |\n| Tempo al giorno | 4 ore |\nnon tabella";
  assert.deepEqual(parseInfoTable(md), { "Età": "19", "Paese": "Paese finto", "Tempo al giorno": "4 ore" });
  assert.deepEqual(parseInfoTable(""), {});
  assert.deepEqual(parseInfoTable(null), {});
});

t("splitTaskName: tre parti, due parti, una sola", () => {
  assert.deepEqual(splitTaskName("Annuncio 12 · Paese, 19 · Mercato"), { label: "Annuncio 12", place: "Paese, 19", source: "Mercato" });
  assert.deepEqual(splitTaskName("Annuncio · Paese"), { label: "Annuncio", place: "Paese", source: null });
  assert.equal(splitTaskName("").label, "Senza nome");
});

t("toModel: stato come oggetto ClickUp, info filtrate e ordinate, nota accorciata", () => {
  const m = toModel(
    { id: 7, name: "Annuncio 12 · Paese, 19 · Mercato", status: { status: "offerta inviata" }, date_updated: "1700000000000",
      markdown_description: "| Salary per lei | 35% |\n| Paese | X |\n| Età | 19 |", assignees: [{ username: "Nicholas" }] },
    { text: "a".repeat(400), date: "1700000000001", by: "Nicholas" },
  );
  assert.equal(m.step, 2);
  assert.equal(m.url, "https://app.clickup.com/t/7");
  assert.deepEqual(m.info, [["Età", "19"], ["Paese", "X"]]); // la salary dell'annuncio NON esce
  assert.equal(m.last.text.length, 220);
  assert.ok(m.last.text.endsWith("…"));
  assert.deepEqual(m.assignees, ["Nicholas"]);
});

t("toModel regge un task vuoto", () => {
  const m = toModel({});
  assert.equal(m.step, null);
  assert.equal(m.last, null);
  assert.deepEqual(m.info, []);
});

t("sortModels: più avanti prima, scartate e fuori percorso in fondo", () => {
  const ms = [
    { id: "a", step: 0, updatedAt: 5 }, { id: "b", step: -1, updatedAt: 9 }, { id: "c", step: 2, updatedAt: 1 },
    { id: "d", step: null, updatedAt: 9 }, { id: "e", step: 0, updatedAt: 8 },
  ];
  assert.deepEqual(sortModels(ms).map((m) => m.id), ["c", "e", "a", "b", "d"]);
});

t("countByStep", () => {
  const c = countByStep([{ step: 0 }, { step: 0 }, { step: 2 }, { step: -1 }, { step: null }]);
  assert.deepEqual(c.steps, [2, 0, 1, 0, 0, 0, 0]);
  assert.equal(c.discarded, 1);
  assert.equal(c.other, 1);
  assert.equal(c.active, 3);
});

t("commentLine compatta gli spazi", () => {
  assert.equal(commentLine("  uno\n\n due  "), "uno due");
  assert.equal(commentLine(""), "");
});

t("ogni messaggio citato dal manuale esiste, ha la traduzione e il passo giusto", () => {
  const ids = new Set(MESSAGES.map((m) => m.id));
  for (const s of STEPS) for (const id of s.messages) {
    assert.ok(ids.has(id), `${s.key} cita ${id}`);
    assert.equal(MESSAGES.find((m) => m.id === id).step, s.key);
  }
  for (const m of MESSAGES) assert.ok(m.it && m.it.length > 20, `${m.id} senza traduzione`);
});

t("regole del deal nei testi: niente percentuali alla modella, mai «tus perfiles», marketplace non nominato", () => {
  for (const m of MESSAGES) {
    const txt = m.parts ? m.parts.map((p) => p.text).join(" ") : m.text;
    assert.ok(!/\d\s?%/.test(txt), `${m.id}: percentuale`);
    assert.ok(!/tus perfiles|your profiles/i.test(txt), `${m.id}: profili «suoi»`);
    assert.ok(!/nexus|mvp|bn elite|shaft|marketplace/i.test(txt), `${m.id}: marketplace nominato`);
  }
});

t("i passi hanno tutti cosa fare adesso", () => {
  for (const s of STEPS) assert.ok(s.now && s.does.length && s.who.length, s.key);
});

console.log(`salary-modelle: ${n} test ok`);
