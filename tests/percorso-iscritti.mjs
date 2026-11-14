// Unit test — percorso-iscritti (SQL e forma del risultato, funzioni pure). Esegui: node tests/percorso-iscritti.mjs
//
// Copre le decisioni di DESIGN facili da rompere per sbaglio:
//   - l'abbonamento non è una spesa (solo message/tip/post);
//   - sempre filtrato sull'organizzazione HOC (warehouse multi-agenzia);
//   - tempi e importi solo sui fan «maturi» (altrimenti i mesi recenti escono più veloci del vero);
//   - id non numerici scartati (niente SQL iniettabile dal KV);
//   - la forma: ore e giorni sempre completi (24 / 7), giorno 1 = domenica in posizione 0.
import assert from "node:assert/strict";
import { journeySql, shapeJourney, SPEND_TYPES, HOC_ORG } from "../src/lib/percorso-iscritti-sql.js";

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const T = { subs: "p.onlyfans.subscriptions_intervals", attributed: "p.onlyfans.attributed_transactions" };

// ── SQL ──
const sql = journeySql(T, [111, "222", "1; DROP TABLE x", -5, 3.5]);
ok(sql.includes("creator_id IN (111,222)"), "solo id interi positivi");
ok(!sql.includes("DROP"), "niente testo arbitrario dagli id");
ok(sql.includes(`organization_id = '${HOC_ORG}'`), "filtro organizzazione HOC");
ok(SPEND_TYPES.join() === "message,tip,post", "spesa = message, tip, post");
ok(!/type IN \([^)]*subscription/.test(sql), "abbonamento e rinnovo fuori dalla spesa");
ok(/IF\(ripe1 AND spent, TIMESTAMP_DIFF\(g1s, sub_at/.test(sql), "tempo alla prima spesa solo sui maturi");
ok(/IF\(ripe2 AND back2, TIMESTAMP_DIFF\(g2s, g1e/.test(sql), "pausa solo sui maturi al secondo passo");
ok(/ripe1 AND spent AND TIMESTAMP_ADD\(g1e/.test(sql), "maturo al secondo passo implica maturo al primo");
ok(sql.includes("< 360"), "giro: acquisti a meno di 6 ore");
ok(sql.includes("GROUPING SETS ((creator_id, sub_month), (sub_month), (creator_id), ())"), "righe pagina×mese + totali");
assert.throws(() => journeySql(T, []), /Nessuna pagina/); n++;
assert.throws(() => journeySql(T, ["abc"]), /Nessuna pagina/); n++;

// ── Forma ──
const rows = [
  { j: JSON.stringify({ kind: "main", page: "all", month: "all", subs: 10 }) },
  { j: JSON.stringify({ kind: "main", page: "111", month: "2026-08", subs: 6 }) },
  { j: JSON.stringify({ kind: "main", page: "111", month: "all", subs: 6 }) },
  { j: JSON.stringify({ kind: "main", page: "all", month: "2026-08", subs: 6 }) },
  { j: JSON.stringify({ kind: "main", page: "all", month: "2026-07", subs: 4 }) },
  { j: JSON.stringify({ kind: "hour", page: "all", month: "all", k: "23", subs: 3, ripe1: 3, spent: 1, net30: 9 }) },
  { j: JSON.stringify({ kind: "dow", page: "all", month: "all", k: "1", subs: 2, ripe1: 2, spent: 0, net30: 0 }) },
  { j: JSON.stringify({ kind: "link", page: "111", month: "all", k: "ig", subs: 1, ripe1: 1, spent: 0, net30: 0 }) },
  { j: JSON.stringify({ kind: "link", page: "111", month: "all", k: "tg", subs: 5, ripe1: 5, spent: 2, net30: 30 }) },
];
const s = shapeJourney(rows, [{ creator_id: 111, name: "A" }, { creator_id: 999, name: "Senza dati" }]);
ok(s.months.join() === "2026-07,2026-08", "mesi in ordine, senza «all»");
ok(s.pages.length === 1 && s.pages[0].creator_id === "111", "solo pagine con dati, id come stringa");
ok(s.hour.all.all.length === 24 && s.hour.all.all[0].subs === 0 && s.hour.all.all[23].subs === 3, "24 ore, buchi a zero");
ok(s.dow.all.all.length === 7 && s.dow.all.all[0].subs === 2, "giorno 1 (domenica) in posizione 0");
ok(s.link["111"].all[0].link === "tg", "link ordinati per iscritti");
ok(s.main["111"]["2026-08"].subs === 6, "riga pagina×mese");

console.log(`percorso-iscritti: ${n} asserzioni ok`);
