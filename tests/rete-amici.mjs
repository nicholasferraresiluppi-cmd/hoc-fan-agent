// Unit test — rete amici (funzioni pure). Esegui: node tests/rete-amici.mjs
import assert from "node:assert/strict";
import { normalizeLink, pairsToMeasure, weekOf, weekList, beforeAfter, shapeResults, WEEKS } from "../src/lib/rete-amici-core.js";

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const throws = (f, re, m) => { assert.throws(f, re, m); n++; };

const TODAY = "2026-10-20"; // martedì

// normalizeLink
eq(normalizeLink({ host_id: "1", target_id: 2 }, TODAY), { host_id: 1, target_id: 2, since: null, note: "" });
throws(() => normalizeLink({ host_id: 1, target_id: 1 }, TODAY), /sé stessa/);
throws(() => normalizeLink({ host_id: 0, target_id: 1 }, TODAY), /Indica/);
throws(() => normalizeLink({ host_id: 1, target_id: 2, since: "2026-10-21" }, TODAY), /futuro/);
throws(() => normalizeLink({ host_id: 1, target_id: 2, since: "20/10" }, TODAY), /non valida/);

// settimane ISO
eq(weekOf("2026-10-20"), "2026-10-19");
eq(weekOf("2026-10-19"), "2026-10-19");
eq(weekOf("2026-10-25"), "2026-10-19"); // domenica
const wl = weekList(TODAY);
eq(wl.length, WEEKS);
eq(wl[wl.length - 1], "2026-10-19");

// pairsToMeasure: dedup, scarta i chiusi da troppo tempo, tiene i chiusi recenti (servono al prima/dopo)
const pairs = pairsToMeasure([
  { host_id: 1, target_id: 2 },
  { host_id: 1, target_id: 2, until: "2026-01-01" },
  { host_id: 3, target_id: 2, until: "2026-10-01" },
  { host_id: 4, target_id: 2, until: "2025-01-01" },
], TODAY);
eq(pairs, [{ host: 1, target: 2 }, { host: 3, target: 2 }]);

// beforeAfter: settimana dell'aggiunta e settimana in corso escluse; servono ≥2 settimane intere per lato
const series = wl.map((w, i) => ({ week: w, fans: i < 6 ? 10 : 30 }));
const since = wl[6]; // aggiunto il lunedì della 7ª settimana
const ba = beforeAfter(series, since, TODAY);
eq(ba.before, 10);
eq(ba.after, 30);
eq(ba.weeksBefore, 6);
eq(ba.weeksAfter, WEEKS - 7 - 1);
eq(beforeAfter(series, null, TODAY), null, "senza data niente prima/dopo");
const tooRecent = beforeAfter(series, wl[WEEKS - 2], TODAY);
eq(tooRecent.after, null, "aggiunto la settimana scorsa: troppo presto per dire");

// shapeResults
const links = [{ id: "a", host_id: 10, target_id: 20, since: null, until: null, at: "2026-10-20T00:00:00Z" }];
const rows = [
  { target: 20, week: wl[12], kind: "friends", host: null, fans: 6, ripe_fans: 0, ripe_net30: 0, ripe_payers: 0 },
  { target: 20, week: wl[0], kind: "friends", host: null, fans: 40, ripe_fans: 40, ripe_net30: 200, ripe_payers: 4 },
  { target: 20, week: wl[0], kind: "link", host: null, fans: 30, ripe_fans: 30, ripe_net30: 900, ripe_payers: 9 },
  { target: 20, week: wl[12], kind: "direct", host: null, fans: 4, ripe_fans: 0, ripe_net30: 0, ripe_payers: 0 },
  { target: 20, week: wl[0], kind: "host", host: 10, fans: 40, ripe_fans: 40, ripe_net30: 200, ripe_payers: 4 },
  { target: 20, week: wl[12], kind: "host", host: 10, fans: 6, ripe_fans: 0, ripe_net30: 0, ripe_payers: 0 },
];
const [t] = shapeResults(rows, links, { 10: "Marty", 20: "Anastasia" }, TODAY);
eq(t.name, "Anastasia");
eq(t.total, 80);
eq(t.share, 46 / 80);
eq(t.total4, 10);
eq(t.share4, 0.6);
eq(t.byKind.friends.avgNet30, 5);
eq(t.byKind.link.avgNet30, 30);
eq(t.byKind.direct.avgNet30, null, "sotto 20 fan maturi niente media");
eq(t.hosts.length, 1);
eq(t.hosts[0].name, "Marty");
eq(t.hosts[0].fans, 46);
eq(t.hosts[0].last4, 6);
eq(t.weekly[0].friends, 40);
eq(t.weekly[12].direct, 4);

// pagina con collegamento ma zero iscritti: c'è lo stesso, a zero (non sparisce)
const [empty] = shapeResults([], [{ id: "b", host_id: 1, target_id: 2 }], {}, TODAY);
eq(empty.total, 0);
eq(empty.share, null);
eq(empty.hosts[0].fans, 0);
ok(empty.name.includes("2"));

console.log(`rete-amici: ${n} asserzioni ok`);
