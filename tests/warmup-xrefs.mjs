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
  assert.ok(q.length === 7 && q[6].startsWith("tattoo (onlyfans") && q[0].includes("since:2026-09-24"));
  const h = M.etToIt(20, new Date("2026-10-24T12:00:00Z")); // 20 a New York = 2 in Italia
  assert.equal(h, 2);
});

t("niente «of» inglese, niente uomini (casi della prima ricerca del 24/10)", () => {
  const tweets = [
    tw("1", A("MercedesAMGF1", 5279717, "https://linktr.ee/mercedesamgf1", { description: "Home of the 8x Formula 1 World Champions 🏆" })),
    tw("2", A("bluestein", 152352, "https://linktr.ee/Gregbluestein", { description: "Husband, father, aspiring mensch. chief politics of the AJC" })),
    tw("3", A("DJWilder_", 22749, "https://onlyfans.com/djwilder", { description: "California born. Built in the gym. muscle", location: "Visalia CA" })),
    tw("4", A("jake_brooks_fd", 7472, "https://www.fanvue.com/jake_brooks", { description: "35 | gay 🏳️‍🌈 Single Firefighter" })),
    tw("5", A("AccelGirl", 78041, "https://onlyfans.com/accelgirl", { description: "Coming soon… 🥰 ⬇️" })),
    tw("6", A("Maddisonfox", 205629, "https://link.me/maddisonfox__", { description: "💕 The algorithm's favourite blonde. my OF below" })),
  ].map(M.slimTweet);
  const { added } = M.candidatesFrom(tweets, {});
  assert.deepEqual(added.map((a) => a.u).sort(), ["AccelGirl", "Maddisonfox"]);
  assert.equal(added.find((a) => a.u === "Maddisonfox").female, true);
});

t("dalla rete: utenti dei «seguiti», marchi fuori (forma vera del 24/10)", () => {
  const users = [
    { userName: "BARBEEBANDZ_XXX", followers: 981546, location: "Florida, USA", description: "💞👉🏾JOIN MY ONLYFANS ‼️ Prettiest", entities: { url: { urls: [{ expanded_url: "https://onlyfans.com/barbeebandz/c42" }] } } },
    { userName: "fansly", followers: 319210, description: "A subscription-based social media platform.", entities: { url: { urls: [{ expanded_url: "https://fansly.com/explore" }] } } },
    { userName: "femboynetwork_", followers: 113621, description: "network of clips", entities: { url: { urls: [{ expanded_url: "https://onlyfans.com/zayasissy" }] } } },
    { userName: "misselusivex", followers: 234893, location: "UK", description: "Petite • Tattooed • Redhead", entities: { url: { urls: [{ expanded_url: "https://onlyfans.com/fantasyfreya/c1" }] } } },
    { userName: "piccola", followers: 1200, description: "girl", entities: { url: { urls: [{ expanded_url: "https://onlyfans.com/x" }] } } },
  ];
  const { added } = M.candidatesFrom(users.map((u) => M.userAsPost(u)), {}, { minFollowers: 5000 });
  assert.deepEqual(added.map((a) => a.u).sort(), ["BARBEEBANDZ_XXX", "misselusivex"]);
  assert.equal(added.find((a) => a.u === "BARBEEBANDZ_XXX").us, true);
  assert.equal(added.find((a) => a.u === "misselusivex").female, true);
});

t("uomini della prima rete (24/10) fuori", () => {
  for (const bio of ["Brazilian Top ⬆️🍆💪🏻| Não faço PG", "💥French Bi Kinky Twunk💥  no collab", "🔞Brazilian Twunk | Versatile Sub", "RAFA OSO 🐻 it's Time"])
    assert.equal(M.looksMale({ bio }), true, bio);
  assert.equal(M.looksMale({ bio: "4’11 latina who’s wild on camera 🤪" }), false);
});

t("API ufficiale di X: risposta v2 → stessa forma di Apify (link OF nella bio, media, sensibili, risposte)", () => {
  const res = {
    data: [
      { id: "10", author_id: "1", text: "new set is up 🔥 https://t.co/x", created_at: "2026-10-24T15:00:00.000Z", possibly_sensitive: true,
        public_metrics: { impression_count: 52000, like_count: 900, reply_count: 40, retweet_count: 30, bookmark_count: 70 },
        attachments: { media_keys: ["m1"] }, entities: { urls: [{ expanded_url: "https://onlyfans.com/lexi" }] } },
      { id: "11", author_id: "1", text: "@fan1 @fan2 thank you babe 💋", created_at: "2026-10-24T16:00:00.000Z",
        public_metrics: { impression_count: 800, like_count: 25 }, referenced_tweets: [{ type: "replied_to", id: "9" }] },
      { id: "12", author_id: "2", text: "big news of the day", created_at: "2026-10-24T16:00:00.000Z", public_metrics: { impression_count: 9 } },
    ],
    includes: {
      users: [
        { id: "1", username: "LexiUS", name: "Lexi", location: "Miami, FL", verified: true, description: "your favorite girl 💋 https://t.co/a",
          public_metrics: { followers_count: 120000, tweet_count: 5000 }, profile_image_url: "https://pbs.twimg.com/a_normal.jpg",
          entities: { url: { urls: [{ expanded_url: "https://linktr.ee/lexi" }] }, description: { urls: [{ expanded_url: "https://onlyfans.com/lexi" }] } } },
        { id: "2", username: "Journo", name: "J", description: "reporter", public_metrics: { followers_count: 90000 } },
      ],
      media: [{ media_key: "m1", type: "video" }],
    },
  };
  const posts = M.postsFromXApi(res, "q").map(M.slimTweet);
  assert.equal(posts.length, 3);
  const p0 = posts[0];
  assert.equal(p0.views, 52000); assert.equal(p0.media, "video"); assert.equal(p0.sensitive, true); assert.equal(p0.linkInPost, true);
  assert.equal(p0.author.site, "https://onlyfans.com/lexi"); // il link OF in bio vince sull'aggregatore
  assert.equal(p0.author.f, 120000); assert.equal(p0.author.blue, true);
  assert.ok(p0.author.pic.endsWith("a_200x200.jpg"));
  assert.equal(posts[1].isReply, true);
  const { added } = M.candidatesFrom(posts, {});
  assert.deepEqual(added.map((a) => a.u), ["LexiUS"]); // il giornalista no
  assert.equal(added[0].us, true); assert.equal(added[0].female, true);
  const st = M.analyzePosts(posts.filter((p) => p.author.u === "LexiUS"), Date.parse("2026-10-25T00:00:00Z"));
  assert.equal(st.n, 1);
  assert.equal(st.replies.n, 1); assert.equal(st.replies.share, 50);
  assert.equal(st.replies.examples[0].text, "thank you babe 💋"); // senza le @menzioni iniziali
  assert.equal(M.postsFromXApi({}).length, 0); // risposta vuota (nessun risultato)
  assert.ok(M.discoveryQueriesX(["tattoo"]).every((q) => q.includes("-is:retweet") && q.length < 512));
});

t("prima ricerca con l'API ufficiale (25/10): uomini e agenzie fuori", () => {
  for (const bio of ["Essex London straight lad exploring my crazy wild sex life😈", "18+ | Mgmt of Digital Content Creators & Streamers💋DM For R", "str8 guys only", "Top gaybrasil"])
    assert.equal(M.isOfCreator({ u: "x", bio, site: "https://onlyfans.com/x" }), false, bio);
  assert.equal(M.isOfCreator({ u: "x", bio: "4’11 latina who’s wild on camera 🤪", site: "https://onlyfans.com/x" }), true);
  assert.equal(M.isOfCreator({ u: "x", bio: "48 y/o Hotwife, my husband films 🔥 BBC lover", site: "https://onlyfans.com/x" }), true);
  assert.equal(M.isOfCreator({ u: "x", bio: "ꨄ 5’3 petite libra 🌿 sweet and spicy", site: "https://onlyfans.com/x" }), true);
});

console.log(`warmup-xrefs: ${n} gruppi di asserzioni ok`);
