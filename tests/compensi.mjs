// Unit test — compensi-core + compensi-crypto. Esegui: node tests/compensi.mjs
import assert from "node:assert/strict";

process.env.ACCOUNTING_ENCRYPTION_KEY = "ab".repeat(32); // solo test

import {
  computeLine, computeMonth, tierFor, normalizeTiers, personKey, revenueFor, cloneForNextMonth,
  sanitizeLine, nextMonthId, isMonthId, toNumber, namesMatch,
} from "../src/lib/compensi-core.js";
import { sealJson, openJson } from "../src/lib/compensi-crypto.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

// ── L'esempio di Nicholas: Eleonora, 1500€ minimo oppure 5% su Anastasia ────
const eleonora = { person: "Eleonora Ragozzino", method: "gamification", rule: { minEur: 1500, tiers: [{ fromUsd: 0, pct: 0.05 }], projects: ["Anastasia"] } };
t("sotto soglia vale il minimo", () => {
  const r = computeLine(eleonora, { fx: 0.85, revenues: [{ name: "Anastasia", usd: 30000 }] });
  // 30000 × 5% = 1500$ × 0,85 = 1275€ < 1500 → minimo
  assert.equal(r.detail.variableUsd, 1500);
  assert.equal(r.detail.variableEur, 1275);
  assert.equal(r.applied, "minimo");
  assert.equal(r.totalEur, 1500);
});
t("sopra soglia vale la percentuale, prima sul dollaro poi il cambio", () => {
  const r = computeLine(eleonora, { fx: 0.85, revenues: [{ name: "anastasia ", usd: 50000 }] });
  // 50000 × 5% = 2500$ → × 0,85 = 2125€
  assert.equal(r.applied, "variabile");
  assert.equal(r.totalEur, 2125);
});
t("senza cambio: minimo + problema dichiarato", () => {
  const r = computeLine(eleonora, { fx: null, revenues: [{ name: "Anastasia", usd: 90000 }] });
  assert.equal(r.totalEur, 1500);
  assert.ok(r.detail.problems.some((p) => p.includes("tasso")));
});
t("revenue mancante dichiarata", () => {
  const r = computeLine(eleonora, { fx: 0.85, revenues: [] });
  assert.ok(r.detail.problems.some((p) => p.includes("anastasia")));
});

// ── Caso reale del foglio "Calcolo": Giulia Ottorini 158.265,69$ × 3% = 4.748$ → 3.988€ ──
const sm = { method: "gamification", rule: { minEur: 2500, tiers: [{ fromUsd: 100000, pct: 0.025 }, { fromUsd: 150000, pct: 0.03 }], projects: ["Giulia Ottorini"] } };
t("scaglioni: si applica il più alto raggiunto su tutta la revenue", () => {
  const r = computeLine(sm, { fx: 0.84, revenues: [{ name: "Giulia Ottorini", usd: 158265.69 }] });
  assert.equal(r.detail.pct, 0.03);
  assert.equal(r.detail.variableUsd, 4747.97);
  assert.equal(Math.round(r.totalEur), 3988);
});
t("scaglione intermedio", () => {
  const r = computeLine(sm, { fx: 1, revenues: [{ name: "Giulia Ottorini", usd: 120000 }] });
  assert.equal(r.detail.pct, 0.025);
  assert.equal(r.totalEur, 3000);
});
t("sotto il primo scaglione: niente percentuale, vale il minimo", () => {
  const r = computeLine(sm, { fx: 1, revenues: [{ name: "Giulia Ottorini", usd: 100000 }] });
  assert.equal(r.detail.pct, 0); // >100K, non ≥
  assert.equal(r.totalEur, 2500);
});
t("più progetti si sommano (Riccardo: 2% su tre progetti)", () => {
  const l = { method: "gamification", rule: { minEur: 0, tiers: [{ fromUsd: 0, pct: 0.02 }], projects: ["Gaja", "Elisa Esposito", "Silos 1"] } };
  const r = computeLine(l, { fx: 1, revenues: [{ name: "Gaja", usd: 177428.25 }, { name: "Elisa Esposito", usd: 97115.86 }, { name: "Silos 1", usd: 74015.13 }, { name: "Altro", usd: 999999 }] });
  assert.equal(r.detail.revenueUsd, 348559.24);
  assert.equal(r.totalEur, 6971.18);
});

// ── Parsing ───────────────────────────────────────────────────────────────
t("percentuali scritte in tutti i modi", () => {
  assert.deepEqual(normalizeTiers([{ fromUsd: "100.000", pct: "2,5%" }]), [{ fromUsd: 100000, pct: 0.025 }]);
  assert.deepEqual(normalizeTiers([{ fromUsd: 0, pct: 3 }]), [{ fromUsd: 0, pct: 0.03 }]);
  assert.deepEqual(normalizeTiers([{ fromUsd: 0, pct: "0,5%" }]), [{ fromUsd: 0, pct: 0.005 }]);
  assert.deepEqual(normalizeTiers([{ fromUsd: 0, pct: 0.015 }]), [{ fromUsd: 0, pct: 0.015 }]);
  assert.equal(normalizeTiers([{ pct: 0 }]).length, 0);
});
t("numeri all'italiana", () => {
  assert.equal(toNumber("4014,03"), 4014.03);
  assert.equal(toNumber("1.234,56"), 1234.56);
  assert.equal(toNumber("3988"), 3988);
  assert.equal(toNumber("500 "), 500);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber("abc"), 0);
});
t("tierFor con soglia 0 richiede revenue > 0", () => {
  assert.equal(tierFor([{ fromUsd: 0, pct: 0.05 }], 0), null);
  assert.equal(tierFor([{ fromUsd: 0, pct: 0.05 }], 1).pct, 0.05);
});
t("personKey ignora maiuscole, spazi, accenti e note tra parentesi", () => {
  assert.equal(personKey("Simone Enrico Reo (Mose)"), personKey("simone enrico  reo"));
  assert.equal(personKey("Veronica Germanà "), "veronica germana");
});

// ── Mese: per persona una voce sola ──────────────────────────────────────
const doc = {
  month: "2026-09", fx: { rate: 0.85 },
  revenues: [{ name: "Anastasia", usd: 50000 }],
  lines: [
    { id: "a", team: "Claudia", mansione: "Sales Manager", person: "Dario Angeloro", method: "fisso", fixedEur: 4027.41, paid: true },
    { id: "b", team: "Media", mansione: "Media Buyer", person: "Dario Angeloro ", method: "fisso", fixedEur: 800, extras: [{ label: "bonus", eur: 100 }], paid: false },
    { id: "c", team: "Anastasia", mansione: "Chatter Manager", ...eleonora, paid: false },
    { id: "d", team: "Claudia", mansione: "SMM", person: "Federico Naso", method: "fisso", fixedEur: 2000, extras: [{ label: "Bonus Jack", eur: 800 }, { label: "trattenuta", eur: -250 }], paid: true },
  ],
};
t("una persona su più righe = una voce, pagata solo se tutte pagate", () => {
  const m = computeMonth(doc);
  const dario = m.byPerson.find((p) => p.key === "dario angeloro");
  assert.equal(dario.lines.length, 2);
  assert.equal(dario.totalEur, 4927.41);
  assert.equal(dario.paid, false);
  assert.deepEqual(dario.teams.sort(), ["Claudia", "Media"]);
  assert.equal(m.totals.people, 3);
});
t("totali e extra negativi", () => {
  const m = computeMonth(doc);
  assert.equal(m.byPerson.find((p) => p.person === "Federico Naso").totalEur, 2550);
  assert.equal(m.totals.totalEur, 4927.41 + 2125 + 2550);
  assert.equal(m.totals.paidEur, 2550);
  assert.equal(m.byTeam.find((g) => g.team === "Claudia").totalEur, 6577.41);
});
t("nuovo mese: righe e regole sì, pagato/extra/revenue/cambio no", () => {
  let i = 0;
  const next = cloneForNextMonth({ ...doc, lines: doc.lines.map((l) => ({ ...l, note: "x", keepNote: l.id === "d" })) }, "2026-10", () => `n${i++}`);
  assert.equal(next.lines.length, 4);
  assert.ok(next.lines.every((l) => !l.paid && l.extras.length === 0));
  assert.equal(next.lines.find((l) => l.person === "Federico Naso").note, "x");
  assert.equal(next.lines.find((l) => l.person === "Eleonora Ragozzino").note, "");
  assert.equal(next.fx.rate, null);
  assert.equal(next.revenues[0].usd, null);
  assert.equal(next.lines[2].rule.minEur, 1500);
});
t("sanitizeLine forza i tipi e scarta campi ignoti", () => {
  const s = sanitizeLine({ id: "<script>", person: "  Tizio ", method: "boh", fixedEur: "1.500,50", evil: 1, extras: [{ label: "", eur: "" }] }, () => "l_new1");
  assert.equal(s.id, "l_new1");
  assert.equal(s.method, "fisso");
  assert.equal(s.fixedEur, 1500.5);
  assert.equal(s.person, "Tizio");
  assert.equal(s.evil, undefined);
  assert.equal(s.extras.length, 0);
  const g = sanitizeLine({ method: "gamification", person: "X", rule: { minEur: "1500", tiers: [{ fromUsd: "0", pct: "5%" }], projects: ["Anastasia", ""] } }, () => "l_x1");
  assert.deepEqual(g.rule, { minEur: 1500, tiers: [{ fromUsd: 0, pct: 0.05 }], projects: ["Anastasia"] });
  assert.equal(g.fixedEur, null);
});
t("mesi", () => {
  assert.equal(nextMonthId("2026-12"), "2027-01");
  assert.equal(nextMonthId("2026-09"), "2026-10");
  assert.ok(isMonthId("2026-10") && !isMonthId("2026-13") && !isMonthId("x"));
});
t("revenueFor segnala i progetti senza revenue", () => {
  assert.deepEqual(revenueFor(["A", "B"], [{ name: "a", usd: 10 }]), { usd: 10, missing: ["b"] });
});

t("namesMatch: esatto, simile, diverso", () => {
  assert.equal(namesMatch("Marco Bove", "Salvatore Marco Bove"), "simile");
  assert.equal(namesMatch("Michael levato", "Michael Pietro Levato"), "simile");
  assert.equal(namesMatch("Luis Aguilar", "Luis Fernando Aguilar Escobar"), "simile");
  assert.equal(namesMatch("Veronica Germanà ", "veronica germana"), "esatto");
  assert.equal(namesMatch("Asja", "Asja Rossi"), false); // una parola sola: troppo poco
  assert.equal(namesMatch("Marco Bove", "Marco Rossi"), false);
});

// ── Cifratura ─────────────────────────────────────────────────────────────
t("cifrato e decifrato; legato alla sua chiave KV", () => {
  const sealed = sealJson({ iban: "IT00X" }, "acct:month:2026-09");
  assert.ok(sealed.startsWith("v1:") && !sealed.includes("IT00X"));
  assert.deepEqual(openJson(sealed, "acct:month:2026-09"), { iban: "IT00X" });
  assert.throws(() => openJson(sealed, "acct:month:2026-10")); // spostato su un'altra chiave → rifiutato
  assert.throws(() => openJson(sealed.slice(0, -4) + "AAAA", "acct:month:2026-09")); // manomesso
  assert.throws(() => openJson('{"iban":"IT00X"}', "")); // in chiaro → rifiutato
});

console.log(`compensi: ${n} test ok`);
