// Test del routing gap → lezione (nessuna dipendenza runtime: importa la lib pura).
// node tests/lesson-cards.test.mjs
import assert from "node:assert";
import { listLessonCards, getLessonCard, recommendLessonsForGap, gapLabel } from "../src/lib/lesson-cards.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// --- indice ---
const cards = listLessonCards();
ok(cards.length >= 2, "almeno 2 carte");
ok(cards.every((c) => c.id && c.title && Array.isArray(c.trains)), "ogni carta ha id/title/trains");
ok(cards.find((c) => c.id === "ppv-gradini-elisa"), "carta gradini presente");
ok(cards.find((c) => c.id === "silenzio-rehook-elisa"), "carta re-hook presente");

// --- i tag trains hanno etichette risolte, non key grezze ---
const ppvIndex = cards.find((c) => c.id === "ppv-gradini-elisa");
ok(ppvIndex.trains.some((t) => t.key === "avg_ppv_price" && t.label === "Prezzo medio PPV"), "tag prezzo etichettato");

// --- routing gap → lezione ---
const forPrice = recommendLessonsForGap("avg_ppv_price");
ok(forPrice.length === 1 && forPrice[0].id === "ppv-gradini-elisa", "avg_ppv_price → gradini");
ok(forPrice[0].primary === true, "avg_ppv_price è obiettivo primario dei gradini");

const forMsg = recommendLessonsForGap("msgs_per_h");
ok(forMsg.length === 1 && forMsg[0].id === "silenzio-rehook-elisa", "msgs_per_h → re-hook");

// ppv_per_h è tra i gap dei gradini ma NON primario → presente, primary=false
const forCad = recommendLessonsForGap("ppv_per_h");
ok(forCad.some((l) => l.id === "ppv-gradini-elisa" && l.primary === false), "ppv_per_h → gradini (non primario)");

// --- buco onesto: slow_reply_rate non è coperto da nessuna lezione, oggi ---
ok(recommendLessonsForGap("slow_reply_rate").length === 0, "slow_reply_rate: nessuna lezione (buco dichiarato)");
// --- robustezza input ---
ok(recommendLessonsForGap(null).length === 0, "gap null → []");
ok(recommendLessonsForGap("gap_inesistente").length === 0, "gap ignoto → []");

// --- ordinamento: primario prima ---
const forQ = recommendLessonsForGap("question_rate"); // gradini lo ha come terzo tag (non primario)
ok(forQ.every((l) => typeof l.primary === "boolean"), "flag primary presente");

// --- carte complete: i trains_gaps puntano a gap con etichetta nota ---
for (const id of ["ppv-gradini-elisa", "silenzio-rehook-elisa"]) {
  const full = getLessonCard(id);
  ok(Array.isArray(full.trains_gaps) && full.trains_gaps.length > 0, `${id} ha trains_gaps`);
  ok(full.trains_gaps.every((k) => gapLabel(k) !== k), `${id}: ogni gap ha un'etichetta risolta`);
}

console.log(`lesson-cards: ${n} asserzioni OK`);
