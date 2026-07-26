#!/usr/bin/env node
/**
 * Unit test del core puro dell'attivazione operatore (src/lib/activation-core.js).
 * Zero dipendenze: si esegue con `node tests/activation-core.test.mjs`.
 */
import { computeActivation, EVENT, ACTIVATION_THRESHOLDS } from "../src/lib/activation-core.js";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }

const T = 1_700_000_000_000; // timestamp base fisso
const HOUR = 3_600_000;
const DAY = 86_400_000;
// Shape REALE di produzione: recommendPathForGap().categories = [{id,name}] (non stringhe).
// Il core deve normalizzare a id, quindi il test usa la stessa shape per non mascherare bug di wiring.
const stub = (key) =>
  key === "question_rate"
    ? [{ id: "mass-e-conversione", name: "Mass & conversione" }, { id: "le-basi-della-chat", name: "Le basi" }]
    : [];
const stubStrings = (key) => (key === "question_rate" ? ["mass-e-conversione", "le-basi-della-chat"] : []);
const cfg = ACTIVATION_THRESHOLDS; // window 7g, minGapScenarios 2, minOverall 60

const aha = { t: EVENT.SIGNALS_VIEWED, ts: T, top_gap_key: "question_rate", has_profile: true };
const sc = (ts, categoryId, overall) => ({ t: EVENT.SCENARIO_COMPLETED, ts, categoryId, overall });

// 1) vuoto → niente
let r = computeActivation([], cfg, stub);
ok(r.ahaReached === false && r.activated === false, "vuoto → non attivo, aha false");

// 2) signals senza gap → aha false
r = computeActivation([{ t: EVENT.SIGNALS_VIEWED, ts: T, top_gap_key: null }], cfg, stub);
ok(r.ahaReached === false, "signals_viewed senza top_gap → aha false");

// 3) aha + 2 scenari-gap validi in finestra → ATTIVO
r = computeActivation([aha, sc(T + HOUR, "mass-e-conversione", 70), sc(T + 2 * HOUR, "le-basi-della-chat", 65)], cfg, stub);
ok(r.ahaReached === true, "aha raggiunto");
ok(r.gapKey === "question_rate", "gapKey corretto");
ok(r.gapScenariosInWindow === 2, "2 scenari-gap contati");
ok(r.activated === true, "attivo con 2 scenari-gap validi");
ok(r.activatedTs === T + 2 * HOUR, "activatedTs = ts del 2º scenario qualificante");

// 4) categoria sbagliata → non conta
r = computeActivation([aha, sc(T + HOUR, "custom-e-upsell", 80), sc(T + 2 * HOUR, "recuperi-e-retention", 80)], cfg, stub);
ok(r.gapScenariosInWindow === 0 && r.activated === false, "scenari in categoria non-gap → non attivo");

// 5) sotto il floor qualità → non conta
r = computeActivation([aha, sc(T + HOUR, "mass-e-conversione", 50), sc(T + 2 * HOUR, "le-basi-della-chat", 55)], cfg, stub);
ok(r.gapScenariosInWindow === 0 && r.activated === false, "overall sotto 60 → non attivo");

// 6) fuori finestra → non conta
r = computeActivation([aha, sc(T + 10 * DAY, "mass-e-conversione", 90), sc(T + 11 * DAY, "le-basi-della-chat", 90)], cfg, stub);
ok(r.gapScenariosInWindow === 0 && r.activated === false, "scenari oltre 7 giorni → non attivo");

// 7) un solo scenario qualificante → serve la soglia (2)
r = computeActivation([aha, sc(T + HOUR, "mass-e-conversione", 90)], cfg, stub);
ok(r.gapScenariosInWindow === 1 && r.activated === false, "1 scenario-gap → non ancora attivo");

// 8) scenario PRIMA dell'aha → non conta (l'aha viene prima per definizione)
r = computeActivation([aha, sc(T - HOUR, "mass-e-conversione", 90), sc(T + HOUR, "le-basi-della-chat", 90)], cfg, stub);
ok(r.gapScenariosInWindow === 1 && r.activated === false, "scenario prima dell'aha escluso");

// 9) robustezza input sporchi
r = computeActivation(null, cfg, stub);
ok(r.ahaReached === false, "input null → robusto");
r = computeActivation([null, undefined, aha, sc(T + HOUR, "mass-e-conversione", 70), sc(T + 2 * HOUR, "mass-e-conversione", 70)], cfg, stub);
ok(r.activated === true, "elementi nulli ignorati, resto valutato");

// 10) resolver di default (nessuna categoria) → mai attivo
r = computeActivation([aha, sc(T + HOUR, "mass-e-conversione", 70), sc(T + 2 * HOUR, "mass-e-conversione", 70)], cfg);
ok(r.activated === false && r.gapScenariosInWindow === 0, "senza resolver → nessuna categoria-gap → non attivo");

// 11) il core normalizza anche categorie come STRINGHE (robustezza a entrambe le shape)
r = computeActivation([aha, sc(T + HOUR, "mass-e-conversione", 70), sc(T + 2 * HOUR, "le-basi-della-chat", 70)], cfg, stubStrings);
ok(r.activated === true, "categorie come stringhe → attivo (normalizzazione robusta)");

console.log(`\nactivation-core: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
