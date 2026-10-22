// Unit test — warmup-metrics-core (numeri pubblici IG e X letti con Apify). Esegui: node tests/warmup-metrics.mjs
// Le righe di prova hanno la forma vera delle risposte viste il 22/10/2026 (@_julii.life_, @julistyled, @ElisaVimercatii).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
registerHooks({ resolve(s, c, n) { if (s.startsWith("@/")) { const p = path.join(SRC, s.slice(2)); return n(pathToFileURL(p.endsWith(".js") ? p : p + ".js").href, c); } return n(s, c); } });
const M = await import("../src/lib/warmup-metrics-core.js");

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗ " + name); throw e; } };
const AT = Date.parse("2026-10-22T13:00:00Z");

const igRow = {
  username: "_julii.life_", followersCount: 2, followsCount: 11, postsCount: 19, private: false, isBusinessAccount: false, highlightReelCount: 0,
  latestPosts: [
    { shortCode: "DextaH0ts5F", type: "Video", productType: "clips", timestamp: "2026-10-22T00:37:03.000Z", videoViewCount: 78, likesCount: 0, commentsCount: 0 },
    { shortCode: "DexvZWWDUKR", type: "Sidecar", timestamp: "2026-10-22T00:53:27.000Z", likesCount: 0, commentsCount: 0 },
    { shortCode: "DeuJukERCqK", type: "Video", productType: "clips", timestamp: "2026-10-20T15:28:48.000Z", videoViewCount: 74, likesCount: 5, commentsCount: 1 },
    { shortCode: "DerrM_Dp0yr", type: "Video", productType: "clips", timestamp: "2026-10-19T16:22:01.000Z", videoViewCount: 62, likesCount: 1, commentsCount: 1 },
  ],
};

t("Instagram: profilo letto", () => {
  const r = M.parseInstagram(igRow, AT);
  assert.equal(r.followers, 2); assert.equal(r.posts, 19); assert.equal(r.notFound, false);
  assert.equal(r.items.length, 4);
  assert.equal(r.items.find((p) => p.id === "DextaH0ts5F").kind, "reel");
  assert.equal(r.items.find((p) => p.id === "DexvZWWDUKR").kind, "carosello");
  assert.equal(r.items.find((p) => p.id === "DexvZWWDUKR").views, null);
});

t("Instagram: profilo che non esiste", () => {
  const r = M.parseInstagram({ username: "julistyled", error: "not_found", errorDescription: "Profile does not exist" }, AT);
  assert.equal(r.notFound, true);
  const s = M.mergeReading(null, r);
  assert.equal(s.last.notFound, true);
  assert.deepEqual(s.days, {}); // un "non trovato" non scrive una riga di zeri
  const al = M.publicAlerts({ platform: "ig", username: "@julistyled" }, { last: s.last, lastAt: AT }, AT);
  assert.equal(al[0].lev, "bad"); assert.match(al[0].t, /non trovato su Instagram/);
});

t("X: profilo e post", () => {
  const prof = { status: "active", profile: "ElisaVimercatii", sub_count: 8, friends: 19, statuses_count: 0, blue_verified: false, protected: false, website: "https://onlyfans.com/elisavimercati/c320" };
  const r = M.parseX(prof, [
    { id: "1", createdAt: "Wed Oct 22 10:00:00 +0000 2026", viewCount: 700, likeCount: 6, replyCount: 1, retweetCount: 0 },
    { id: "2", createdAt: "Wed Oct 22 11:00:00 +0000 2026", viewCount: 300, likeCount: 2, replyCount: 0, retweetCount: 1, isRetweet: true },
  ], AT);
  assert.equal(r.followers, 8); assert.equal(r.premium, false); assert.equal(r.items.length, 1); // i repost di altri non contano
  const al = M.publicAlerts({ platform: "x", username: "@ElisaVimercatii" }, { last: r, lastAt: AT }, AT);
  assert.ok(al.some((x) => /Premium non attivo/.test(x.t)));
  assert.equal(M.parseX({ status: "notfound", profile: "ElisaVimercati" }, [], AT).notFound, true);
});

t("storico e settimana: follower, post della settimana, visualizzazioni", () => {
  let s = null;
  // lunedì 12/10 e domenica 18/10 (settimana prima), poi tre letture nella settimana del 19/10
  s = M.mergeReading(s, { at: Date.parse("2026-10-13T03:00:00Z"), followers: 0, posts: 2, items: [] });
  s = M.mergeReading(s, { at: Date.parse("2026-10-18T03:00:00Z"), followers: 1, posts: 8, items: [] });
  s = M.mergeReading(s, { at: Date.parse("2026-10-20T03:00:00Z"), followers: 1, posts: 12, items: [{ id: "a", ts: Date.parse("2026-10-19T16:00:00Z"), kind: "reel", views: 40, likes: 1, comments: 0 }] });
  s = M.mergeReading(s, M.parseInstagram(igRow, AT)); // il reel "DerrM" è lo stesso giorno di "a" ma un altro post
  s = M.mergeReading(s, { ...M.parseInstagram(igRow, AT + 3600e3), items: [{ id: "DextaH0ts5F", ts: Date.parse("2026-10-22T00:37:03Z"), kind: "reel", views: 120, likes: 3, comments: 0 }] });
  const wk = M.weekOfDay("2026-10-22"), prev = M.weekOfDay("2026-10-18");
  assert.notEqual(wk, prev);
  const w = M.weeklyFromStore(s, [prev, wk]);
  assert.equal(w[wk].followers, 2);
  assert.equal(w[wk].followersDelta, 1); // da 1 (fine settimana prima) a 2
  assert.equal(w[wk].deltaPartial, false);
  assert.equal(w[wk].published, 5); // a + 4 di igRow
  assert.equal(w[wk].reels, 4);
  assert.equal(w[wk].views, 40 + 120 + 74 + 62); // l'ultima lettura di un reel vince (78 → 120)
  assert.equal(M.prefillFor("ig", w[wk]).views, 296);
  assert.equal(M.prefillFor("ig", w[wk]).followers, 2);
});

t("X: precompilazione con nuovi follower, media visualizzazioni e interazioni", () => {
  const w = { followers: 30, followersDelta: 12, avgViews: 640, engagementPct: 1.2 };
  assert.deepEqual(M.prefillFor("x", w), { followers: 12, views: 640, eng: 1.2 });
});

t("niente avvisi se l'ultima lettura è vecchia", () => {
  const old = { last: { notFound: true }, lastAt: AT - 10 * 86400000 };
  assert.equal(M.publicAlerts({ platform: "ig", username: "@x" }, old, AT).length, 0);
});

t("nome utente per gli strumenti", () => {
  assert.equal(M.handleOf("@_julii.life_"), "_julii.life_");
  assert.equal(M.handleOf("@Elisa Vimercati"), null); // un nome con lo spazio non è un handle
  assert.equal(M.romeDay(Date.parse("2026-10-21T23:30:00Z")), "2026-10-22");
});

t("tetto di spesa del giro", () => {
  assert.ok(M.runBudget(50, 0) <= 0.3);
  assert.ok(M.runBudget(0, 10) < 0.4);
});

console.log(`warmup-metrics: ${n} gruppi di asserzioni ok`);
