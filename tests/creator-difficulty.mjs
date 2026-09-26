// Unit test — creator-difficulty (funzioni pure). Esegui: node tests/creator-difficulty.mjs
//
// Copre in particolare le decisioni di DESIGN facili da rompere per sbaglio:
//   - null ≠ 0 (Number(null)=0: un dato mancante NON è "il più freddo dell'org")
//   - floor di campione: sotto-campione → si tace (null), non si classifica
//   - ppv_price_p50 FUORI dall'indice (comportamento del team, non del pubblico)
//   - pagine free: flag a TASSO (un tip storico non basta a "renderle paid")
//   - coorte percentili = solo pagine paid, solo valori sopra-floor
import assert from "node:assert/strict";
import {
  isFreePage,
  percentileRank,
  difficultyIndex,
  applySampleFloors,
  buildProfiles,
  isStale,
  DIFFICULTY_COMPONENTS,
  SAMPLE_FLOORS,
} from "../src/lib/creator-difficulty-core.js";

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  n++;
};

// ── isFreePage ───────────────────────────────────────────────────────────────
ok(isFreePage("Camilla Araujo FREE - BOP", 500, 10000), "nome con FREE → flag");
ok(isFreePage("Giorgia BOP", 500, 10000), "nome con BOP → flag");
ok(!isFreePage("Fishball - IT", 19977, 116105), "pagina paid normale → no flag");
ok(isFreePage("Eva Menta", 0, 10864), "zero paganti con pubblico grande → flag (paid abbinato)");
ok(!isFreePage("Nuova - IT", 0, 300), "zero paganti ma pubblico piccolo → no flag (è solo nuova)");
eq(isFreePage("Freedom - IT", 1000, 5000), false, "word boundary: 'Freedom' non è 'free'");
// review 30/07: la soglia "payers esattamente 0" era aggirabile da un singolo tip
ok(isFreePage("Giorgia Baby", 30, 20000), "free senza nome-free ma 0,15% paganti → flag (tasso, non zero esatto)");
ok(!isFreePage("Fredda vera - EN", 800, 10000), "pagina paid fredda all'8% → NON flaggata (la più fredda reale è ~4-8%)");

// ── percentileRank ───────────────────────────────────────────────────────────
eq(percentileRank(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 0.45, "rango col mezzo-pari");
eq(percentileRank(1, [1, 2, 3, 4]), 0.125, "minimo → metà del suo pari");
eq(percentileRank(99, [1, 2, 3]), 1, "sopra tutti → 1");
eq(percentileRank(2, [2, 2, 2, 2]), 0.5, "tutti pari → 0.5 (stabile ai duplicati)");
eq(percentileRank("x", [1, 2, 3]), null, "non numerico → null");
eq(percentileRank(3, [3]), null, "coorte di 1 → null (nessun confronto possibile)");
eq(percentileRank(3, []), null, "coorte vuota → null");
// ⚠️ regressione UI 30/07: Number(null)=0 → un dato MANCANTE diventava "il più
// basso dell'org" e spingeva creator senza dati in cima alla difficoltà
eq(percentileRank(null, [1, 2, 3]), null, "null → null (non 0!)");
eq(percentileRank(undefined, [1, 2, 3]), null, "undefined → null");
eq(percentileRank(2, [1, null, 3]), 0.5, "null nella coorte → escluso, non contato come 0");

// ── componenti dell'indice (review 30/07: ppv FUORI — comportamento del team) ─
const keys = DIFFICULTY_COMPONENTS.filter((c) => c.in_index).map((c) => c.key);
eq(keys, ["pct_ever_paid", "cr_avg", "arppu_avg", "ltv_p50"], "indice = 4 misure del PUBBLICO, senza ppv");
ok(DIFFICULTY_COMPONENTS.find((c) => c.key === "ppv_price_p50").in_index === false, "ppv resta contesto, non indice");

// ── applySampleFloors ────────────────────────────────────────────────────────
const richRow = {
  creator_name: "Ricca - IT", n_fan: 50000, payers_n: 12000, mature_fans: 40000,
  pct_ever_paid: 0.24, cr_avg: 0.15, arppu_avg: 60, ppv_price_p50: 35, ltv_p50: 30,
  new_subs_60d: 3000, active_user_days_60d: 5000, ppv_sent_60d: 15000, whale_share_top1: 0.3,
};
const fRich = applySampleFloors(richRow);
eq(fRich.low_sample_keys, [], "campioni pieni → nessun floor scatta");
eq(fRich.pct_ever_paid, 0.24, "valore sopra-floor intatto");

const tinyRow = {
  creator_name: "Nuova - IT", n_fan: 300, payers_n: 5, mature_fans: 40,
  pct_ever_paid: 0.02, cr_avg: 0.33, arppu_avg: 55, ppv_price_p50: 20, ltv_p50: 9,
  new_subs_60d: 12, active_user_days_60d: 30, ppv_sent_60d: 8, whale_share_top1: 0.9,
};
const fTiny = applySampleFloors(tinyRow);
eq(fTiny.pct_ever_paid, null, "40 fan maturi < 300 → pct taciuta");
eq(fTiny.cr_avg, null, "12 nuovi sub < 100 → CR taciuta (33% su 12 sub = rumore)");
eq(fTiny.arppu_avg, null, "30 fan-giorno < 100 → ARPPU taciuta");
eq(fTiny.ltv_p50, null, "5 paganti < 20 → LTV taciuta");
eq(fTiny.ppv_price_p50, null, "8 PPV < 30 → prezzo taciuto");
eq(fTiny.whale_share_top1, null, "top-1% su 5 paganti = il top fan → taciuta");
eq(fTiny.low_sample_keys.length, 6, "tutti i 6 componenti floored tracciati");
// basis mancante = campione non dimostrabile → si tace comunque
const noBasis = applySampleFloors({ pct_ever_paid: 0.2 });
eq(noBasis.pct_ever_paid, null, "senza basis (mature_fans assente) → null, non fiducia cieca");

// ── difficultyIndex ──────────────────────────────────────────────────────────
const cohort = {
  pct_ever_paid: [0.05, 0.1, 0.2, 0.3],
  cr_avg: [0.05, 0.1, 0.15, 0.2],
  arppu_avg: [20, 40, 60, 80],
  ltv_p50: [10, 20, 30, 40],
};
const cold = { pct_ever_paid: 0.05, cr_avg: 0.05, arppu_avg: 20, ltv_p50: 10 };
const hot = { pct_ever_paid: 0.3, cr_avg: 0.2, arppu_avg: 80, ltv_p50: 40 };
const idxCold = difficultyIndex(cold, cohort);
const idxHot = difficultyIndex(hot, cohort);
ok(idxCold > idxHot, "il pubblico più freddo ha indice più alto");
eq(idxCold, 88, "minimo su tutto: 1 - 0.125 = 0.875 → 88");
eq(idxHot, 13, "massimo su tutto: 1 - 0.875 = 0.125 → 13");
eq(difficultyIndex({ ...cold, free_page: true }, cohort), null, "free page → niente indice");
eq(
  difficultyIndex({ pct_ever_paid: 0.1, cr_avg: 0.1 }, { pct_ever_paid: cohort.pct_ever_paid, cr_avg: cohort.cr_avg }),
  null,
  "2 soli componenti → null"
);
// ppv nel profilo NON deve toccare l'indice
eq(
  difficultyIndex({ ...cold, ppv_price_p50: 1 }, { ...cohort, ppv_price_p50: [1, 50, 100] }),
  idxCold,
  "ppv presente ma ignorato dall'indice"
);
eq(
  difficultyIndex({ pct_ever_paid: null, cr_avg: 0.001, arppu_avg: 55, ltv_p50: null }, cohort),
  null,
  "riga sparsa (2 soli componenti reali, il resto null) → indice null, NON 'freddissima'"
);

// ── buildProfiles (integrazione: floor → free → coorte → percentili → indice) ─
const mk = (over) => ({
  mature_fans: 20000, new_subs_60d: 2000, active_user_days_60d: 3000, ppv_sent_60d: 5000,
  whale_share_top1: 0.3, ...over,
});
const rows = [
  mk({ creator_id: "a", creator_name: "Calda - IT", n_fan: 50000, payers_n: 12000, pct_ever_paid: 0.24, ltv_p50: 30, cr_avg: 0.15, arppu_avg: 60, ppv_price_p50: 35, revenue_60d: 200000 }),
  mk({ creator_id: "b", creator_name: "Fredda - IT", n_fan: 40000, payers_n: 4000, pct_ever_paid: 0.1, ltv_p50: 12, cr_avg: 0.08, arppu_avg: 22, ppv_price_p50: 7, revenue_60d: 50000 }),
  mk({ creator_id: "c", creator_name: "Media - IT", n_fan: 30000, payers_n: 5000, pct_ever_paid: 0.17, ltv_p50: 20, cr_avg: 0.11, arppu_avg: 40, ppv_price_p50: 20, revenue_60d: 90000 }),
  mk({ creator_id: "d", creator_name: "Pagina FREE - BOP", n_fan: 60000, payers_n: 200, pct_ever_paid: 0.003, ltv_p50: 5, cr_avg: 0.02, arppu_avg: 10, ppv_price_p50: 9, revenue_60d: 150000 }),
  // riga sparsa reale: solo CR+ARPPU con basi piccole → tutto floored → n/d
  { creator_id: "e", creator_name: "Sparsa - IT", n_fan: null, payers_n: null, cr_avg: 0.4, arppu_avg: 55, new_subs_60d: 16, active_user_days_60d: 12, revenue_60d: 700 },
];
const profiles = buildProfiles(rows);
eq(profiles.length, 5, "tutte le righe presenti");
const byName = Object.fromEntries(profiles.map((p) => [p.creator_name, p]));
ok(byName["Pagina FREE - BOP"].free_page, "free flaggata");
eq(byName["Pagina FREE - BOP"].difficulty_index, null, "free senza indice");
eq(byName["Pagina FREE - BOP"].org_percentile.pct_ever_paid, null, "free senza percentili");
ok(byName["Fredda - IT"].difficulty_index > byName["Calda - IT"].difficulty_index, "fredda > calda");
eq(profiles[0].creator_name, "Fredda - IT", "ordinamento: la più difficile in alto");
eq(byName["Sparsa - IT"].difficulty_index, null, "sparsa+sotto-campione → n/d (la regressione UI del 30/07)");
ok(["Pagina FREE - BOP", "Sparsa - IT"].includes(profiles[profiles.length - 1].creator_name), "senza indice in fondo");
// la coorte dei percentili esclude le free: il percentile della "Fredda" su pct_ever_paid
// è calcolato su 3 valori (0.24, 0.1, 0.17), non 4 → minimo dei 3 = 1/6
eq(byName["Fredda - IT"].org_percentile.pct_ever_paid, 1 / 6, "coorte percentili = solo pagine paid sopra-floor");

// ── isStale ──────────────────────────────────────────────────────────────────
const now = Date.parse("2026-07-30T12:00:00Z");
ok(!isStale("2026-07-29T12:00:00Z", now), "1 giorno → fresco");
ok(isStale("2026-07-20T12:00:00Z", now), "10 giorni → stantio");
ok(isStale(null, now), "assente → stantio");
ok(isStale("boh", now), "malformato → stantio");
ok(!isStale("2026-07-24T13:00:00Z", now), "5,96 giorni → ancora fresco (soglia 6g)");
ok(isStale("2026-07-24T11:00:00Z", now), "6,04 giorni → stantio");

// SAMPLE_FLOORS coerenti coi componenti (ogni floored key esiste nel catalogo)
for (const k of Object.keys(SAMPLE_FLOORS)) {
  ok(DIFFICULTY_COMPONENTS.some((c) => c.key === k), `floor su componente esistente: ${k}`);
}

console.log(`✓ creator-difficulty: ${n} asserzioni passate`);
