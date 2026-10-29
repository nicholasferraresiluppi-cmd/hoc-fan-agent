// Unit test — Radar del clipping (clip-radar-core). Esegui: node tests/clip-radar.mjs
import assert from "node:assert/strict";
import {
  parseProfileInput, profileId, normalizeIg, normalizeTt, mergeVideos, profileStats, velocity, scoreVideo,
  topVideos, runBudget, shortNum, ageLabel,
} from "../src/lib/clip-radar-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const H = 3_600_000, D = 24 * H;
const NOW = Date.parse("2026-10-29T12:00:00Z");

// input del publisher
eq(parseProfileInput("https://www.instagram.com/Clip.Page/?hl=it"), { platform: "ig", handle: "clip.page" }, "link IG");
eq(parseProfileInput("https://www.tiktok.com/@clips_ita?lang=it"), { platform: "tt", handle: "clips_ita" }, "link TikTok");
eq(parseProfileInput("@pagina", "tt"), { platform: "tt", handle: "pagina" }, "nome + piattaforma scelta");
eq(parseProfileInput("https://www.instagram.com/reel/ABC/"), null, "link a un reel, non a un profilo");
eq(parseProfileInput("ciao mondo"), null, "testo libero");
eq(profileId("ig", "Pagina"), "ig:pagina", "id");

// lettori
const ig = normalizeIg({ shortCode: "X1", url: "https://www.instagram.com/p/X1/", type: "Video", productType: "clips", videoPlayCount: 1000, likesCount: 50, commentsCount: 3, timestamp: "2026-10-28T12:00:00Z", ownerUsername: "Pag", videoDuration: 12.6, displayUrl: "https://x/y.jpg", caption: "c", musicInfo: { song_name: "Canzone", artist_name: "Art" }, isPinned: false });
eq([ig.id, ig.views, ig.duration, ig.owner, ig.sound], ["ig:X1", 1000, 13, "pag", "Canzone · Art"], "reel IG");
eq(normalizeIg({ shortCode: "F", type: "Image" }), null, "foto IG fuori");
eq(normalizeIg({ error: "not_found" }), null, "errore IG");
const tt = normalizeTt({ id: "77", webVideoUrl: "https://www.tiktok.com/@a/video/77", playCount: 5000, diggCount: 9, shareCount: 4, collectCount: 2, commentCount: 1, createTimeISO: "2026-10-27T12:00:00Z", authorMeta: { name: "A" }, videoMeta: { duration: 20, coverUrl: "c" }, text: "t", musicMeta: { musicName: "suono" } });
eq([tt.id, tt.views, tt.shares, tt.saves, tt.owner], ["tt:77", 5000, 4, 2, "a"], "video TikTok");

// archivio
const v = (id, views, daysAgo, pinned = false) => ({ id, views, postedAt: NOW - daysAgo * D, pinned });
let arch = mergeVideos([], [v("a", 100, 1)], NOW - 24 * H);
arch = mergeVideos(arch, [v("a", 340, 1), v("b", 50, 2)], NOW);
const a = arch.find((x) => x.id === "a");
eq(a.hist.map((h) => h[1]), [100, 340], "storia delle visualizzazioni");
eq(a.firstSeen, NOW - 24 * H, "prima vista conservata");
eq(arch.length, 2, "nuovo video aggiunto");
ok(mergeVideos([v("old", 1, 60)], [], NOW).length === 0, "oltre 45 giorni esce");
eq(velocity(a, NOW), 10, "velocità dalla storia: 240 in 24 h = 10/h");
eq(velocity({ views: 480, postedAt: NOW - 48 * H }, NOW), 10, "velocità dall'uscita senza storia");

// mediana e multiplo
const vids = [v("1", 100, 2), v("2", 200, 5), v("3", 300, 9), v("4", 5000, 3), v("p", 99999, 4, true), v("vecchio", 1, 40)];
const st = profileStats(vids, NOW);
eq([st.median, st.count], [250, 4], "mediana dei non fissati negli ultimi 30 giorni (un video esploso non la sposta)");
eq(profileStats([v("1", 100, 1), v("2", 200, 2)], NOW).median, null, "sotto 3 video: niente mediana");
eq(scoreVideo(v("4", 5000, 3), st, NOW).outlier, 20, "5.000 su 250 = ×20");
eq(scoreVideo(v("x", 5000, 3), { median: null }, NOW).outlier, null, "senza mediana niente multiplo");
ok(scoreVideo(v("n", 1, 1), st, NOW).fresh, "giovane sotto 72 h");

// classifica
const profiles = [{ id: "ig:a", platform: "ig", handle: "a" }, { id: "tt:b", platform: "tt", handle: "b" }];
const byP = { "ig:a": vids, "tt:b": [v("t1", 900, 1), v("t2", 1000, 2), v("t3", 1100, 3), v("t4", 9000, 1)] };
const top = topVideos(profiles, byP, { days: 30 }, NOW);
eq(top[0].id, "4", "primo per multiplo: ×20 batte ×8,6 anche con meno visualizzazioni");
eq(topVideos(profiles, byP, { sort: "views" }, NOW)[0].id, "p", "per visualizzazioni il fissato da 99.999");
eq(topVideos(profiles, byP, { platform: "tt" }, NOW).every((x) => x.profileId === "tt:b"), true, "filtro piattaforma");
eq(topVideos(profiles, byP, { days: 7 }, NOW).some((x) => x.id === "3"), false, "filtro 7 giorni");
eq(topVideos(profiles, byP, { minOutlier: 5 }, NOW).map((x) => x.id).sort(), ["4", "t4"], "solo sopra ×5");

// utili
eq(runBudget(10, "ig"), 0.47, "tetto di spesa");
eq([shortNum(1234567), shortNum(34500), shortNum(1500), shortNum(812)], ["1,2 mln", "35 mila", "1,5 mila", "812"], "numeri brevi");
eq([ageLabel(5), ageLabel(72), ageLabel(24 * 30)], ["5 h", "3 g", "4 sett."], "età");

console.log(`clip-radar: ${n} verifiche ok`);
