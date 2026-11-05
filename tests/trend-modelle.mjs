// Unit test — Trend modelle, livello 1 (trend-modelle-core). Esegui: node tests/trend-modelle.mjs
import assert from "node:assert/strict";
import {
  normalizeRow, baselines, findHits, groupStatus, autoGroups, parseFormatName, snapshotHit, formatView,
  sortFormats, normalizeDesc, pickToDescribe, levelHint, monthKey, HIT_VIEWS, MIN_BASE,
} from "../src/lib/trend-modelle-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const D = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const at = (daysAgo) => new Date(NOW - daysAgo * D).toISOString().replace("T", " ").replace("Z", "+00:00");

const row = (code, owner, views, daysAgo, extra = {}) => ({
  src: "tf", owner_id: owner, username: owner, code, taken_at: at(daysAgo), views, likes: 1, comments: 1,
  caption: "x", audio_id: null, audio_title: null, template_id: null, coauthors: [], cover: `https://c/${code}.jpg`, pinned: false, ...extra,
});
// un profilo con il solito a 10 mila (6 reel vecchi) e un reel nuovo con `views`
const profile = (owner, views, { daysAgo = 3, src = "tf", ...extra } = {}) => [
  ...[10, 12, 15, 20, 25, 30].map((d, i) => row(`${owner}-old${i}`, owner, 10_000, d, { src })),
  row(`${owner}-new`, owner, views, daysAgo, { src, ...extra }),
].map(normalizeRow);

// --- righe del warehouse
const r0 = normalizeRow(row("ABC", "1", 5000, 2, { username: "Sara.X", coauthors: ["sara.x", "@marco"] }));
eq(r0.lane, "int", "tf = da fuori");
eq(r0.handle, "sara.x", "nome in minuscolo");
eq(r0.coauthors, ["marco"], "la @ si toglie e il profilo stesso non è un coautore");
eq(r0.postedAt, NOW - 2 * D, "data del warehouse letta (formato «2026-11-01 12:00:00+00:00»)");
eq(normalizeRow(row("X", "1", 1, 1, { src: "ig" })).lane, "ours", "ig = le nostre");
eq(normalizeRow({ ...row("X", "1", 1, 1), src: "zz" }), null, "sorgente sconosciuta");
eq(normalizeRow({ ...row("X", "1", 1, 1), code: null }), null, "senza codice");
eq(normalizeRow({ ...row("X", "1", 1, 1), taken_at: null }), null, "senza data");
eq(normalizeRow(row("X", "1", 1, 1, { coauthors: "a,b" })).coauthors, ["a", "b"], "coautori anche come testo separato da virgole");
eq(normalizeRow(row("X", "1", null, 1)).views, null, "visualizzazioni mancanti = null, non 0");
eq(normalizeRow({ ...row("X", "1", 1, 1), taken_at: Math.floor((NOW - D) / 1000) }).postedAt, NOW - D, "data anche in secondi");
eq(normalizeRow({ ...row("X", "1", 1, 1), taken_at: "1.7923377E9" }).postedAt, 1792337700000, "data come la restituisce l'API REST di BigQuery");

// --- il solito
const b = baselines(profile("p1", 50_000), NOW);
eq(b.get("int:p1").median, 10_000, "il solito = mediana dei reel di 7-60 giorni");
eq(b.get("int:p1").n, 6, "il reel nuovo non entra nel solito");
const few = [10, 12, 15, 20].map((d, i) => normalizeRow(row(`f${i}`, "few", 1000, d)));
ok(!baselines(few, NOW).has("int:few"), `meno di ${MIN_BASE} reel: niente solito`);
const pinned = [...profile("p2", 1), normalizeRow(row("pin", "p2", 9_999_999, 20, { pinned: true }))];
eq(baselines(pinned, NOW).get("int:p2").median, 10_000, "il fissato non entra nel solito");
const old = [...profile("p3", 1), normalizeRow(row("vecchio", "p3", 9_999_999, 90))];
eq(baselines(old, NOW).get("int:p3").n, 6, "oltre 60 giorni non entra");

// --- gli esplosi
const hits1 = findHits(profile("p1", 50_000), NOW);
eq(hits1.map((h) => h.id), ["p1-new"], "5 volte il solito = esploso");
eq(hits1[0].times, 5, "multiplo");
eq(hits1[0].young, false, "3 giorni: non più giovane");
eq(findHits(profile("p1", 25_000), NOW).length, 0, "2,5 volte: non esploso");
eq(findHits(profile("p1", 50_000, { daysAgo: 1 }), NOW)[0].young, true, "meno di 72 h: giovane");
eq(findHits(profile("p1", 50_000, { daysAgo: 25 }), NOW).length, 0, "oltre 21 giorni: non è più notizia");
const small = [...[10, 12, 15, 20, 25].map((d, i) => normalizeRow(row(`s${i}`, "small", 500, d))), normalizeRow(row("s-new", "small", 30_000, 2))];
eq(findHits(small, NOW).length, 0, "profilo piccolo (solito sotto mille): escluso, 60 volte può essere un caso");
const low = [...[10, 12, 15, 20, 25].map((d, i) => normalizeRow(row(`l${i}`, "low", 2000, d))), normalizeRow(row("l-new", "low", 15_000, 2))];
eq(findHits(low, NOW).length, 0, `7,5 volte ma sotto ${HIT_VIEWS}: escluso`);
const collab = findHits(profile("p4", 80_000, { coauthors: ["grosso"] }), NOW);
eq(collab[0].collab, true, "collab segnata, non tolta");
const withBase = [normalizeRow({ ...row("wb", "z", 40_000, 2), base: 8000 })];
eq(findHits(withBase, NOW)[0].times, 5, "il solito può arrivare già calcolato dal warehouse");
ok(findHits([normalizeRow({ ...row("pinnew", "z", 90_000, 2), base: 8000, pinned: true })], NOW).length === 0, "un fissato non è un esploso");

// --- stato di un gruppo (il caso «vai così conciata da lui?»)
const h = (id, lane, owner, daysAgo, extra = {}) => ({ id, lane, owner, handle: owner, postedAt: NOW - daysAgo * D, collab: false, ...extra });
const conciata = [h("a", "int", "queen_calii", 41), h("b", "int", "missbonnet00", 33), h("c", "int", "bellpepper__", 28), h("d", "ours", "ale_sparagno", 11)];
const st = groupStatus(conciata);
eq(st.level, "trend", "3 profili stranieri = trend");
eq(st.intAccounts, 3, "conteggio stranieri");
eq(st.oursAccounts, 1, "già fatto da una nostra");
eq(st.leadDays, 30, "anticipo misurato: dal primo straniero alla prima nostra");
eq(groupStatus(conciata.slice(0, 2)).level, "watch", "2 stranieri = in osservazione");
eq(groupStatus(conciata.slice(0, 1)).level, "single", "1 = un caso");
eq(groupStatus([h("a", "int", "x", 3), h("b", "int", "x", 2), h("c", "int", "x", 1)]).intAccounts, 1, "lo stesso profilo tre volte conta una volta");
const sorelle = [h("a", "ours", "cutesyella", 3), h("b", "ours", "yourbaeby_ella", 2), h("c", "ours", "ella3", 1)];
eq(groupStatus(sorelle).level, "single", "le nostre (anche tre sorelle) non fanno un trend");
eq(groupStatus(sorelle).leadDays, null, "senza stranieri niente anticipo");
const gtr = [h("g", "int", "giulia", 13, { collab: true }), h("g2", "int", "arabgt", 13, { collab: true })];
eq(groupStatus(gtr).intAccounts, 0, "il caso GTR: le collab non contano");
eq(groupStatus(gtr).collabOnly, true, "solo collab");
ok(/collab/.test(levelHint(groupStatus(gtr))), "il motivo si dice in parole");
ok(/3 profili/.test(levelHint(st)), "trend in parole");

// --- gruppi automatici (audio, modello)
const auto = autoGroups([
  { ...h("1", "int", "a", 2), audioId: "S1", audioTitle: "Canzone" },
  { ...h("2", "int", "b", 3), audioId: "S1", audioTitle: "Canzone" },
  { ...h("3", "ours", "c", 1), audioId: "S1", audioTitle: "Canzone" },
  { ...h("4", "int", "d", 3), audioId: "S2" },
  { ...h("5", "int", "e", 3), templateId: "T1" },
  { ...h("6", "int", "f", 2), templateId: "T1" },
  { ...h("7", "int", "g", 2), templateId: "T1", collab: true },
]);
eq(auto.map((g) => g.key), ["audio:S1", "tmpl:T1"], "solo i gruppi con almeno 2 stranieri");
eq(auto[0].ids, ["1", "2", "3"], "le nostre restano nel gruppo");
eq(auto[0].status.oursAccounts, 1, "e si dice che l'abbiamo già fatto");
eq(auto[1].ids, ["5", "6"], "la collab non entra nel gruppo automatico");

// --- format a mano
eq(parseFormatName("  Vai così   conciata "), "Vai così conciata", "nome pulito");
eq(parseFormatName("ab"), null, "troppo corto");
eq(parseFormatName("x".repeat(81)), null, "troppo lungo");
const hit = { ...h("a", "int", "q", 3), views: 9, base: 1, times: 9, cover: "c", caption: "k", extra: "no" };
eq(Object.keys(snapshotHit(hit)).includes("extra"), false, "la copia tiene solo i campi che servono");
const fmt = { id: "f1", name: "Conciata", createdAt: 1, items: { a: snapshotHit({ ...hit, views: 9 }) } };
const fv = formatView(fmt, new Map([["a", { ...hit, views: 99 }]]));
eq(fv.items[0].views, 99, "i numeri si aggiornano dall'archivio quando il reel c'è ancora");
eq(formatView(fmt, new Map()).items[0].views, 9, "altrimenti resta la copia");
const sorted = sortFormats([
  { createdAt: 3, status: { level: "single", firstInt: 5 } },
  { createdAt: 1, status: { level: "trend", firstInt: 1 } },
  { createdAt: 2, status: { level: "watch", firstInt: 9 } },
]).map((f) => f.status.level);
eq(sorted, ["trend", "watch", "single"], "prima i trend");

// --- descrizione AI
eq(normalizeDesc({ formato: " Reveal ", scritta: "", situazione: "corridoio", svolta: null, adatto: "boh", perche: "x" }),
  { formato: "Reveal", scritta: null, situazione: "corridoio", svolta: null, adatto: "forse", perche: "x" }, "risposta ripulita, adatto sconosciuto = forse");
eq(normalizeDesc({ scritta: "x" }), null, "senza formato non vale");
eq(normalizeDesc(null), null, "risposta vuota");
const toDo = pickToDescribe([
  { id: "o", lane: "ours", times: 9, cover: "c" },
  { id: "i1", lane: "int", times: 3, cover: "c" },
  { id: "i2", lane: "int", times: 8, cover: "c" },
  { id: "nc", lane: "int", times: 50, cover: null },
  { id: "done", lane: "int", times: 40, cover: "c" },
], new Set(["done"]), 3).map((x) => x.id);
eq(toDo, ["i2", "i1", "o"], "prima gli stranieri più forti, mai senza copertina né già descritti");
eq(monthKey(NOW), "2026-11", "mese della spesa");

console.log(`trend-modelle: ${n} verifiche ok`);
