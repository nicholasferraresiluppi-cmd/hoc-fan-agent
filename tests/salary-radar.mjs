// Unit test — Radar salary (salary-radar-core). Esegui: node tests/salary-radar.mjs
import assert from "node:assert/strict";
import {
  parseHandles, normHandle, buildOurModels, buildManualModels, applyRead, weekGrowth, parseCandidates,
  salaryHints, pct, addDays, slug,
} from "../src/lib/salary-radar-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// --- account incollati ---
eq(parseHandles("https://www.instagram.com/sono.anna06/?hl=it\n@Pinotti_Alice, aliiciottaa"), ["sono.anna06", "pinotti_alice", "aliiciottaa"], "link, @ e nomi nudi");
eq(parseHandles("https://www.instagram.com/reel/ABC123/ https://instagram.com/stories/quellaterribile/123"), ["quellaterribile"], "reel scartato, storia → account");
eq(parseHandles("ciao a"), ["ciao"], "una lettera sola non è un account");
eq(parseHandles("x x x"), [], "doppioni e troppo corti");
eq(normHandle("@Alice.P/"), "alice.p", "normalizza");
eq(slug("Anna Belti è qui"), "anna-belti-e-qui", "slug senza accenti");
eq(pct(110, 100), 10, "percento");
eq(pct(5, 0), null, "base zero → null");
eq(addDays("2026-11-01", -1), "2026-10-31", "giorni");

// --- le nostre dal magazzino ---
const rows = [];
const day = (i) => addDays("2026-11-15", -i);
for (let i = 0; i < 20; i++) {
  // account vivo: 1 reel al giorno, 1000 view, follower in crescita di 10 al giorno
  rows.push({ t: "Alice Pinotti", u: "aliiciottaa", d: day(i), c: "Alice Pinotti - IT / Allie ENG", fol: 5000 - i * 10, reels: 1, views: i < 7 ? 1000 : 500, clicks: 0, subs: i < 7 ? 1 : 0 });
  // account fermo: niente reel nell'ultima settimana
  rows.push({ t: "Alice Pinotti", u: "pinoali08", d: day(i), c: "Alice Pinotti - IT", fol: 1200, reels: i < 7 ? 0 : 1, views: 30, clicks: 0, subs: 0 });
}
// account sparito: ultimo giorno 5 giorni fa
for (let i = 5; i < 20; i++) rows.push({ t: "Alice Pinotti", u: "atenagentilee", d: day(i), c: "Alice Pinotti - IT", fol: 52000, reels: 1, views: 200, clicks: 0, subs: 0 });
// account nuovo: compare da 3 giorni
for (let i = 0; i < 3; i++) rows.push({ t: "Alice Pinotti", u: "allie.bunni", d: day(i), c: "Allie ENG", fol: 50 + i, reels: 2, views: 100, clicks: 0, subs: 0 });
// modella non scelta: ignorata
rows.push({ t: "Sara Sfamurri", u: "sarasfamurri", d: day(0), c: "Sara - IT", fol: 1, reels: 1, views: 1 });
// riga sporca
rows.push({ t: "", u: "x", d: "boh" });

const ours = buildOurModels(rows, { talents: ["Alice Pinotti", "Anna Belti"] });
eq(ours.day, "2026-11-15", "ultimo giorno del magazzino");
eq(ours.models.map((m) => m.name), ["Alice Pinotti", "Anna Belti"], "una scheda per modella scelta, anche vuota");
const alice = ours.models[0];
const acc = Object.fromEntries(alice.accounts.map((a) => [a.h, a]));
eq(Object.keys(acc).sort(), ["aliiciottaa", "allie.bunni", "atenagentilee", "pinoali08"], "solo gli account della modella");
eq(acc.aliiciottaa.status, "attivo", "vivo");
eq(acc.pinoali08.status, "fermo", "nessun reel in 7 giorni = fermo");
eq(acc.atenagentilee.status, "sparito", "non compare da 5 giorni = sparito");
ok(acc["allie.bunni"].isNew, "comparso da 3 giorni = nuovo");
ok(!acc.aliiciottaa.isNew, "presente da 20 giorni = non nuovo");
eq(acc.aliiciottaa.views7, 7000, "view degli ultimi 7 giorni");
eq(acc.aliiciottaa.viewsPrev, 3500, "view della settimana prima");
eq(acc.aliiciottaa.viewsPct, 100, "raddoppiate");
eq(acc.pinoali08.viewsPct, null, "base sotto le 1.000 view: niente percento");
eq(acc.aliiciottaa.reels7, 7, "reel della settimana");
eq(acc.aliiciottaa.subs7, 7, "iscritti della settimana");
eq(acc.aliiciottaa.fol, 5000, "follower dell'ultimo giorno");
eq(acc.aliiciottaa.folDelta, 70, "follower guadagnati in 7 giorni");
eq(acc.atenagentilee.folDelta, null, "uno sparito non dà variazione di follower");
eq(acc.aliiciottaa.creators, ["Alice Pinotti - IT", "Allie ENG"], "creator collegate");
eq(acc.aliiciottaa.series.length, 30, "serie di 30 giorni");
eq(alice.counts, { total: 4, attivo: 2, fermo: 1, sparito: 1, nuovi: 1 }, "conteggi");
eq(alice.fol, 5000 + 1200 + 50, "follower totali senza gli sparito");
eq(alice.views7, 7000 + 210 + 300 + 400, "view della settimana: anche quelle dello sparito nei giorni in cui c era (2 × 200)");
ok(alice.series.length === 30 && alice.series[29][1] === 1000 + 30 + 100, "serie della modella = somma degli account");
eq(ours.models[1].counts.total, 0, "Anna senza righe: scheda vuota");
eq(buildOurModels([], { talents: ["X"] }).models[0].day, null, "magazzino vuoto");

// --- aggiunti a mano (Apify) ---
let a = { h: "rival.one", modelId: "m:1", hist: [] };
a = applyRead(a, { h: "rival.one", fol: 1000, medv: 5000, er: 3, url: "https://x.link/a" }, { week: "2026-W45", now: 1 });
a = applyRead(a, { h: "rival.one", fol: 1100, medv: 6000, er: 3, url: "https://x.link/a" }, { week: "2026-W46", now: 2 });
eq(a.hist.length, 2, "una riga per settimana");
eq(weekGrowth(a.hist), { delta: 100, pct: 10 }, "crescita settimanale");
a = applyRead(a, { h: "rival.one", fol: 1150 }, { week: "2026-W46", now: 3 });
eq(a.hist.length, 2, "stessa settimana: si sovrascrive");
let miss = applyRead(a, null, { now: 4 });
ok(!miss.gone, "un giro mancato non basta");
miss = applyRead(miss, null, { now: 5 });
ok(miss.gone, "due giri mancati = sparito");

const store = {
  models: { "m:1": { id: "m:1", name: "Rivale", side: "altra", agency: "BN Elite" }, "m:2": { id: "m:2", name: "Marta Bellini", side: "nostra" } },
  accounts: { "rival.one": { ...a, modelId: "m:1" }, "rival.two": { h: "rival.two", modelId: "m:1", hist: [] }, "marta.b": { h: "marta.b", modelId: "m:2", gone: true, checkedAt: 1, hist: [] } },
};
const man = buildManualModels(store);
const riv = man.find((m) => m.id === "m:1");
eq(riv.side, "altra", "lato");
eq(riv.counts, { total: 2, attivo: 1, sparito: 0, da_leggere: 1 }, "conteggi aggiunti a mano");
eq(riv.fol, 1150, "follower degli attivi");
eq(riv.accounts.find((x) => x.h === "rival.two").status, "da_leggere", "mai letto");
eq(man.find((m) => m.id === "m:2").counts.sparito, 1, "nostra fuori dal magazzino, sparita");
eq(man.find((m) => m.id === "m:2").fol, null, "nessun account letto: follower sconosciuti, non zero");

// --- ricerca ---
const cands = parseCandidates([
  { username: "Nuova.Salary", fullName: "Nuova", followersCount: 900, biography: "18 🇮🇹 prima storia in evidenza", private: false },
  { username: "nuova.salary", followersCount: 1 },
  { username: "aliiciottaa", followersCount: 12000 },
  { username: "x" },
], new Set(["aliiciottaa"]));
eq(cands.map((c) => c.h), ["nuova.salary", "aliiciottaa"], "doppioni e nomi non validi via, i già presenti in fondo");
ok(cands[1].known, "già nel radar marcato");
ok(salaryHints(cands[0].bio) >= 3, "indizi salary nella bio");
eq(salaryHints("Fotografa di matrimoni"), 0, "nessun indizio");

console.log(`salary-radar: ${n} asserzioni ok`);
