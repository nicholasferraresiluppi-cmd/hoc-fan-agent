// node tests/telegram-channels.mjs — logica pura dei canali Telegram (lib/telegram-channels-core.js)
import assert from "node:assert/strict";
import {
  parseChannelInput, cleanChannel, cleanBatch, mergeCreators, creatorsOf, summarizeOfLinks, TG_LINK_RE, inviteLinkName, classifyMemberUpdate, botStatusOf, summarizeStats,
  pushMemberCount, memberDelta, romeDay, sameChannel, NO_LINK, OTHER_LINK, FOLDER,
} from "../src/lib/telegram-channels-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("link pubblici in tutte le forme", () => {
  for (const s of ["https://t.me/GiuliaVip", "t.me/giuliavip", "@GiuliaVip", "GiuliaVip", "https://telegram.me/giuliavip/", "tg://resolve?domain=giuliavip", "https://t.me/s/giuliavip", "t.me/giuliavip?start=x"]) {
    assert.deepEqual(parseChannelInput(s), { handle: "giuliavip" }, s);
  }
});
t("link d'invito privati", () => {
  assert.deepEqual(parseChannelInput("https://t.me/+AbCdEf123_-x"), { invite: "AbCdEf123_-x" });
  assert.deepEqual(parseChannelInput("t.me/joinchat/AbCdEf123456"), { invite: "AbCdEf123456" });
});
t("input illeggibili", () => {
  for (const s of ["", "ciao come va", "https://instagram.com/giulia", "t.me/joinchat", "@ab", "https://t.me/share"]) assert.equal(parseChannelInput(s), null, s);
});
t("form: almeno una creator, link valido, tipo", () => {
  assert.equal(cleanChannel({ url: "@giuliavip" }).ok, false);
  assert.equal(cleanChannel({ creators: [], url: "@giuliavip" }).ok, false);
  assert.equal(cleanChannel({ creators: ["Giulia"], url: "boh boh" }).ok, false);
  const c = cleanChannel({ creators: [" Giulia Amici ", "Martina Scavo", "Giulia Amici"], url: "@GiuliaVip", kind: "gruppo", manager: "Antonio" });
  assert.equal(c.ok, true);
  assert.equal(c.value.url, "https://t.me/giuliavip");
  assert.equal(c.value.kind, "gruppo");
  assert.deepEqual(c.value.creators, ["Giulia Amici", "Martina Scavo"]);
  assert.ok(!("of_link" in c.value));
  assert.deepEqual(cleanChannel({ creator: "Vecchio", url: "@giuliavip" }).value.creators, ["Vecchio"]);
  assert.equal(cleanChannel({ creators: ["G"], url: "@giuliavip", kind: "x" }).value.kind, "canale");
});
t("più canali in un invio", () => {
  const ok = cleanBatch([{ creators: ["A"], url: "@canaleuno" }, { creators: [], url: "" }, { creators: ["A", "B"], url: "t.me/+abcdefgh12" }], { manager: "Ilaria" });
  assert.equal(ok.ok, true);
  assert.equal(ok.values.length, 2);
  assert.equal(ok.values[1].manager, "Ilaria");
  const bad = cleanBatch([{ creators: ["A"], url: "@canaleuno" }, { creators: ["A"], url: "ciao ciao" }]);
  assert.equal(bad.ok, false); assert.equal(bad.row, 1); assert.match(bad.error, /^Riga 2/);
  const dup = cleanBatch([{ creators: ["A"], url: "@canaleuno" }, { creators: ["B"], url: "t.me/CanaleUno" }]);
  assert.equal(dup.ok, false); assert.match(dup.error, /già inserito/);
  assert.equal(cleanBatch([]).ok, false);
});
t("modifica da chi segue solo alcune creator", () => {
  const mine = (n) => n === "A";
  assert.deepEqual(mergeCreators(["A", "B"], ["C"], mine), ["B"]);
  assert.deepEqual(mergeCreators(["B"], ["A"], mine), ["B", "A"]);
  assert.deepEqual(creatorsOf({ creator: "X" }), ["X"]);
  assert.deepEqual(creatorsOf({ creators: ["Y"], creator: "X" }), ["Y"]);
});
t("link OF Telegram riconosciuti dal nome (nomi veri del warehouse)", () => {
  for (const n of ["post telegram", "TG PRINCIPALE", "TG ENG", "Main Tg", "TELEGRAM_principale_ZDI0", "Funnel TG Canale Creator"]) assert.ok(TG_LINK_RE.test(n), n);
  for (const n of ["S4S Giulia 12/10", "tiktok bio", "Instagram storia", "stgallen", "tgif"]) assert.ok(!TG_LINK_RE.test(n), n);
  const names = { 1: "Giulia - IT", 2: "Giulia - EN" };
  const out = summarizeOfLinks([
    { creator_id: 1, link_name: "post telegram", link_url: "u1", subs: 100, clicks: 900, subs_30: 10, clicks_30: 50 },
    { creator_id: 2, link_name: "TG ENG", link_url: "u2", subs: 40, clicks: 300, subs_30: 25, clicks_30: 80 },
    { creator_id: 2, link_name: "tiktok", link_url: "u3", subs: 999, subs_30: 999 },
    { creator_id: 9, link_name: "telegram", link_url: "u4", subs: 5, subs_30: 5 },
  ], (id) => (names[id] || "").replace(/\s*-\s*[A-Z]{2}$/, "") || null);
  assert.deepEqual(Object.keys(out), ["Giulia"]);
  assert.equal(out.Giulia.subs_30, 35);
  assert.equal(out.Giulia.subs, 140);
  assert.equal(out.Giulia.links[0].name, "TG ENG");
});
t("stesso canale: per @nome o per codice d'invito", () => {
  assert.ok(sameChannel({ handle: "a1234" }, { handle: "a1234" }));
  assert.ok(sameChannel({ invite: "XYZ12345" }, { invite: "XYZ12345" }));
  assert.ok(!sameChannel({ handle: null, invite: null }, { handle: null, invite: null }));
});
t("nome del link entro 32 caratteri", () => {
  assert.equal(inviteLinkName("instagram", "bio"), "Instagram · bio");
  assert.equal(inviteLinkName("boh"), "Altro");
  assert.ok(inviteLinkName("twitter", "x".repeat(60)).length <= 32);
});

const m = (status, extra = {}) => ({ status, user: { id: 7 }, ...extra });
const links = [{ key: "k1", url: "https://t.me/+aaa" }];
t("entrata da un nostro link", () => {
  assert.deepEqual(classifyMemberUpdate({ old_chat_member: m("left"), new_chat_member: m("member"), invite_link: { invite_link: "https://t.me/+aaa" } }, links), { type: "join", key: "k1" });
});
t("entrata da altro link, senza link, da cartella", () => {
  assert.equal(classifyMemberUpdate({ old_chat_member: m("left"), new_chat_member: m("member"), invite_link: { invite_link: "https://t.me/+zzz" } }, links).key, OTHER_LINK);
  assert.equal(classifyMemberUpdate({ old_chat_member: m("kicked"), new_chat_member: m("member") }, links).key, NO_LINK);
  assert.equal(classifyMemberUpdate({ old_chat_member: m("left"), new_chat_member: m("member"), via_chat_folder_invite_link: true }, links).key, FOLDER);
});
t("uscita, promozione ad admin, ristretto", () => {
  assert.deepEqual(classifyMemberUpdate({ old_chat_member: m("member"), new_chat_member: m("left") }), { type: "leave", key: null });
  assert.equal(classifyMemberUpdate({ old_chat_member: m("member"), new_chat_member: m("administrator") }), null);
  assert.equal(classifyMemberUpdate({ old_chat_member: m("member"), new_chat_member: m("restricted", { is_member: true }) }), null);
  assert.equal(classifyMemberUpdate({ old_chat_member: m("restricted", { is_member: false }), new_chat_member: m("member") }).type, "join");
  assert.equal(classifyMemberUpdate({}), null);
});
t("stato del bot", () => {
  assert.deepEqual(botStatusOf(m("administrator", { can_invite_users: true })), { status: "admin", can_invite: true });
  assert.deepEqual(botStatusOf(m("administrator", { can_invite_users: false })), { status: "admin", can_invite: false });
  assert.equal(botStatusOf(m("left")).status, "fuori");
  assert.equal(botStatusOf(m("member")).status, "membro");
  assert.equal(botStatusOf(null).status, "fuori");
});
t("giorno di Roma", () => {
  assert.equal(romeDay(Date.parse("2026-10-13T22:30:00Z") / 1000), "2026-10-14");
  assert.equal(romeDay(Date.parse("2026-10-14T10:00:00Z") / 1000), "2026-10-14");
});
t("statistiche per fonte, uscite mai oltre le entrate, uscite di prima del bot a parte", () => {
  const h = { "j:k1": "10", "l:k1": "3", "j:_diretto": 4, "l:_diretto": 9, "l:_prima": 5, "jd:2026-10-14": 6, "ld:2026-10-14": 2, "jd:2026-10-13": 1 };
  const s = summarizeStats(h, [{ key: "k1", name: "Instagram · bio" }, { key: "k2", name: "TikTok" }], { today: "2026-10-14", dayCount: 3 });
  assert.equal(s.bySource[0].label, "Instagram · bio");
  assert.equal(s.bySource[0].stay, 7);
  assert.equal(s.bySource[0].stay_rate, 0.7);
  const dir = s.bySource.find((r) => r.key === "_diretto");
  assert.equal(dir.leaves, 4);
  const tk = s.bySource.find((r) => r.key === "k2");
  assert.equal(tk.joins, 0);
  assert.equal(tk.stay_rate, null);
  assert.equal(s.totals.joins, 14);
  assert.equal(s.totals.leaves_before_bot, 5);
  assert.equal(s.totals.leaves, 3 + 4 + 5);
  assert.deepEqual(s.days.map((d) => d.d), ["2026-10-12", "2026-10-13", "2026-10-14"]);
  assert.equal(s.days[2].joins, 6);
  assert.ok(!s.bySource.some((r) => r.key === "_prima"));
});
t("statistiche vuote", () => {
  const s = summarizeStats(null, [], { today: "2026-10-14", dayCount: 2 });
  assert.equal(s.totals.joins, 0);
  assert.equal(s.days.length, 2);
});
t("serie iscritti: un punto al giorno, delta", () => {
  let h = pushMemberCount([], "2026-10-01", 100);
  h = pushMemberCount(h, "2026-10-01", 105);
  assert.equal(h.length, 1);
  h = pushMemberCount(h, "2026-10-07", 120);
  h = pushMemberCount(h, "2026-10-08", 130);
  assert.equal(memberDelta(h, 7), 25);
  assert.equal(memberDelta(h, 30), null);
  assert.equal(memberDelta([], 7), null);
  let long = [];
  for (let i = 0; i < 130; i++) long = pushMemberCount(long, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), i);
  assert.equal(long.length, 120);
});

console.log(`telegram-channels: ${n} gruppi ok`);

// ── Percorso intero con KV in memoria e Telegram finto (nessuna rete, nessun dato reale) ──────
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  globalThis.__tgFakeKv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v, o = {}) { if (o?.nx && store.has(k)) return null; store.set(k, clone(v)); return "OK"; },
    async del(...ks) { let c = 0; for (const k of ks.flat()) if (store.delete(k)) c++; return c; },
    async hset(k, obj) { const h = { ...(store.get(k) || {}) }; Object.assign(h, clone(obj)); store.set(k, h); return 1; },
    async hget(k, f) { const h = store.get(k) || {}; return f in h ? clone(h[f]) : null; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hdel(k, ...fs) { const h = { ...(store.get(k) || {}) }; fs.forEach((f) => delete h[f]); store.set(k, h); return 1; },
    async hincrby(k, f, by) { const h = { ...(store.get(k) || {}) }; h[f] = Number(h[f] || 0) + by; store.set(k, h); return h[f]; },
    async sadd(k, ...mm) { const s = new Set(store.get(k) || []); mm.forEach((x) => s.add(x)); store.set(k, [...s]); return 1; },
    async smembers(k) { return [...(store.get(k) || [])]; },
    async srem(k, ...mm) { const s = new Set(store.get(k) || []); mm.forEach((x) => s.delete(x)); store.set(k, [...s]); return 1; },
  };
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__tgFakeKv;", shortCircuit: true };
      if (specifier === "@/lib/s4s") return { url: "data:text/javascript,export const getNames = async () => ({});", shortCircuit: true };
      if (specifier === "@/lib/creator-scope") return { url: "data:text/javascript,export const personOf = (a) => String(a || '').replace(/ - [A-Z]{2}$/, '');", shortCircuit: true };
      if (specifier.startsWith("@/")) {
        const p = path.join(SRC, specifier.slice(2));
        return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context);
      }
      return next(specifier, context);
    },
  });
  process.env.TELEGRAM_BOT_TOKEN = "123:fake";
  process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
  const calls = [];
  const BOT = { id: 999, is_bot: true, username: "hoc_test_bot" };
  const chats = { "-1001": { id: -1001, type: "channel", title: "Giulia VIP", username: "giuliavip" }, "-1002": { id: -1002, type: "channel", title: "Privato di Marta" } };
  let linkN = 0;
  globalThis.fetch = async (url, init) => {
    const method = String(url).split("/").pop();
    const body = JSON.parse(init?.body || "{}");
    calls.push({ method, body });
    const ok = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
    if (method === "getMe") return ok(BOT);
    if (method === "getChat") {
      const c = String(body.chat_id).startsWith("@") ? Object.values(chats).find((x) => `@${x.username}` === body.chat_id) : chats[String(body.chat_id)];
      return c ? ok(c) : { ok: false, status: 400, json: async () => ({ ok: false, description: "Bad Request: chat not found" }) };
    }
    if (method === "getChatMember") return ok({ status: "administrator", user: BOT, can_invite_users: true });
    if (method === "getChatMemberCount") return ok(body.chat_id === -1001 ? 1520 : 80);
    if (method === "createChatInviteLink") return ok({ invite_link: `https://t.me/+fake${++linkN}`, name: body.name });
    if (method === "revokeChatInviteLink") return ok({});
    throw new Error(`metodo inatteso ${method}`);
  };

  const T = await import("../src/lib/telegram-channels.js");
  let k = 0;
  const ok = (c, msg) => { assert.ok(c, msg); k++; };

  const pub = await T.saveChannel({ creators: ["Giulia Amici"], handle: "giuliavip", invite: null, url: "https://t.me/giuliavip", kind: "canale", manager: "", note: "" }, { by: "u1" });
  const priv = await T.saveChannel({ creators: ["Marta", "Giulia Amici"], handle: null, invite: "AbCdEf123456", url: "https://t.me/+AbCdEf123456", kind: "canale", manager: "", note: "" }, { by: "u1" });
  ok((await T.listChannels()).length === 2, "due canali in mappa");

  // bot aggiunto al canale pubblico: abbinamento automatico per @nome
  const addBot = (chat, upd) => T.handleUpdate({ update_id: upd, my_chat_member: { chat, date: 1760436000, old_chat_member: { status: "left", user: BOT }, new_chat_member: { status: "administrator", user: BOT, can_invite_users: true } } });
  ok((await addBot(chats["-1001"], 1)) === "abbinato", "canale pubblico abbinato da solo");
  let g = await T.getChannel(pub.id);
  ok(g.chat_id === -1001 && g.members === 1520 && g.bot.status === "admin" && g.title === "Giulia VIP", "titolo, iscritti e stato bot letti");
  ok((await addBot(chats["-1001"], 1)) === "doppione", "update ripetuto scartato");

  // bot aggiunto al canale privato: in attesa, poi collegato a mano
  ok((await addBot(chats["-1002"], 2)) === "in attesa", "canale privato in attesa");
  ok(Object.keys(await T.getPending()).includes("-1002"), "compare tra le chat da collegare");
  await T.connectChat(priv.id, "-1002");
  ok(Object.keys(await T.getPending()).length === 0 && (await T.getChannel(priv.id)).members === 80, "collegato e letto");
  await assert.rejects(() => T.connectChat(pub.id, "-1002"), /già collegata/);
  k++;

  // link per fonte + entrate/uscite
  const ig = await T.createInviteLink(pub.id, { source: "instagram", label: "bio" }, "u1");
  ok(ig.url === "https://t.me/+fake1" && calls.some((c) => c.method === "createChatInviteLink" && c.body.name === "Instagram · bio"), "link creato col nome della fonte");
  const fan = (id) => ({ id, is_bot: false, first_name: "x" });
  const member = (upd, user, from, to, link) => T.handleUpdate({ update_id: upd, chat_member: { chat: { id: -1001 }, from: user, date: 1760436000, old_chat_member: { status: from, user }, new_chat_member: { status: to, user }, ...(link ? { invite_link: { invite_link: link } } : {}) } });
  ok((await member(10, fan(1), "left", "member", ig.url)) === "join", "entrata da Instagram");
  await member(11, fan(2), "left", "member", ig.url);
  await member(12, fan(3), "left", "member", null);
  ok((await member(13, fan(1), "member", "left")) === "leave", "uscita");
  await member(14, fan(77), "member", "left"); // era dentro prima del bot
  ok((await member(15, fan(2), "member", "administrator")) === "ignorato", "promozione ignorata");
  const s = summarizeStats(await T.getStats(pub.id), (await T.getChannel(pub.id)).links, { today: "2025-10-14", dayCount: 1 });
  const igRow = s.bySource.find((r) => r.key === ig.key);
  ok(igRow.joins === 2 && igRow.leaves === 1 && igRow.label === "Instagram · bio", "Instagram: 2 entrati, 1 uscito");
  ok(s.bySource.find((r) => r.key === NO_LINK).joins === 1, "1 entrato senza link");
  ok(s.totals.leaves_before_bot === 1 && s.totals.leaves === 2, "uscita di prima del bot a parte");
  ok(![...store.keys()].some((key) => key.startsWith("tg:mm:") && JSON.stringify(store.get(key)).includes('"1"')), "nessun id Telegram in chiaro");
  ok(!JSON.stringify([...store.values()]).includes("first_name"), "nessun dato del fan salvato");

  // chat non mappata e revoca
  ok((await T.handleUpdate({ update_id: 30, chat_member: { chat: { id: -5 }, date: 1, old_chat_member: { status: "left" }, new_chat_member: { status: "member", user: fan(9) } } })) === "chat non mappata", "chat estranea ignorata");
  await T.revokeInviteLink(pub.id, ig.key);
  ok((await T.getChannel(pub.id)).links[0].revoked, "link revocato, resta nello storico");

  // un errore libera il dedup (Telegram riprova)
  const realHincrby = globalThis.__tgFakeKv.hincrby;
  globalThis.__tgFakeKv.hincrby = async () => { throw new Error("KV giù"); };
  await assert.rejects(() => member(40, fan(5), "left", "member", null));
  globalThis.__tgFakeKv.hincrby = realHincrby;
  ok((await member(40, fan(5), "left", "member", null)) === "join", "dopo l'errore l'update si rielabora");

  // giro notturno e rimozione
  ok((await T.refreshAll()).ok === 2, "giro notturno legge entrambi");
  await T.deleteChannel(priv.id);
  ok(!(await T.getChannel(priv.id)) && !store.has("tg:chat:-1002"), "canale tolto con il suo abbinamento");
  console.log(`telegram-channels: percorso intero ok (${k} verifiche)`);
}
