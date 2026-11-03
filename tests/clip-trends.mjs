// Unit test — Trend del clipping (clip-trends-core). Esegui: node tests/clip-trends.mjs
import assert from "node:assert/strict";
import {
  parseQuery, queryId, igQueryFromUrl, normalizeTrendRow, summarize, heat, buildTrends, prevSnapshot,
  trendBudget, trendsDue, HIT_VIEWS, DEFAULT_QUERIES, candidateAccounts, SEARCH_COUNTRY, COUNTRY_ADDON,
} from "../src/lib/clip-trends-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const D = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * D).toISOString();

// --- testi delle ricerche
eq(parseQuery("  Me  When   HIM "), "me when him", "spazi e maiuscole");
eq(parseQuery("#boyfriendmeme"), "boyfriendmeme", "il cancelletto si toglie");
eq(parseQuery("ab"), null, "troppo corta");
eq(parseQuery("x".repeat(61)), null, "troppo lunga");
eq(queryId("ita", "io quando lui"), "ita:io quando lui", "id con paese");
eq(queryId("xx", "abc"), "eng:abc", "paese sconosciuto = inglese");
eq(igQueryFromUrl("https://www.instagram.com/explore/search/keyword/?q=me%20when%20him"), "me when him", "ricerca IG dal link");
eq(igQueryFromUrl("https://www.instagram.com/explore/tags/couplememes/"), "couplememes", "hashtag IG dal link");
eq(igQueryFromUrl(""), null, "link vuoto");
ok(DEFAULT_QUERIES.every((q) => parseQuery(q.text) === q.text), "le ricerche di partenza sono già normalizzate");

// --- righe Apify
const tt = (id, owner, views, daysAgo, { q = "me when him", fans = 2000, shares = 0, music = "m1", slideshow = false } = {}) => ({
  id, text: "x", createTimeISO: iso(daysAgo), webVideoUrl: `https://tiktok.com/@${owner}/video/${id}`, playCount: views, shareCount: shares,
  diggCount: 1, commentCount: 1, collectCount: 1, searchQuery: q, isSlideshow: slideshow,
  authorMeta: { name: owner, fans }, musicMeta: { musicId: music, musicName: "Dirty Diana" }, videoMeta: { duration: 7 },
});
const p1 = normalizeTrendRow(tt("1", "lantorinaa", 9_100_000, 80, { shares: 709_400 }), "tt");
eq([p1.query, p1.fans, p1.soundId, p1.platform], ["me when him", 2000, "tt:m1", "tt"], "riga TikTok");
eq(normalizeTrendRow(tt("2", "a", 1, 1, { slideshow: true }), "tt"), null, "i carousel di foto non contano");
const ig = normalizeTrendRow({ shortCode: "Abc", type: "Video", ownerUsername: "wavybabyily", videoPlayCount: 15_539_064, sharesCount: 826_139,
  timestamp: iso(5), inputUrl: "https://www.instagram.com/explore/search/keyword/?q=me%20when%20him", musicInfo: { audio_id: "99", song_name: "x" } }, "ig");
eq([ig.query, ig.soundId, ig.fans, ig.owner], ["me when him", "ig:99", null, "wavybabyily"], "riga Instagram");
eq(normalizeTrendRow({ error: "no" }, "ig"), null, "riga d'errore");

// --- riassunto: si contano gli ACCOUNT, non i video
const posts = [
  normalizeTrendRow(tt("10", "a", 900_000, 3, { shares: 45_000, fans: 300 }), "tt"),
  normalizeTrendRow(tt("11", "a", 60_000, 4, { shares: 600, fans: 300 }), "tt"),   // stesso account: conta il migliore
  normalizeTrendRow(tt("12", "b", 120_000, 10, { shares: 2_400, fans: 50_000 }), "tt"),
  normalizeTrendRow(tt("13", "c", 8_000, 20, { shares: 80 }), "tt"),
  normalizeTrendRow(tt("14", "d", 5_000_000, 200, { shares: 1 }), "tt"),            // vecchio: fuori dai recenti
];
const sm = summarize(posts, NOW);
eq([sm.found, sm.recent, sm.accounts, sm.hits, sm.smallHits], [5, 4, 3, 2, 1], "conteggi");
eq(sm.recentShare, 80, "4 risultati su 5 recenti");
eq(sm.medianViews, 120_000, "mediana sul migliore di ogni account");
eq(sm.shareRate, Math.round(((45_000 + 600 + 2_400 + 80) / (900_000 + 60_000 + 120_000 + 8_000)) * 1000) / 10, "condivisioni su visualizzazioni (recenti)");
eq(sm.examples.map((e) => e.owner), ["a", "b", "c"], "esempi: un video per account, dal più visto");
ok(!sm.examples.some((e) => "hist" in e || "video" in e), "gli esempi portano solo i campi che servono");
eq(summarize([], NOW).recentShare, null, "niente risultati");
eq(summarize([normalizeTrendRow(tt("20", "z", 500, 1, { shares: 5 }), "tt")], NOW).shareRate, null, "troppe poche visualizzazioni per un tasso");
ok(HIT_VIEWS === 50_000, "soglia «ha preso»");

// --- direzione
eq(heat({ hits: 5 }, null), "nuovo", "senza settimana prima");
eq(heat({ hits: 6 }, { hits: 3 }), "in salita", "salita");
eq(heat({ hits: 3 }, { hits: 3 }), "stabile", "stabile");
eq(heat({ hits: 1 }, { hits: 4 }), "in calo", "calo");
eq(heat({ hits: 0 }, { hits: 0 }), "stabile", "zero e zero");

// --- trend completi
const queries = [
  { id: "eng:me when him", text: "me when him", country: "eng" },
  { id: "eng:boyfriend meme", text: "boyfriend meme", country: "eng" },
  { id: "ita:io quando lui", text: "io quando lui", country: "ita" },
];
const more = [
  normalizeTrendRow(tt("30", "e", 200_000, 6, { q: "boyfriend meme", music: "m1", shares: 1_000 }), "tt"),
  normalizeTrendRow(tt("31", "f", 70_000, 6, { q: "boyfriend meme", music: "m9" }), "tt"),
];
const t1 = buildTrends(queries, [...posts, ...more], {}, NOW);
eq(t1.formats.map((f) => f.id), ["eng:me when him", "eng:boyfriend meme", "ita:io quando lui"], "ordine: più account che ci prendono");
eq(t1.formats[0].heat, null, "primo giro: nessuna direzione");
eq(t1.formats[2].found, 0, "ricerca senza risultati resta in elenco");
eq(t1.sounds.map((s) => s.id), ["tt:m1"], "audio su ≥3 account con almeno un exploit");
eq(t1.sounds[0].countries, ["eng"], "paese dell'audio dalla ricerca");
eq(t1.sounds[0].accounts, 4, "account diversi sull'audio (recenti)");
const snap = prevSnapshot(t1.formats);
eq(snap["eng:me when him"], { hits: 2, accounts: 3, medianViews: 120_000 }, "riassunto per la settimana dopo");
const t2 = buildTrends(queries, posts.slice(2), snap, NOW);
eq(t2.formats.find((f) => f.id === "eng:me when him").heat, "in calo", "settimana dopo: meno account che prendono");
eq(t2.formats.find((f) => f.id === "ita:io quando lui").heat, "stabile", "zero e zero");
eq(buildTrends([{ id: "eng:new", text: "new", country: "eng" }], [], snap, NOW).formats[0].heat, "nuovo", "ricerca aggiunta in settimana");

// --- spesa e cadenza
eq(trendBudget(9), Math.round((9 * (30 * (0.0023 + COUNTRY_ADDON) + 20 * 0.0021) * 1.5 + 0.08) * 100) / 100, "tetto del giro (con TikTok da un paese)");
eq(SEARCH_COUNTRY, { eng: "US", ita: "IT" }, "inglese dagli USA, italiano dall'Italia");

// --- profili da seguire
const ttl = (id, owner, views, daysAgo, q, lang, fans = 3000) => normalizeTrendRow({ ...tt(id, owner, views, daysAgo, { q, fans }), textLanguage: lang }, "tt");
eq(ttl("x", "a", 1, 1, "me when him", "en").lang, "en", "lingua del testo TikTok");
const cposts = [
  ttl("50", "usa1", 300_000, 2, "me when him", "en", 4000),
  ttl("51", "usa1", 90_000, 5, "boyfriend meme", "en", 4000),    // stesso account su due formati
  ttl("52", "usa2", 2_000_000, 3, "me when him", "en", 900_000),
  ttl("53", "spagna", 800_000, 3, "me when him", "es"),            // lingua sbagliata per una ricerca inglese
  ttl("54", "ita1", 120_000, 4, "io quando lui", "it"),
  ttl("55", "piccolo", 20_000, 2, "me when him", "en"),            // sotto la soglia: non si propone
  ttl("56", "vecchio", 5_000_000, 90, "me when him", "en"),        // fuori dagli ultimi 30 giorni
  ttl("57", "giaseguito", 700_000, 2, "me when him", "en"),
  normalizeTrendRow({ shortCode: "Ig1", type: "Video", ownerUsername: "igpage", videoPlayCount: 150_000, timestamp: iso(3),
    inputUrl: "https://www.instagram.com/explore/search/keyword/?q=me%20when%20him" }, "ig"),
];
const cand = candidateAccounts(cposts, queries, ["tt:giaseguito"], NOW);
eq(cand.map((c) => c.id), ["tt:usa1", "tt:usa2", "ig:igpage", "tt:ita1"], "ordine: più video sopra soglia, poi più formati, poi il video migliore");
eq(cand[0].queries, ["me when him", "boyfriend meme"], "le ricerche in cui compare");
eq([cand[0].hits, cand[0].videos, cand[0].fans, cand[0].country], [2, 2, 4000, "eng"], "numeri del profilo");
eq(cand[0].best.views, 300_000, "il suo video migliore");
eq(cand.find((c) => c.id === "tt:ita1").country, "ita", "paese dalla ricerca");
ok(!cand.some((c) => c.id === "tt:spagna"), "scarta chi scrive in un'altra lingua");
ok(!cand.some((c) => c.id === "tt:giaseguito"), "scarta chi è già nel Radar");
ok(!cand.some((c) => ["tt:piccolo", "tt:vecchio"].includes(c.id)), "scarta sotto soglia e vecchi");
eq(candidateAccounts([], queries, [], NOW), [], "niente post, niente profili");
ok(trendsDue(null, NOW), "mai fatto: sì");
ok(!trendsDue({ at: NOW - 2 * D }, NOW), "2 giorni fa: no");
ok(trendsDue({ at: NOW - 7 * D }, NOW), "una settimana fa: sì");

console.log(`clip-trends: ${n} asserzioni ok`);
