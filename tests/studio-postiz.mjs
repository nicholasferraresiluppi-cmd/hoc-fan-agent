// node tests/studio-postiz.mjs — pubblicazione su Instagram via Postiz (logica pura + percorso con Postiz finto).
import assert from "node:assert/strict";
import { igCaption, buildPostizBody, stateToStatus, pickIntegration, canPublishIg, AI_CAPTION_NOTE } from "../src/lib/studio-postiz-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("didascalia: dichiarazione AI solo se serve", () => {
  assert.equal(igCaption({ caption: "Marco, ci sentiamo." }), "Marco, ci sentiamo.");
  assert.equal(igCaption({ caption: "x", ai: true }), `x\n\n${AI_CAPTION_NOTE}`);
  assert.equal(igCaption({ ai: true }), AI_CAPTION_NOTE);
});

t("corpo Postiz: reel = post standalone, storia = story", () => {
  const b = buildPostizBody({ integrationId: "i1", item: { caption: "c", kind: "reel" }, whenMs: Date.parse("2026-10-27T17:30:00Z"), media: { id: "m1", path: "https://u/p.mp4" } });
  assert.equal(b.type, "schedule"); assert.equal(b.date, "2026-10-27T17:30:00.000Z");
  assert.equal(b.posts[0].settings.__type, "instagram-standalone"); assert.equal(b.posts[0].settings.post_type, "post");
  assert.deepEqual(b.posts[0].value[0].image, [{ id: "m1", path: "https://u/p.mp4" }]);
  assert.equal(buildPostizBody({ integrationId: "i1", item: { kind: "storia" }, whenMs: 1, media: { id: "m", path: "p" } }).posts[0].settings.post_type, "story");
  assert.throws(() => buildPostizBody({ integrationId: "i1", item: {}, whenMs: 1 }));
});

t("canale giusto e stato", () => {
  const list = [{ id: "a", profile: "altro", identifier: "instagram-standalone" }, { id: "b", profile: "marty.tibecca", identifier: "instagram-standalone", disabled: true }, { id: "c", profile: "Marty.Tibecca", identifier: "instagram-standalone" }];
  assert.equal(pickIntegration(list, "@marty.tibecca").id, "c");
  assert.equal(pickIntegration(list, "nessuno"), null);
  assert.equal(stateToStatus("PUBLISHED"), "pubblicato"); assert.equal(stateToStatus("QUEUE"), "programmato");
});

t("si manda solo se approvato, col video controllato, almeno 5 minuti avanti, non due volte", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");
  const ok = { status: "programmato", video: { path: "studio/p/video/i/x.mp4" } };
  assert.equal(canPublishIg(ok, now + 3600e3, now).ok, true);
  assert.match(canPublishIg({ ...ok, status: "da_approvare" }, now + 3600e3, now).reason, /approvato/);
  assert.match(canPublishIg({ ...ok, video: null }, now + 3600e3, now).reason, /video/);
  assert.match(canPublishIg(ok, now + 60e3, now).reason, /5 minuti/);
  assert.match(canPublishIg({ ...ok, postiz: { postId: "x", state: "QUEUE" } }, now + 3600e3, now).reason, /già/);
  assert.equal(canPublishIg({ ...ok, postiz: { postId: "x", state: "ERROR" } }, now + 3600e3, now).ok, true, "dopo un errore si riprova");
});

console.log(`studio-postiz: ${n} gruppi di asserzioni ok`);

{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  globalThis.__pzFakeKv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v) { store.set(k, clone(v)); return "OK"; },
    async del(k) { store.delete(k); return 1; },
  };
  const blobs = new Map([["studio/p1/video/it1/reel.mp4", Buffer.from("finto-video")]]);
  globalThis.__studioFakeBlob = {
    async get(p) { const b = blobs.get(p); return b ? { statusCode: 200, stream: new Response(b).body } : null; },
    async del(p) { blobs.delete(p); },
  };
  const calls = [];
  let postState = "QUEUE";
  globalThis.__postizFakeFetch = async (url, init) => {
    const u = new URL(url); calls.push(`${init.method} ${u.pathname}`);
    const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
    if (u.pathname.endsWith("/integrations")) return ok([{ id: "integ1", name: "marty", profile: "marty.tibecca", identifier: "instagram-standalone", disabled: false }]);
    if (u.pathname.endsWith("/upload")) { assert.ok(init.body instanceof FormData); return ok({ id: "media1", path: "https://uploads.postiz.com/reel.mp4" }); }
    if (u.pathname.endsWith("/posts") && init.method === "POST") { const b = JSON.parse(init.body); assert.equal(b.posts[0].integration.id, "integ1"); return ok([{ postId: "post1", integration: "integ1" }]); }
    if (u.pathname.endsWith("/posts") && init.method === "GET") return ok({ posts: [{ id: "post1", state: postState, releaseURL: postState === "PUBLISHED" ? "https://instagram.com/reel/abc" : null, publishDate: "2026-10-27T17:30:00Z" }] });
    if (u.pathname.includes("/posts/") && init.method === "DELETE") return ok({ id: "post1" });
    return new Response("no", { status: 404 });
  };
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__pzFakeKv;", shortCircuit: true };
      if (specifier.startsWith("@/")) {
        const p = path.join(SRC, specifier.slice(2));
        return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context);
      }
      return next(specifier, context);
    },
  });
  const P = await import("../src/lib/studio-postiz.js");
  let m = 0;
  const ok = (c, msg) => { assert.ok(c, msg); m++; };
  const profile = { id: "p1", handle: "marty.tibecca" };
  store.set("studio:items:p1", { it1: { id: "it1", title: "Beccato #5", status: "da_approvare", caption: "Ciao", kind: "reel" } });

  ok(!(await P.attachVideo("p1", "it1", { path: "studio/ALTRO/video/it1/x.mp4" })).ok, "percorso di un altro profilo rifiutato");
  ok((await P.attachVideo("p1", "it1", { path: "studio/p1/video/it1/reel.mp4", name: "reel.mp4", size: 11 }, "u1")).ok, "video collegato");
  ok(!(await P.publishToInstagram("p1", profile, "it1", { publishAtLocal: "2030-10-27T18:30" }, "u1")).ok, "non approvato: non parte");
  const items = store.get("studio:items:p1"); items.it1.status = "programmato"; store.set("studio:items:p1", items);
  ok(!(await P.attachVideo("p1", "it1", { path: "studio/p1/video/it1/altro.mp4" })).ok, "approvato: il video non si cambia più");
  const res = await P.publishToInstagram("p1", profile, "it1", { publishAtLocal: "2030-10-27T18:30" }, "nicholas");
  ok(res.ok && res.item.postiz.postId === "post1" && res.item.postiz.state === "QUEUE", "in coda su Postiz");
  ok(calls.join() === "GET /public/v1/integrations,POST /public/v1/upload,POST /public/v1/posts", `chiamate: ${calls.join()}`);
  ok(!(await P.publishToInstagram("p1", profile, "it1", { publishAtLocal: "2030-10-27T18:30" }, "nicholas")).ok, "non si manda due volte");

  postState = "PUBLISHED";
  const sync = await P.syncInstagramStates([profile]);
  const after = store.get("studio:items:p1").it1;
  ok(sync.updated === 1 && after.status === "pubblicato" && after.postiz.releaseURL === "https://instagram.com/reel/abc", "pubblicato col link");

  // un secondo contenuto tolto dalla coda: il post Postiz si cancella
  const it = store.get("studio:items:p1");
  it.it2 = { id: "it2", status: "da_approvare", postiz: { postId: "post2", state: "QUEUE" } }; store.set("studio:items:p1", it);
  ok((await P.unpublishFromInstagram("p1", "it2")).ok && store.get("studio:items:p1").it2.postiz === null && calls.includes("DELETE /public/v1/posts/post2"), "tolto da Postiz");
  console.log(`studio-postiz (percorso intero): ${m} verifiche ok`);
}
