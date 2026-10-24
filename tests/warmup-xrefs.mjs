// Unit test — warmup-xrefs-core (Ispirazioni X). Esegui: node tests/warmup-xrefs.mjs
// Gli autori di prova hanno la forma vera vista il 24/10/2026 (apidojo/tweet-scraper).
import assert from "node:assert/strict";
import * as M from "../src/lib/warmup-xrefs-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗ " + name); throw e; } };
const tw = (id, author, extra = {}) => ({ id, text: "post", viewCount: 1000, likeCount: 10, createdAt: "Wed Oct 22 15:00:00 +0000 2026", author, ...extra });
const A = (u, followers, site, extra = {}) => ({ userName: u, name: u, followers, location: "", isBlueVerified: true, description: "", entities: { url: { urls: site ? [{ expanded_url: site }] : [] } }, ...extra });

t("solo creator con link diretto OnlyFans/Fansly (i Linktree generici sono rumore)", () => {
  const tweets = [
    tw("1", A("AccelGirl", 78040, "https://onlyfans.com/accelgirl")),
    tw("2", A("flordedurango", 2709, "https://onlyfans.com/flordedurango", { location: "Texas, USA" })), // sotto i 3.000 follower
    tw("3", A("FoxNews", 29440856, "https://foxnews.onelink.me/xLDS")),
    tw("4", A("MercedesAMGF1", 5279714, "https://linktr.ee/mercedesamgf1")),
    tw("5", A("Camilpzax", 141050, "https://fansly.com/camilalopez_dior/t2", { location: "California" })),
    tw("6", A("stephxxbunny", 468429, "https://linktr.ee/stephxnnieee", { description: "🔞 my OnlyFans below" })), // aggregatore ma OnlyFans in bio
    tw("7", A("AccelGirl", 78040, "https://onlyfans.com/accelgirl"), { viewCount: 9000 }),
  ].map(M.slimTweet);
  const { added, seen } = M.candidatesFrom(tweets, {}, { niche: "tattoo" });
  assert.equal(seen, 3);
  assert.deepEqual(added.map((a) => a.u).sort(), ["AccelGirl", "Camilpzax", "stephxxbunny"]);
  const cam = added.find((a) => a.u === "Camilpzax");
  assert.equal(cam.us, true); assert.equal(cam.status, "nuova"); assert.deepEqual(cam.niches, ["tattoo"]);
  assert.equal(added.find((a) => a.u === "AccelGirl").foundPost.views, 9000); // il post più forte
  const again = M.candidatesFrom(tweets, { accelgirl: { status: "scartata" } });
  assert.ok(!again.added.some((a) => a.u === "AccelGirl")); // scartata resta scartata
});

t("come pubblica: ritmo, formati, link nel post, post migliori", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const posts = [];
  for (let i = 0; i < 20; i++) {
    posts.push(M.slimTweet({ id: String(i), text: i % 2 ? "teaser 🔥 full video on my page" : "gm", viewCount: 1000 + i * 100, likeCount: i,
      createdAt: new Date(now - i * 12 * 3600e3).toUTCString(), mediaKind: i % 2 ? "video" : null,
      entities: { urls: i % 5 === 0 ? [{ expanded_url: "https://onlyfans.com/x" }] : [] } }));
  }
  posts.push(M.slimTweet({ id: "rt", isRetweet: true, viewCount: 999999, createdAt: new Date(now).toUTCString() }));
  const s = M.analyzePosts(posts, now);
  assert.equal(s.n, 20);
  assert.equal(s.perDay, 2.1); // 20 post in 9,5 giorni
  assert.equal(s.pctVideo, 50); assert.equal(s.pctText, 50); assert.equal(s.pctLinkInPost, 20);
  assert.equal(s.top[0].views, 2900); // i repost non contano
  assert.equal(s.top.length, 5);
  assert.ok(s.topHoursET.length >= 1);
});

t("cosa fanno le migliori: solo le tenute con numeri", () => {
  const refs = [
    { status: "tenuta", stats: { n: 30, perDay: 3, medViews: 5000, pctVideo: 60, pctPhoto: 30, pctText: 10, pctLinkInPost: 0, medTextLen: 40, topHoursET: [20, 21] } },
    { status: "tenuta", stats: { n: 30, perDay: 5, medViews: 9000, pctVideo: 40, pctPhoto: 50, pctText: 10, pctLinkInPost: 10, medTextLen: 60, topHoursET: [21, 22] } },
    { status: "scartata", stats: { n: 30, perDay: 50, medViews: 1 } },
    { status: "tenuta", stats: { n: 2 } },
  ];
  const p = M.patterns(refs);
  assert.equal(p.refs, 2); assert.equal(p.perDay, 4); assert.equal(p.medViews, 7000);
  assert.ok(p.topHoursET.includes(21));
  assert.equal(M.patterns([{ status: "nuova" }]), null);
});

t("ricerche: base + nicchia, ora italiana", () => {
  const q = M.discoveryQueries(["tattoo"], { since: "2026-09-24" });
  assert.ok(q.length === 6 && q[5].startsWith("tattoo onlyfans") && q[0].includes("since:2026-09-24"));
  const h = M.etToIt(20, new Date("2026-10-24T12:00:00Z")); // 20 a New York = 2 in Italia
  assert.equal(h, 2);
});

console.log(`warmup-xrefs: ${n} gruppi di asserzioni ok`);
