// node tests/studio-telegram.mjs — canale Telegram e landing dello Studio social (logica pura).
import assert from "node:assert/strict";
import {
  romeLocalToMs, msToRomeLocal, normalizeTgPost, canApproveTg, duePosts, sendPlan, normalizeLanding, landingStats, tgSummary, LATE_LIMIT_MS,
} from "../src/lib/studio-telegram-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const PH = "0123456789abcdef";

t("ora di Roma: ora legale e solare, andata e ritorno", () => {
  assert.equal(new Date(romeLocalToMs("2026-10-17T21:30")).toISOString(), "2026-10-17T19:30:00.000Z"); // CEST +2
  assert.equal(new Date(romeLocalToMs("2026-11-17T21:30")).toISOString(), "2026-11-17T20:30:00.000Z"); // CET +1
  assert.equal(msToRomeLocal(romeLocalToMs("2026-10-25T10:00")), "2026-10-25T10:00"); // giorno del cambio
  assert.equal(romeLocalToMs("boh"), null);
});

t("post: testo o foto, limiti Telegram, pulsante https, mai programmato da qui", () => {
  assert.equal(normalizeTgPost({}).ok, false);
  const long = "x".repeat(1100);
  assert.match(normalizeTgPost({ text: long, photoIds: [PH] }).errors[0], /1024/);
  assert.equal(normalizeTgPost({ text: long }).ok, true); // senza foto il limite è 4096
  assert.match(normalizeTgPost({ text: "ciao", buttonUrl: "http://x" }).errors[0], /https/);
  assert.match(normalizeTgPost({ text: "ciao", buttonUrl: "https://onlyfans.com/x" }).errors[0], /nome al pulsante/);
  const { post } = normalizeTgPost({ text: "ciao", status: "programmato", photoIds: [PH, PH, "zzz"], sendAtLocal: "2026-10-17T21:30" });
  assert.equal(post.status, "bozza");
  assert.deepEqual(post.photoIds, [PH]);
  assert.equal(post.sendAt, romeLocalToMs("2026-10-17T21:30"));
  // modificare un programmato lo riporta in bozza; un inviato resta inviato
  assert.equal(normalizeTgPost({ text: "a" }, { status: "programmato" }).post.status, "bozza");
  assert.equal(normalizeTgPost({ text: "a" }, { status: "inviato" }).post.status, "inviato");
  assert.equal(normalizeTgPost({ text: "a", status: "annullato" }).post.status, "annullato");
});

t("approvare: ora futura, conformità e qualità «ok» (attenzione non basta), nessun blocco", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");
  const good = { status: "bozza", sendAt: now + 3600e3, reviews: { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } } };
  assert.equal(canApproveTg(good, now).ok, true);
  assert.match(canApproveTg({ ...good, sendAt: now - 3600e3 }, now).reason, /già passata/);
  assert.match(canApproveTg({ ...good, sendAt: null }, now).reason, /ora/);
  assert.match(canApproveTg({ ...good, reviews: { ...good.reviews, qualita: { outcome: "attenzione" } } }, now).reason, /Qualità/);
  assert.match(canApproveTg({ ...good, reviews: { conformita: { outcome: "blocca" }, qualita: { outcome: "ok" } } }, now).reason, /Bloccato/);
  assert.equal(canApproveTg({ ...good, status: "inviato" }, now).ok, false);
});

t("da mandare: solo programmati E approvati con l'ora arrivata; i troppo in ritardo a parte", () => {
  const now = Date.parse("2026-10-17T20:00:00Z");
  const posts = [
    { id: "a", status: "programmato", approvedBy: "u", sendAt: now - 60e3 },
    { id: "b", status: "programmato", approvedBy: null, sendAt: now - 60e3 }, // non approvato: mai
    { id: "c", status: "bozza", approvedBy: "u", sendAt: now - 60e3 },
    { id: "d", status: "programmato", approvedBy: "u", sendAt: now + 60e3 },  // non ancora
    { id: "e", status: "programmato", approvedBy: "u", sendAt: now - LATE_LIMIT_MS - 1 },
    { id: "f", status: "programmato", approvedBy: "u", sendAt: now - 120e3 },
  ];
  const { due, late } = duePosts(posts, now);
  assert.deepEqual(due.map((p) => p.id), ["f", "a"]);
  assert.deepEqual(late.map((p) => p.id), ["e"]);
});

t("come si manda: testo, foto singola col pulsante, album + pulsante a parte", () => {
  const b = { buttonUrl: "https://onlyfans.com/x", buttonLabel: "Vieni" };
  assert.equal(sendPlan({ text: "t", photoIds: [], ...b })[0].method, "sendMessage");
  const one = sendPlan({ text: "t", photoIds: [PH], ...b });
  assert.equal(one.length, 1); assert.equal(one[0].method, "sendPhoto"); assert.ok(one[0].button);
  const album = sendPlan({ text: "t", photoIds: [PH, "fedcba9876543210"], ...b });
  assert.deepEqual(album.map((s) => s.method), ["sendMediaGroup", "sendMessage"]);
  assert.equal(sendPlan({ text: "t", photoIds: [PH, "fedcba9876543210"] }).length, 1); // senza pulsante niente secondo messaggio
});

t("landing: indirizzo pulito, destinazione solo t.me, attiva solo con destinazione", () => {
  assert.equal(normalizeLanding({ slug: "Ma" }).ok, false);
  assert.equal(normalizeLanding({ slug: "marty", target: "https://evil.com" }).ok, false);
  assert.match(normalizeLanding({ slug: "marty", active: true }).errors[0], /destinazione/);
  const { ok, landing } = normalizeLanding({ slug: "marty", target: "https://t.me/+abc", active: true, photoId: "nope" });
  assert.equal(ok, true); assert.equal(landing.photoId, null); assert.equal(landing.buttonLabel, "Entra nel canale");
});

t("conteggi: visite e clic degli ultimi 7 giorni, riepilogo post", () => {
  const s = landingStats({ "v:2026-10-17": 10, "c:2026-10-17": 4, "v:2026-10-11": 5, "v:2026-10-10": 99 }, "2026-10-17", 7);
  assert.equal(s.visits, 15); assert.equal(s.clicks, 4);
  assert.equal(landingStats({}, "2026-10-17").rate, null);
  const now = 1000;
  const sum = tgSummary([{ status: "programmato", sendAt: 5000 }, { status: "programmato", sendAt: 2000 }, { status: "inviato" }, { status: "boh" }], now);
  assert.equal(sum.counts.programmato, 2); assert.equal(sum.counts.bozza, 1); assert.equal(sum.next.sendAt, 2000);
});

console.log(`studio-telegram: ${n} gruppi di asserzioni ok`);

// ── Percorso intero con KV, spazio foto e Telegram finti (nessuna rete, nessun dato reale) ──────
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  globalThis.__stFakeKv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v, o = {}) { if (o?.nx && store.has(k)) return null; store.set(k, clone(v)); return "OK"; },
    async del(...ks) { let c = 0; for (const k of ks.flat()) if (store.delete(k)) c++; return c; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hincrby(k, f, by) { const h = { ...(store.get(k) || {}) }; h[f] = Number(h[f] || 0) + by; store.set(k, h); return h[f]; },
    async smembers(k) { return [...(store.get(k) || [])]; },
  };
  const blobs = new Map();
  globalThis.__studioFakeBlob = {
    async put(p, buf, o) { blobs.set(p, { buf, type: o.contentType }); return { pathname: p }; },
    async get(p) { const b = blobs.get(p); return b ? { statusCode: 200, stream: new Response(b.buf).body, blob: { contentType: b.type } } : null; },
    async del(p) { blobs.delete(p); },
  };
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__stFakeKv;", shortCircuit: true };
      if (specifier === "@/lib/s4s") return { url: "data:text/javascript,export const getNames = async () => ({});", shortCircuit: true };
      if (specifier === "@/lib/creator-scope") return { url: "data:text/javascript,export const personOf = (a) => String(a || '');", shortCircuit: true };
      if (specifier.startsWith("@/")) {
        const p = path.join(SRC, specifier.slice(2));
        return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context);
      }
      return next(specifier, context);
    },
  });
  process.env.TELEGRAM_BOT_TOKEN = "123:fake";
  const calls = [];
  let msgId = 100;
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").pop();
    let body;
    if (init?.body instanceof FormData) { body = {}; for (const [k, v] of init.body.entries()) body[k] = typeof v === "string" ? v : { file: v.size }; }
    else body = JSON.parse(init?.body || "{}");
    calls.push({ method, body });
    if (method === "sendMediaGroup") { const media = JSON.parse(body.media); return { ok: true, status: 200, json: async () => ({ ok: true, result: media.map(() => ({ message_id: ++msgId })) }) }; }
    if (["sendMessage", "sendPhoto"].includes(method)) return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: ++msgId } }) };
    throw new Error(`metodo inatteso ${method}`);
  };
  const S = await import("../src/lib/studio-telegram.js");
  let m = 0;
  const ok = (c, msg) => { assert.ok(c, msg); m++; };
  const PID = "instagram-prova";
  store.set("tg:ch:ch1", { id: "ch1", chat_id: -1001, title: "Canale prova", links: [{ key: "k1", name: "Instagram · bio", url: "https://t.me/+bio" }], bot: { status: "admin" }, members: 12 });

  // canale + link OF
  ok(!(await S.saveTgConfig(PID, { channelId: "nope" })).ok, "canale inesistente rifiutato");
  ok(!(await S.saveTgConfig(PID, { ofLinkUrl: "https://evil.com/x" })).ok, "link OF non OnlyFans rifiutato");
  ok((await S.saveTgConfig(PID, { channelId: "ch1", ofLinkUrl: "https://onlyfans.com/prova/c9" }, "u1")).ok, "canale collegato");

  // foto
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const p1 = await S.addPhoto(PID, jpg, "image/jpeg", "u1");
  const p2 = await S.addPhoto(PID, jpg, "image/jpeg", "u1");
  ok((await S.listPhotos(PID)).length === 2 && !("path" in (await S.listPhotos(PID))[0]), "foto elencate senza il percorso privato");
  await assert.rejects(() => S.addPhoto(PID, jpg, "image/gif", "u1"));

  // un post con una foto e il pulsante
  const now = Date.now();
  const r1 = await S.savePost(PID, { text: "Stasera ti racconto una cosa", photoIds: [p1.id], buttonLabel: "Vieni", buttonUrl: "https://onlyfans.com/prova/c9", sendAt: now + 5 * 60e3 }, "u1");
  ok(r1.ok && r1.post.status === "bozza", "post salvato in bozza");
  ok(!(await S.approvePost(PID, r1.post.id, "u1")).ok, "senza revisori non si approva");
  await S.savePost(PID, { ...r1.post, reviews: { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } } }, "u1");
  const ap = await S.approvePost(PID, r1.post.id, "nicholas");
  ok(ap.ok && ap.post.status === "programmato" && ap.post.approvedBy === "nicholas", "approvato da una persona → programmato");
  ok(!(await S.removePhoto(PID, p1.id)).ok, "una foto di un post programmato non si toglie");

  // prima dell'ora non parte niente
  let res = await S.sendDuePosts({ now, listProfileIds: async () => [PID] });
  ok(res.sent === 0 && calls.length === 0, "prima dell'ora nessun invio");
  // all'ora parte: sendPhoto multipart con didascalia e pulsante
  res = await S.sendDuePosts({ now: now + 6 * 60e3, listProfileIds: async () => [PID] });
  ok(res.sent === 1 && calls.length === 1 && calls[0].method === "sendPhoto", "partito come foto");
  ok(calls[0].body.photo?.file > 0 && calls[0].body.caption === "Stasera ti racconto una cosa" && JSON.parse(calls[0].body.reply_markup).inline_keyboard[0][0].url === "https://onlyfans.com/prova/c9", "foto, didascalia e pulsante giusti");
  const sentPost = (await S.listPosts(PID)).find((p) => p.id === r1.post.id);
  ok(sentPost.status === "inviato" && sentPost.messageIds.length === 1, "segnato come inviato");
  res = await S.sendDuePosts({ now: now + 20 * 60e3, listProfileIds: async () => [PID] });
  ok(res.sent === 0 && calls.length === 1, "un secondo giro non lo rimanda");
  ok(!(await S.savePost(PID, { ...sentPost, text: "cambiato" })).ok, "un post uscito non si modifica");

  // album: media group + pulsante a parte
  const r2 = await S.savePost(PID, { text: "Album", photoIds: [p1.id, p2.id], buttonLabel: "Vieni", buttonUrl: "https://onlyfans.com/prova/c9", sendAt: now + 30 * 60e3, reviews: { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } } }, "u1");
  await S.approvePost(PID, r2.post.id, "nicholas");
  // un post approvato e poi modificato torna in bozza e NON parte
  const r3 = await S.savePost(PID, { text: "Altro", sendAt: now + 30 * 60e3, reviews: { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } } }, "u1");
  await S.approvePost(PID, r3.post.id, "nicholas");
  await S.savePost(PID, { ...(await S.listPosts(PID)).find((p) => p.id === r3.post.id), text: "Altro cambiato" }, "u1");
  res = await S.sendDuePosts({ now: now + 31 * 60e3, listProfileIds: async () => [PID] });
  ok(res.sent === 1 && calls.slice(1).map((c) => c.method).join() === "sendMediaGroup,sendMessage", "album + pulsante; il post modificato dopo l'approvazione non parte");

  // troppo in ritardo: non parte, si segnala
  const r4 = await S.savePost(PID, { text: "Vecchio", sendAt: now + 40 * 60e3, reviews: { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } } }, "u1");
  await S.approvePost(PID, r4.post.id, "nicholas");
  res = await S.sendDuePosts({ now: now + 40 * 60e3 + LATE_LIMIT_MS + 60e3, listProfileIds: async () => [PID] });
  ok(res.late === 1 && (await S.listPosts(PID)).find((p) => p.id === r4.post.id).status === "errore", "oltre 6 ore: non mandato, segnalato");

  // errore di Telegram: segnato, non perso
  const r5 = await S.savePost(PID, { text: "Errore", sendAt: now + 50 * 60e3, reviews: { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } } }, "u1");
  await S.approvePost(PID, r5.post.id, "nicholas");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, description: "Forbidden: bot is not a member of the channel chat" }) });
  res = await S.sendDuePosts({ now: now + 51 * 60e3, listProfileIds: async () => [PID] });
  globalThis.fetch = realFetch;
  const errPost = (await S.listPosts(PID)).find((p) => p.id === r5.post.id);
  ok(res.failed === 1 && errPost.status === "errore" && /not a member/.test(errPost.error), "errore Telegram scritto sul post");

  // landing: indirizzo unico, solo se attiva, conteggi
  ok((await S.saveTgConfig(PID, { landing: { slug: "prova", title: "Prova", target: "https://t.me/+bio", photoId: p2.id, active: true } }, "u1")).ok, "landing salvata");
  ok(!(await S.saveTgConfig("altro-profilo", { landing: { slug: "prova", target: "https://t.me/+x", active: true } })).ok, "indirizzo già usato da un altro profilo");
  ok((await S.landingBySlug("prova"))?.pid === PID, "landing trovata dall'indirizzo");
  await S.countLanding("prova", "visit"); await S.countLanding("prova", "visit"); await S.countLanding("prova", "click");
  const fn = await S.funnelNumbers(PID);
  ok(fn.landing.visits === 2 && fn.landing.clicks === 1 && fn.telegram.members === 12 && fn.telegram.connected, "numeri del percorso");
  await S.saveTgConfig(PID, { landing: { slug: "prova", target: "https://t.me/+bio", active: false } }, "u1");
  ok((await S.landingBySlug("prova")) === null, "landing spenta = pagina non trovata");
  ok(!(await S.removePhoto(PID, "ffffffffffffffff")).ok, "foto inesistente");

  console.log(`studio-telegram (percorso intero): ${m} verifiche ok`);
}
