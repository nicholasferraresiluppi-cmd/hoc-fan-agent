// node tests/welcome-tracking.mjs
import assert from "node:assert/strict";
import { validateRule, ruleWindows, summarize } from "../src/lib/welcome-tracking-core.js";
import { welcomeTrackingSql } from "../src/lib/welcome-tracking-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── prezzo inserito a mano: validazione
ok(validateRule({ creator_id: 93666613, price: "6,19", from: "2026-10-13" }).rule.price === 6.19, "virgola italiana accettata");
ok(validateRule({ creator_id: 93666613, price: 6.19, from: "2026-10-13" }).rule.to === null, "senza fine = ancora in uso");
ok(!validateRule({ creator_id: 0, price: 6, from: "2026-10-13" }).ok, "pagina obbligatoria");
ok(!validateRule({ creator_id: 1, price: 0.1, from: "2026-10-13" }).ok, "prezzo troppo basso");
ok(!validateRule({ creator_id: 1, price: 6.199, from: "2026-10-13" }).ok, "al massimo due decimali");
ok(!validateRule({ creator_id: 1, price: 6, from: "13/10/2026" }).ok, "data nel formato sbagliato");
ok(!validateRule({ creator_id: 1, price: 6, from: "2026-10-13", to: "2026-10-01" }).ok, "fine prima dell'inizio");
ok(validateRule({ creator_id: 1, price: 6, from: "2026-10-13", tool: "  Infloww   automazioni  " }).rule.tool === "Infloww automazioni", "strumento ripulito");

// ── finestre senza sovrapposizioni
const w = ruleWindows([
  { id: "a", creator_id: 1, price: 8.99, from: "2026-10-01", to: null, created_at: "1" },
  { id: "b", creator_id: 1, price: 6.19, from: "2026-10-13", to: null, created_at: "2" },
  { id: "c", creator_id: 2, price: 5, from: "2026-10-05", to: "2026-10-10", created_at: "3" },
], "2026-10-30");
ok(w.find((x) => x.rule_id === "a").to === "2026-10-12", "il prezzo nuovo chiude quello prima il giorno precedente");
ok(w.find((x) => x.rule_id === "b").to === "2026-10-30", "l'ultimo resta aperto fino alla fine del periodo");
ok(w.find((x) => x.rule_id === "c").to === "2026-10-10", "una fine dichiarata resta");
const same = ruleWindows([
  { id: "x", creator_id: 1, price: 5, from: "2026-10-01", created_at: "1" },
  { id: "y", creator_id: 1, price: 6, from: "2026-10-01", created_at: "2" },
], "2026-10-30");
ok(same.length === 1 && same[0].rule_id === "y", "stessa data d'inizio: vince l'ultimo inserito");
const closed = ruleWindows([
  { id: "p", creator_id: 1, price: 5, from: "2026-10-01", to: "2026-10-05", created_at: "1" },
  { id: "q", creator_id: 1, price: 6, from: "2026-10-20", created_at: "2" },
], "2026-10-30");
ok(closed.find((x) => x.rule_id === "p").to === "2026-10-05", "una fine prima del prezzo dopo non si sposta");

// ── riepilogo: un cambio di prezzo = due righe, prima e dopo
const rows = [
  { creator_id: 1, day: "2026-10-10", price: 8.99, manual: false, subs: 100, unlocks: 2 },
  { creator_id: 1, day: "2026-10-11", price: 8.99, manual: false, subs: 100, unlocks: 3 },
  { creator_id: 1, day: "2026-10-13", price: 6.19, manual: false, subs: 200, unlocks: 10 },
  { creator_id: 1, day: "2026-10-13", price: 25, manual: false, subs: 2, unlocks: 1 }, // PPV a mano mandato subito
  { creator_id: 1, day: "2026-10-12", price: null, manual: false, subs: 40, unlocks: 0 },
  { creator_id: 2, day: "2026-10-10", price: null, manual: false, subs: 80, unlocks: 0 },
  { creator_id: 3, day: "2026-10-29", price: 4.99, manual: true, rule_id: "r9", subs: 50, unlocks: 5 },
];
const s = summarize(rows, { names: { 1: "Giulia", 2: "Alice", 3: "Elisa" }, rules: [{ id: "r9", tool: "Infloww" }], today: "2026-10-31" });
const g = s.rows.filter((r) => r.creator_id === 1);
ok(g.length === 2 && g[0].amount === 8.99 && g[1].amount === 6.19, "due righe in ordine di data: prima e dopo il cambio");
ok(g[0].from === "2026-10-10" && g[0].to === "2026-10-11", "periodo del prezzo vecchio");
ok(g[1].current && !g[0].current, "il prezzo in uso adesso è l'ultimo");
ok(g[1].revenue === 61.9 && Math.abs(g[1].cr - 0.05) < 1e-9, "incasso = prezzo × sblocchi, % sui nuovi iscritti");
ok(!s.rows.some((r) => r.amount === 25) && s.rare[0].subs === 2, "prezzo visto su pochi iscritti = non è il benvenuto, contato a parte");
ok(s.unpaid.length === 1 && s.unpaid[0].name === "Alice", "pagina senza benvenuto a pagamento elencata a parte");
const m = s.rows.find((r) => r.creator_id === 3);
ok(m.origin === "manual" && m.tool === "Infloww", "prezzo a mano: origine e strumento dichiarati");
ok(m.maturing, "iscritti degli ultimi 3 giorni: possono ancora sbloccare");
ok(!g[0].maturing, "periodo vecchio: chiuso");
ok(s.total.subs === 450 && s.total.unlocks === 20, "totali solo sulle righe del benvenuto");
const par = summarize([
  { creator_id: 5, day: "2026-10-01", price: 7.77, manual: false, subs: 50, unlocks: 1 },
  { creator_id: 5, day: "2026-10-30", price: 7.77, manual: false, subs: 50, unlocks: 1 },
  { creator_id: 5, day: "2026-10-01", price: 9.99, manual: false, subs: 50, unlocks: 1 },
  { creator_id: 5, day: "2026-10-29", price: 9.99, manual: false, subs: 50, unlocks: 1 },
]);
ok(par.rows.every((r) => r.current), "due benvenuti in parallelo: in uso tutti e due");
ok(s.daily.find((d) => d.day === "2026-10-13").subs === 200, "serie giornaliera senza i prezzi rari");

// ── query: niente testo dell'utente, prezzi a mano dentro come numeri
const refs = { organicSubs: "p.o.s", chat: "p.o.c", attributed: "p.o.a" };
const sql = welcomeTrackingSql(refs, [1, "2; DROP"], { from: "2026-10-01", to: "2026-10-30" }, [{ rule_id: "r1'--", creator_id: 1, price: 6.19, from: "2026-10-13", to: null }]);
ok(sql.includes("6.19 AS price") && sql.includes("DATE '2026-10-30' AS dto"), "prezzo a mano aperto = fino alla fine del periodo");
ok(!sql.includes("'--") && sql.includes('"r1--"'), "id della regola ripulito");
ok(sql.includes("creator_id IN (1)"), "id non numerici scartati");
ok(welcomeTrackingSql(refs, [1], { from: "2026-10-01", to: "2026-10-30" }).includes("WHERE FALSE"), "senza prezzi a mano: CTE vuota");
assert.throws(() => welcomeTrackingSql(refs, [1], { from: "2026-10-01' OR 1=1", to: "2026-10-30" }), /data non valida/); n++;

console.log(`welcome-tracking: ${n} asserzioni ok`);
