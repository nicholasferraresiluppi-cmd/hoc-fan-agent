// Unit test — quadro-export (file scaricabile dei Conti dell'impresa). Esegui: node tests/quadro-export.mjs
import assert from "node:assert/strict";
import { computeQuadro, sanitizeExpense } from "../src/lib/spese-core.js";
import { sanitizeConfig } from "../src/lib/split-core.js";
import { monthLabel } from "../src/lib/compensi-core.js";
import { projectRows, projectTotals, buildQuadroExport, exportFileName, GENERAL_ROW, TOTAL_ROW } from "../src/lib/quadro-export.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };
let k = 0; const id = () => `x_${(k++).toString().padStart(4, "0")}`;
const close = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

// Stesso piccolo split di tests/spese.mjs + un team senza creator e un extra d'agenzia.
const config = sanitizeConfig({
  teams: [
    { id: "team_aaaa", name: "Team A", creator: "A", dealText: "50% flat" },
    { id: "team_bbbb", name: "Team B", creator: "B", dealText: "40% flat" },
    { id: "team_cccc", name: "Academy" },
  ],
  people: [
    { id: "p_sm01", person: "Sara", role: "Sales Manager", teamIds: ["team_aaaa"], pctText: "2%", min: 1000 },
    { id: "p_hr01", person: "Gio", role: "HR", teamIds: [], fixedEur: 1500 },
    { id: "p_ac01", person: "Ada", role: "Formazione", teamIds: ["team_cccc"], fixedEur: 700 },
    { id: "p_sm02", person: "Lia", role: "Sales Manager", teamIds: ["team_bbbb"], min: 1800, pctText: "1%" },
  ],
}, id);
const months = {
  "2026-09": { fx: { rate: 0.85 }, teams: { team_aaaa: { revenueUsd: 80000, chatterUsd: 12000 }, team_bbbb: { revenueUsd: 8000, chatterUsd: 1500 } }, extras: [{ teamId: "", eur: 300 }] },
  "2026-10": { fx: { rate: 0.9 }, teams: { team_aaaa: { revenueUsd: 100000, chatterUsd: 15000 }, team_bbbb: { revenueUsd: 10000, chatterUsd: 2000 } }, extras: [] },
  "2026-11": { fx: { rate: null }, teams: { team_aaaa: { revenueUsd: 50000, chatterUsd: 7000 } }, extras: [] },
};
const expenses = [
  sanitizeExpense({ vendor: "Meta ads", amount: 2000, category: "Pubblicità e promozione", teamId: "team_aaaa", confirmed: true }, id),
  sanitizeExpense({ vendor: "ClickUp", amount: 27000, currency: "USD", cadence: "anno", quota: 100 }, id),
];
const q = computeQuadro(config, months, expenses, "2026-11-21");
const oct = q.months.find((m) => m.month === "2026-10");

t("righe di un mese: creator, poi generale, poi totale", () => {
  const rows = projectRows(oct);
  assert.deepEqual(rows.map((r) => r.kind), ["creator", "creator", "generale", "totale"]);
  assert.equal(rows.at(-2).name, GENERAL_ROW);
  assert.equal(rows.at(-1).name, TOTAL_ROW);
});
t("quadratura: creator + generale = totale, voce per voce, in ogni mese", () => {
  for (const m of q.months) {
    const rows = projectRows(m);
    const tot = rows.at(-1);
    for (const key of ["feeEur", "staffEur", "chatterEur", "extrasEur", "speseEur", "costEur", "nettoEur"]) {
      close(rows.slice(0, -1).reduce((s, r) => s + r[key], 0), tot[key]);
    }
    close(tot.nettoEur, m.utileEur);
  }
});
t("il netto di una creator è quello della pagina (Per creator → Resta)", () => {
  const a = projectRows(oct).find((r) => r.name === "Team A");
  const qa = oct.creators.find((c) => c.name === "Team A");
  assert.equal(a.nettoEur, qa.utileEur);
  assert.equal(a.feeEur, 45000);
  close(a.quotaPct, 0.5);
  close(a.staffEur + a.chatterEur + a.extrasEur + a.speseEur, a.costEur);
});
t("la riga generale raccoglie HR senza team, Academy, ClickUp ed extra d'agenzia", () => {
  const sep = q.months.find((m) => m.month === "2026-09");
  const g = projectRows(sep).find((r) => r.kind === "generale");
  assert.equal(g.feeEur, 0);
  // Gio 1.500 + Ada 700 + extra 300 + ClickUp 27.000$/12 × 0,85 = 1.912,5
  close(g.costEur, 1500 + 700 + 300 + 1912.5);
  close(g.nettoEur, -g.costEur);
});
t("totali per progetto: solo mesi chiusi, il mese in corso resta fuori", () => {
  const pt = projectTotals(q);
  assert.deepEqual(pt.closedMonths, ["2026-09", "2026-10"]);
  const a = pt.rows.find((r) => r.name === "Team A");
  assert.equal(a.months, 2);
  close(a.nettoEur, q.months.filter((m) => !m.partial).reduce((s, m) => s + m.creators.find((c) => c.name === "Team A").utileEur, 0));
  const tot = pt.rows.at(-1);
  close(tot.nettoEur, q.months.filter((m) => !m.partial).reduce((s, m) => s + m.utileEur, 0));
  assert.equal(pt.rows.at(-2).name, GENERAL_ROW);
});
t("file: quattro fogli, intestazioni e righe coerenti", () => {
  const sheets = buildQuadroExport(q, { today: "2026-11-21" });
  assert.deepEqual(sheets.map((s) => s.name), ["Leggimi", "Per progetto", "Mese per mese", "Totali per progetto"]);
  const pp = sheets[1];
  assert.equal(pp.rows[0].length, pp.widths.length);
  // 3 mesi: (2 creator + generale + totale) ciascuno; a novembre B non ha revenue ma resta in riga con la nota
  assert.equal(pp.rows.length - 1, 12);
  assert.ok(pp.rows.every((r, i) => i === 0 || r.length === pp.rows[0].length));
  // il mese più recente in cima, marcato in corso
  assert.equal(pp.rows[1][0], monthLabel("2026-11"));
  assert.match(pp.rows[1][1], /^in corso \(fino al 21\/11\)$/);
  assert.equal(sheets[2].rows[0].length, sheets[2].widths.length);
  assert.equal(sheets[3].rows[0].length, sheets[3].widths.length);
  assert.equal(sheets[2].rows.length - 1, 3);
});
t("leggimi: perimetro, mesi chiusi e avviso sui costi societari", () => {
  const txt = buildQuadroExport(q, { today: "2026-11-21" })[0].rows.map((r) => r.join(" ")).join("\n");
  assert.match(txt, /Mesi chiusi 2/);
  assert.match(txt, /parziale, non è un netto reale/);
  assert.match(txt, /commercialista/);
  assert.match(txt, /21\/11\/2026/);
});
t("dati mancanti: la nota arriva nel file", () => {
  const nov = q.months.find((m) => m.month === "2026-11");
  const b = projectRows(nov).find((r) => r.name === "Team B");
  assert.match(b.note, /revenue del mese non inserita/);
});
t("nome file con la data", () => {
  assert.equal(exportFileName("2026-11-21"), "conti-impresa-2026-11-21.xlsx");
});

console.log(`✓ quadro-export: ${n} test`);
