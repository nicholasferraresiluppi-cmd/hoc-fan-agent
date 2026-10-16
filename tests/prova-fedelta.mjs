// Unit test — prova-fedelta-core + prova-fedelta-sql. Esegui: node tests/prova-fedelta.mjs
import assert from "node:assert/strict";
import { hash32, armOf, isFlagged, todoFor, phaseOf, shapeFans, measure, twoPropZ } from "../src/lib/prova-fedelta-core.js";
import { provaFansSql } from "../src/lib/prova-fedelta-sql.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const DAY = 86400e3;
const NOW = Date.parse("2026-11-01T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

// divisione a caso: stabile e circa metà/metà
eq(hash32("a"), hash32("a"), "hash stabile");
eq(armOf(123, "s"), armOf(123, "s"), "stesso fan, stesso gruppo");
const arms = Array.from({ length: 4000 }, (_, i) => armOf(500000000 + i * 7, "pf-2026-10-19"));
const share = arms.filter((a) => a === "prova").length / arms.length;
ok(share > 0.46 && share < 0.54, `circa metà nel gruppo prova (${share})`);
ok(armOf(1, "salt-a") !== armOf(1, "salt-b") || armOf(2, "salt-a") !== armOf(2, "salt-b") || armOf(3, "salt-a") !== armOf(3, "salt-b"), "il sale cambia la divisione");

// segnalato
ok(isFlagged({ sp7: 120, bd7: 2 }), "100$ + 2 giorni = segnalato");
ok(!isFlagged({ sp7: 300, bd7: 1 }), "tutto in un giorno = non segnalato");
ok(!isFlagged({ sp7: 99, bd7: 3 }), "sotto 100$ = non segnalato");

// cosa fare oggi
const base = { t0: iso(NOW - 10 * DAY), fan_last: iso(NOW - 20 * DAY), our_last: iso(NOW - 19 * DAY), our_free_last: iso(NOW - 19 * DAY), buys24: 0, ppv24: 0 };
eq(todoFor(base, NOW).map((t) => t.key), ["personale"], "giorno 10, nessun messaggio personale da 19 gg → personale");
eq(todoFor({ ...base, our_free_last: iso(NOW - 1 * DAY) }, NOW).map((t) => t.key), [], "personale mandato ieri → niente");
eq(todoFor({ ...base, fan_last: iso(NOW - 40 * DAY), our_free_last: null }, NOW).map((t) => t.key), [], "fan sparito da 40 gg → niente (lo prende la retention)");
eq(todoFor({ ...base, fan_last: iso(NOW - 3600e3), our_last: iso(NOW - 2 * 3600e3) }, NOW)[0].key, "risposta", "ha scritto per ultimo → risposta prima di tutto");
eq(todoFor({ ...base, t0: iso(NOW - 0.5 * DAY), fan_last: iso(NOW - 3 * 3600e3), our_last: iso(NOW - 3600e3), our_free_last: iso(NOW - 3600e3) }, NOW).map((t) => t.key), ["caldo"], "appena arrivato → scena e appuntamento");
eq(todoFor({ ...base, t0: iso(NOW - 0.5 * DAY), fan_last: iso(NOW - 3 * 3600e3), our_last: iso(NOW - 3600e3), buys24: 4 }, NOW).map((t) => t.key), ["basta-oggi"], "già comprato tanto oggi → stop, non caldo");
ok(todoFor({ ...base, t0: iso(NOW - 5 * DAY) }, NOW).every((t) => t.key !== "personale"), "prima del giorno 7 niente messaggio personale programmato");

// fasi
const cfg = { start: "2026-10-19T00:00:00.000Z", weeks: 6, salt: "pf-2026-10-19" };
eq(phaseOf(null).key, "non-avviata", "senza impostazioni");
eq(phaseOf(cfg, Date.parse("2026-10-18T10:00:00Z")).key, "in-partenza", "prima dell'avvio");
const p1 = phaseOf(cfg, Date.parse("2026-10-20T10:00:00Z"));
eq([p1.key, p1.day, p1.days], ["raccolta", 2, 42], "secondo giorno di raccolta");
eq(phaseOf(cfg, Date.parse("2026-12-15T10:00:00Z")).key, "seguito", "dopo 6 settimane: seguito");
eq(phaseOf(cfg, Date.parse("2027-03-01T10:00:00Z")).key, "conclusa", "dopo 6 settimane + 60 gg: conclusa");
eq(phaseOf({ ...cfg, stopped_at: 1 }, NOW).key, "fermata", "fermata da un admin");

// forma: solo fan arrivati nella finestra di raccolta
const rows = [
  { user_id: 1, t0: "2026-10-18T23:00:00Z", fan48: 20 },
  { user_id: 2, t0: "2026-10-20T10:00:00Z", fan48: 20, sp7: "150", bd7: 2, sub_on: true, expired: false },
  { user_id: 3, t0: "2026-12-05T10:00:00Z", fan48: 20 },
];
const fans = shapeFans(rows, cfg, NOW);
eq(fans.map((f) => f.userId), ["2"], "fuori finestra esclusi");
ok(fans[0].flagged && fans[0].sub === "attivo" && ["prova", "controllo"].includes(fans[0].arm), "campi del fan");
ok(fans[0].arm === "prova" ? Array.isArray(fans[0].todo) : fans[0].todo.length === 0, "il controllo non riceve azioni");

// misura
const mk = (arm, i, o) => ({ arm, userId: `${arm}${i}`, flagged: false, ageDays: 70, sp7: 50, buyDaysAfterD1: 0, sp8_30: 0, sp8_60: 0, sp60: 50, ...o });
const M = measure([
  ...Array.from({ length: 100 }, (_, i) => mk("prova", i, i < 30 ? { sp8_30: 10, sp8_60: 20, buyDaysAfterD1: 2 } : {})),
  ...Array.from({ length: 100 }, (_, i) => mk("controllo", i, i < 10 ? { sp8_30: 10, sp8_60: 20, buyDaysAfterD1: 1 } : {})),
]);
eq([M.prova.fans, M.prova.still8_60, M.controllo.still8_60], [100, 0.3, 0.1], "quote per gruppo");
ok(M.z.still8_60 > 3, `30% contro 10% su 100+100 è difficilmente il caso (z=${M.z.still8_60.toFixed(2)})`);
ok(Math.abs(twoPropZ(0.13, 50, 0.15, 50)) < 2, "13% contro 15% su 50+50 è alla portata del caso");
eq(measure([mk("prova", 1, { ageDays: 10 })]).prova.n30, 0, "fan di 10 giorni non entrano nella quota a 30");
eq(twoPropZ(null, 0, 0.1, 10), null, "senza dati niente z");

// SQL
const T = { wsChat: "p.hoc.ws_chat", attributed: "p.onlyfans.attributed_transactions", subs: "p.onlyfans.subscriptions_intervals" };
const sql = provaFansSql(T, 1000000358, "2026-10-19T00:00:00Z");
ok(sql.includes("creator_id = 1000000358") && sql.includes("organization_id = '5598597c"), "SQL filtrato su creator e organizzazione HOC");
ok(sql.includes("commit_timestamp >= TIMESTAMP_SUB(TIMESTAMP('2026-10-19T00:00:00.000Z')"), "SQL pota le partizioni di ws_chat");
assert.throws(() => provaFansSql(T, "1; DROP", "2026-10-19"), /creator_id/); n++;
assert.throws(() => provaFansSql(T, 1, "non-una-data"), /data/); n++;

console.log(`prova-fedelta: ${n} asserzioni ok`);
