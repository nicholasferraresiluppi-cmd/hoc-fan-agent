// Unit test — spese-core (registro spese + Quadro dell'impresa). Esegui: node tests/spese.mjs
import assert from "node:assert/strict";
import { sanitizeExpense, sanitizeExpenses, expenseInMonth, computeExpensesMonth, computeQuadro, missingMonths, moneyFlow, quadroChecks, roleGroup } from "../src/lib/spese-core.js";
import { sanitizeConfig } from "../src/lib/split-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };
let k = 0; const id = () => `x_${(k++).toString().padStart(4, "0")}`;
const E = (x) => sanitizeExpense(x, id);

t("sanitize: default sensati", () => {
  const e = E({ vendor: "Vercel", amount: "20,5", category: "boh", quota: "" });
  assert.equal(e.amount, 20.5); assert.equal(e.category, "Altro"); assert.equal(e.quota, 100);
  assert.equal(e.currency, "EUR"); assert.equal(e.cadence, "mese"); assert.equal(e.confirmed, false);
});
t("sanitize: quota limitata 0-100, voci vuote tolte", () => {
  assert.equal(E({ vendor: "x", quota: 250 }).quota, 100);
  assert.equal(E({ vendor: "x", quota: -5 }).quota, 0);
  assert.equal(sanitizeExpenses([{ vendor: "" }, { vendor: "a" }], id).length, 1);
});
t("mensile: importo pieno nei mesi attivi", () => {
  const e = E({ vendor: "a", amount: 100, from: "2026-10" });
  assert.equal(expenseInMonth(e, "2026-09", 0.9).eur, 0);
  assert.equal(expenseInMonth(e, "2026-10", 0.9).eur, 100);
});
t("annuale: un dodicesimo al mese, in dollari al cambio", () => {
  const e = E({ vendor: "ClickUp", amount: 27000, currency: "USD", cadence: "anno" });
  assert.equal(expenseInMonth(e, "2026-11", 0.86).eur, 1935);
});
t("quota dello split: una spesa in comune pesa solo per la nostra parte", () => {
  const e = E({ vendor: "ClickUp", amount: 1200, cadence: "anno", quota: 50 });
  assert.equal(expenseInMonth(e, "2026-11", 1).eur, 50);
  assert.equal(expenseInMonth(e, "2026-11", 1).eurFull, 100);
});
t("una tantum: solo nel suo mese; senza mese = problema", () => {
  const e = E({ vendor: "Fiscalista", amount: 5000, currency: "USD", cadence: "una_tantum", from: "2026-11" });
  assert.equal(expenseInMonth(e, "2026-10", 0.86).eur, 0);
  assert.equal(expenseInMonth(e, "2026-11", 0.86).eur, 4300);
  assert.deepEqual(expenseInMonth(E({ vendor: "x", amount: 5, cadence: "una_tantum" }), "2026-11", 1).problems, ["manca il mese della spesa"]);
});
t("dollari senza cambio: zero e problema dichiarato", () => {
  const r = expenseInMonth(E({ vendor: "a", amount: 10, currency: "USD" }), "2026-11", null);
  assert.equal(r.eur, 0); assert.deepEqual(r.problems, ["manca il cambio"]);
});
t("mese: totali per categoria e per team", () => {
  const items = [
    E({ vendor: "Vercel", amount: 20, category: "Tecnologia e dati" }),
    E({ vendor: "Railway", amount: 30, category: "Tecnologia e dati", teamId: "team_aaaa" }),
    E({ vendor: "Meta", amount: 100, category: "Pubblicità e promozione", teamId: "team_aaaa", confirmed: true }),
  ];
  const r = computeExpensesMonth(items, "2026-11", 1);
  assert.equal(r.totalEur, 150);
  assert.deepEqual(r.byCategory, [{ category: "Pubblicità e promozione", eur: 100 }, { category: "Tecnologia e dati", eur: 50 }]);
  assert.deepEqual(r.byTeam, { "": 20, team_aaaa: 130 });
  assert.equal(r.toConfirm, 2);
});
t("gruppi di ruolo", () => {
  assert.equal(roleGroup("Sales Manager Junior · fase 2"), "Sales manager");
  assert.equal(roleGroup("Chatter Manager Sr"), "Sales manager");
  assert.equal(roleGroup("SMM"), "Social e contenuti");
  assert.equal(roleGroup("Editor"), "Social e contenuti");
  assert.equal(roleGroup("Forfait formazione SM"), "Formazione");
  assert.equal(roleGroup("HR"), "Struttura e altri");
  assert.equal(roleGroup(""), "Struttura e altri");
});
t("mesi mancanti fino al mese in corso", () => {
  assert.deepEqual(missingMonths(["2026-09"], "2026-11"), ["2026-10", "2026-11"]);
  assert.deepEqual(missingMonths(["2026-11", "2026-12"], "2027-01"), ["2027-01"]);
  assert.deepEqual(missingMonths([], "2026-11"), []);
});

// Quadro su un piccolo split: una creator 50% flat, una SM con minimo, un HR senza team, una spesa sulla creator e una generale.
const config = sanitizeConfig({
  teams: [{ id: "team_aaaa", name: "Team A", creator: "A", dealText: "50% flat" }, { id: "team_bbbb", name: "Team B", creator: "B", dealText: "40% flat" }],
  people: [
    { id: "p_sm01", person: "Sara", role: "Sales Manager", teamIds: ["team_aaaa"], pctText: "2%", min: 1000 },
    { id: "p_hr01", person: "Gio", role: "HR", teamIds: [], fixedEur: 1500 },
    { id: "p_sm02", person: "Lia", role: "Sales Manager Junior · fase 2", teamIds: ["team_bbbb"], fixedEur: 1800, pctText: "1%" },
  ],
}, id);
const months = {
  "2026-10": { fx: { rate: 0.9 }, teams: { team_aaaa: { revenueUsd: 100000, chatterUsd: 15000 }, team_bbbb: { revenueUsd: 10000, chatterUsd: 2000 } }, extras: [] },
  "2026-11": { fx: { rate: null }, teams: { team_aaaa: { revenueUsd: 50000, chatterUsd: 7000 } }, extras: [] },
};
const expenses = [
  E({ vendor: "Meta ads", amount: 2000, category: "Pubblicità e promozione", teamId: "team_aaaa", confirmed: true }),
  E({ vendor: "ClickUp", amount: 27000, currency: "USD", cadence: "anno", quota: 100, note: "in comune con tutta HOC" }),
];
const q = computeQuadro(config, months, expenses, "2026-11-18");
const oct = q.months[0];

t("quadro: ottobre chiuso, novembre parziale", () => {
  assert.equal(q.months.length, 2);
  assert.equal(oct.partial, false); assert.equal(q.months[1].partial, true);
});
t("quadro: utile = netto del conto − spese", () => {
  // fee A 50.000$ ×0,9 = 45.000; fee B 4.000$ ×0,9 = 3.600 → 48.600
  assert.equal(oct.feeEur, 48600);
  // Sara: 2% di 100k = 2.000$ ×0,9 = 1.800 > minimo · Gio 1.500 · Lia 1.800 + 1% di 10k = 90 → 1.890
  assert.equal(oct.staffEur, 5190);
  assert.equal(oct.chatterEur, 15300);
  // spese: Meta 2.000 + ClickUp 27.000/12 ×0,9 = 2.025
  assert.equal(oct.speseEur, 4025);
  assert.equal(oct.netContoEur, 48600 - 5190 - 15300);
  assert.equal(oct.utileEur, 48600 - 5190 - 15300 - 4025);
});
t("quadro: per creator le spese della creator pesano su di lei", () => {
  const a = oct.creators.find((c) => c.id === "team_aaaa");
  assert.equal(a.speseEur, 2000);
  assert.equal(a.utileEur, 45000 - 1800 - 13500 - 2000);
});
t("quadro: mese senza cambio usa l'ultimo cambio noto per le spese", () => {
  assert.equal(q.months[1].fx, 0.9);
  assert.equal(q.months[1].expenses.totalEur, 4025);
});
t("dove vanno i soldi: persone per gruppo, operatori, spese per categoria", () => {
  const f = moneyFlow(oct);
  assert.equal(f[0].label, "Operatori in chat");
  assert.ok(f.some((r) => r.label === "Sales manager" && r.eur === 3690));
  assert.ok(f.some((r) => r.label === "Struttura e altri" && r.eur === 1500));
  assert.ok(f.every((r, i) => i === 0 || f[i - 1].eur >= r.eur));
  close(f.reduce((s, r) => s + r.eur, 0), oct.costEur);
});
t("da sistemare: SM con fisso+%, spesa da confermare, spesa comune al 100%", () => {
  const c = quadroChecks(config, q, expenses, "2026-11-18");
  const ids = c.map((x) => x.id);
  assert.ok(ids.includes("sm:p_sm02"));
  assert.ok(!ids.includes("sm:p_sm01"));
  assert.ok(ids.includes("spese"));
  assert.ok(ids.some((i) => i.startsWith("quota:")));
  assert.ok(!ids.includes("mesi"));
});
t("da sistemare: creator in perdita nell'ultimo mese chiuso", () => {
  const cheap = { ...months, "2026-10": { ...months["2026-10"], teams: { ...months["2026-10"].teams, team_bbbb: { revenueUsd: 1000, chatterUsd: 2000 } } } };
  const c = quadroChecks(config, computeQuadro(config, cheap, [], "2026-11-18"), [], "2026-11-18");
  assert.ok(c.some((x) => x.id === "loss:team_bbbb"));
});

function close(a, b, eps = 0.05) { assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`); }
console.log(`✓ spese-core: ${n} test`);
