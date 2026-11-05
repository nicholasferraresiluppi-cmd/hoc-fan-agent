// Unit test — warmup-plan (piano del giorno, situazioni, segnalazioni, cooldown). Esegui: node tests/warmup.mjs
// I numeri di riferimento sono quelli della console di prima (es. giorno 8 IG = 13 task, visto sui dati veri il 22/10/2026).
import assert from "node:assert/strict";
import {
  DAY, todayKey, planFor, visibleItems, reqItems, dayProgress, tasksOn, adherence, opDay, pausedDays,
  isCooldown, cooldownDay, stateOf, fillDefaults, applyState, openFlag, clearFlag, endCooldown, restoreState,
  undoableState, urgenze, xGoal, WFIELDS_X, hasArrears, weekKey, estToIt, SUP_PLATFORM_STATUS,
} from "../src/lib/warmup-plan.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗ " + name); throw e; } };
const ago = (d) => todayKey(new Date(Date.now() - d * DAY));
const prof = (o = {}) => fillDefaults({ id: "p" + Math.random(), username: "@test", platform: "ig", createdAt: ago(0), ...o });
const ids = (a) => visibleItems(a, planFor(a)).map((i) => i.id);

t("calendario Instagram giorno per giorno", () => {
  const d1 = prof();
  assert.equal(opDay(d1), 1);
  assert.equal(planFor(d1).title, "Solo setup del profilo e osservazione");
  assert.deepEqual(ids(d1), ["ip-switch", "d1-pfp", "d1-bio", "d1-reels", "d1-login-send", "d1-pm"]);
  assert.ok(planFor(d1).forbid.includes("NON mettere like a nulla"));
  assert.equal(ids(prof({ createdAt: ago(1) })).length, 13);
  const d5 = prof({ createdAt: ago(4) });
  assert.ok(ids(d5).includes("d5-r3")); // dal giorno 5 tre reel
  const d7 = prof({ createdAt: ago(6) });
  assert.ok(ids(d7).includes("d7-pro") && ids(d7).includes("d7-high"));
  const d8 = prof({ createdAt: ago(7) });
  assert.equal(opDay(d8), 8);
  assert.equal(planFor(d8).title, "Da 1 a 3 reels al giorno, 13 nella settimana");
  assert.equal(reqItems(visibleItems(d8, planFor(d8))).length, 12); // 13 righe, i sound sono facoltativi
});

t("settimana 2: link soft e trail reels solo col traguardo", () => {
  const a = prof({ createdAt: ago(15) });
  assert.equal(planFor(a).title, "3 reels al giorno e introduzione soft del link");
  assert.ok(ids(a).includes("cta-link"));
  assert.ok(!ids(a).includes("w-trail"));
  a.milestones.trail = true;
  assert.ok(ids(a).includes("w-trail"));
  const b = prof({ createdAt: ago(25) });
  assert.ok(ids(b).includes("cta-daily"));
});

t("shadowban: niente CTA, piano normale", () => {
  const a = prof({ createdAt: ago(15) });
  const txt = applyState(a, "shadowban", false, "Test");
  assert.match(txt, /Online → Shadowban/);
  assert.equal(stateOf(a), "shadowban");
  assert.ok(!ids(a).includes("cta-link"));
  assert.ok(planFor(a).forbid.some((f) => /Nessuna CTA/.test(f)));
  assert.equal(SUP_PLATFORM_STATUS[stateOf(a)], "not_recommended");
});

t("sospeso: il piano si ferma e il calendario va in pausa", () => {
  const a = prof({ createdAt: ago(10) });
  applyState(a, "sospeso", false, "Test", Date.now() - 3 * DAY);
  assert.equal(planFor(a).phase, "Stato: Sospeso");
  assert.equal(pausedDays(a), 3);
  assert.equal(opDay(a), 11 - 3);
  assert.equal(hasArrears(a, ago(1)), false); // niente arretrati mentre è fermo
  assert.ok(undoableState(a));
  const back = restoreState(a, true);
  assert.match(back, /riportato a Online/);
  assert.equal(stateOf(a), "online");
  assert.equal(pausedDays(a), 0); // annullando non si perdono le ore
});

t("recupero da ban → cooldown senza reel", () => {
  const a = prof({ createdAt: ago(30) });
  a.milestones.linkInBio = true;
  applyState(a, "bannato", false, "Test", Date.now() - DAY);
  const txt = applyState(a, "online", true, "Test");
  assert.match(txt, /cooldown/);
  assert.ok(isCooldown(a));
  assert.equal(cooldownDay(a), 1);
  assert.ok(!a.milestones.linkInBio);
  const plan = planFor(a);
  assert.match(plan.phase, /Cooldown post-unban · Giorno 1/);
  assert.ok(plan.forbid.some((f) => /MAI reels/.test(f)));
  assert.ok(ids(a).includes("cd-ip"));
  assert.match(endCooldown(a), /annullato al giorno 1/);
  assert.ok(!isCooldown(a));
});

t("segnalazione «Limits to Your Reach»: pubblicazioni ferme, escalation, rimessa in verde", () => {
  const a = prof({ createdAt: ago(10) });
  const txt = openFlag(a, "reach", "post del 12", "Test", Date.now() - 2 * DAY);
  assert.match(txt, /Limits to Your Reach — post del 12/);
  assert.equal(a.status, "arancione");
  assert.equal(pausedDays(a), 2);
  assert.ok(urgenze([a]).some((u) => /Escalation dovuta/.test(u.t)));
  const r = clearFlag(a);
  assert.equal(a.flag, null);
  assert.equal(a.status, "verde");
  assert.equal(a.flagHistory.length, 1);
  assert.ok(a.monitorUntil > Date.now());
  assert.equal(pausedDays(a), 2); // i giorni fermi restano in pausa
  assert.ok(r.logs[0].startsWith("Flag risolto"));
});

t("segnalazione shadowban cambia anche la situazione, e la rimessa in verde la riporta", () => {
  const a = prof({ createdAt: ago(20) });
  openFlag(a, "shadowban", "", "Test");
  assert.equal(a.status, "rosso");
  assert.equal(stateOf(a), "shadowban");
  const r = clearFlag(a);
  assert.equal(r.restored, true);
  assert.equal(stateOf(a), "online");
});

t("cambio tipo di segnalazione: la vecchia va nello storico", () => {
  const a = prof();
  openFlag(a, "removed", "", "Test");
  openFlag(a, "reach", "", "Test");
  assert.equal(a.flagHistory.length, 1);
  assert.equal(a.flagHistory[0].changed, true);
  assert.equal(a.flag.type, "reach");
});

t("aderenza: solo i giorni conclusi, oggi a parte", () => {
  const a = prof({ createdAt: ago(3) });
  const y = ago(1);
  const req = reqItems(visibleItems(a, tasksOn(a, y).plan));
  a.progress[y] = Object.fromEntries(req.map((i) => [i.id, true]));
  const ad = adherence(a, 7);
  assert.ok(ad.total > 0);
  assert.ok(ad.done === req.length && ad.pct < 100); // due giorni conclusi, uno fatto tutto
  assert.equal(ad.todayDone, 0);
  assert.equal(dayProgress(a, todayKey()).n, 0);
});

t("arretrati: solo dal primo giorno davvero usato", () => {
  const a = prof({ createdAt: ago(5) });
  assert.equal(hasArrears(a, ago(1)), false);
  a.progress[ago(2)] = { "ip-switch": true };
  assert.equal(hasArrears(a, ago(1)), true);
});

t("scadenze: dati settimanali mancanti e due creazioni sullo stesso telefono", () => {
  const a = prof({ createdAt: ago(9), device: "iPhone 1" });
  const b = prof({ createdAt: ago(9), device: "iphone 1", username: "@altro" });
  const u = urgenze([a, b]);
  assert.ok(u.some((x) => /Dati mancanti su @test/.test(x.t)));
  assert.ok(u.some((x) => x.lev === "bad" && /stesso giorno/.test(x.t)));
  a.weekly[weekKey(new Date(Date.now() - 7 * DAY))] = { views: 10 };
  assert.ok(!urgenze([a]).some((x) => /Dati mancanti/.test(x.t)));
});

t("X: setup il primo giorno, routine e consegne del lunedì", () => {
  const x1 = prof({ platform: "x" });
  assert.equal(planFor(x1).title, "Setup del profilo");
  assert.ok(ids(x1).includes("xs-premium"));
  const x2 = prof({ platform: "x", createdAt: ago(5) });
  assert.equal(planFor(x2).title, "Routine quotidiana");
  assert.ok(ids(x2).includes("x-teaser"));
  applyState(x2, "shadowban", false, "Test");
  assert.ok(ids(x2).includes("x-teaser-nolink")); // visualizzazioni crollate: teaser senza link
});

t("obiettivi X: verde, rosso, o niente se manca il dato", () => {
  const views = WFIELDS_X.find((f) => f.k === "views"), subs = WFIELDS_X.find((f) => f.k === "subs");
  assert.equal(xGoal(views, { views: 700 }), true);
  assert.equal(xGoal(views, { views: 300 }), false);
  assert.equal(xGoal(views, { views: "" }), null);
  assert.equal(xGoal(subs, { followers: 100, subs: 3 }), true);
  assert.equal(xGoal(subs, { followers: 100, subs: 2 }), false);
  assert.equal(xGoal(subs, { subs: 2 }), null);
});

t("orari USA in ora italiana", () => {
  assert.match(estToIt(9), /^\d{2}:\d{2}/);
});

console.log(`warmup: ${n} gruppi di asserzioni ok`);

// --- simulazione dell'archivio (KV finto): profilo agganciato ad Account social, spunte, import ---
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const hash = (k) => { if (!store.has(k)) store.set(k, {}); return store.get(k); };
  const list = (k) => { if (!store.has(k)) store.set(k, []); return store.get(k); };
  const set_ = (k) => { if (!store.has(k)) store.set(k, []); return store.get(k); };
  const kv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v) { store.set(k, clone(v)); return "OK"; },
    async del(k) { store.delete(k); return 1; },
    async mget(...ks) { return ks.map((k) => (store.has(k) ? clone(store.get(k)) : null)); },
    async smembers(k) { return [...(store.get(k) || [])]; },
    async sadd(k, ...v) { const s = set_(k); v.forEach((x) => { if (!s.includes(x)) s.push(x); }); return 1; },
    async srem(k, v) { store.set(k, (store.get(k) || []).filter((x) => x !== v)); return 1; },
    async sismember(k, v) { return (store.get(k) || []).includes(v) ? 1 : 0; },
    async hset(k, obj) { Object.assign(hash(k), clone(obj)); return 1; },
    async hget(k, f) { return store.get(k)?.[f] ?? null; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hdel(k, f) { if (store.get(k)) delete store.get(k)[f]; return 1; },
    async lpush(k, ...v) { list(k).unshift(...v.reverse()); return 1; },
    async rpush(k, ...v) { list(k).push(...v); return 1; },
    async lrange(k, a, b) { return (store.get(k) || []).slice(a, b + 1); },
    async ltrim(k, a, b) { store.set(k, (store.get(k) || []).slice(a, b + 1)); return "OK"; },
    pipeline() { const ops = []; const p = new Proxy({}, { get: (_, m) => (m === "exec" ? async () => { const out = []; for (const [fn, args] of ops) out.push(await kv[fn](...args)); return out; } : (...args) => { ops.push([m, args]); return p; }) }); return p; },
  };
  globalThis.__wuFakeKv = kv;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__wuFakeKv;", shortCircuit: true };
      if (specifier.startsWith("@/")) { const p = path.join(SRC, specifier.slice(2)); return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context); }
      return next(specifier, context);
    },
  });
  const S = await import("../src/lib/warmup-store.js");
  const { loadAll } = await import("../src/lib/supervisor-store.js");
  let m = 0;
  const ok = (c, msg) => { assert.ok(c, msg); m++; };
  const by = { userId: "u1", name: "Nicholas" };

  const c1 = await S.createProfile({ platform: "ig", username: "@Prova.Uno", creator: "Giulia", device: "iPhone di Giulia", deviceType: "iPhone 13", createdAt: ago(7), owner: { id: "u2", name: "Luis" } }, by);
  ok(c1.ok, "profilo creato");
  let sup = await loadAll();
  ok(sup.accounts.length === 1 && sup.accounts[0].username === "prova.uno" && sup.accounts[0].creationStatus === "warming", "account creato in Account social, in riscaldamento");
  ok(sup.devices.length === 1 && sup.devices[0].name === "iPhone di Giulia" && sup.devices[0].model === "iPhone 13", "telefono creato in Account social");
  ok(!(await S.createProfile({ platform: "ig", username: "prova.uno" }, by)).ok, "stesso account due volte: rifiutato");
  const c2 = await S.createProfile({ platform: "ig", username: "prova.due", device: "iphone di giulia" }, by);
  sup = await loadAll();
  ok(c2.ok && sup.devices.length === 1, "stesso telefono con un'altra grafia: non duplicato");

  await S.setTask(c1.id, ago(0), "ip-switch", true, by);
  await S.setTask(c1.id, ago(0), "d8-x", true, by);
  await S.setTask(c1.id, ago(0), "d8-x", false, by);
  await S.setTimer(c1.id, ago(0), "eng-daily", 600);
  await S.setTimer(c1.id, ago(0), "eng-daily", 300); // un altro telefono con meno minuti non toglie
  ok(!(await S.setTask(c1.id, "ieri", "x", true, by)).ok, "giorno non valido rifiutato");
  await kv.hset(`warmup:d:${c1.id}`, { [`d|2020-01-01|vecchia`]: "x" });
  let st = await S.loadState();
  const p1 = st.profiles.find((p) => p.id === c1.id);
  ok(p1.username === "@prova.uno" && p1.creator === "Giulia" && p1.device === "iPhone di Giulia", "profilo unito all'account");
  ok(p1.progress[ago(0)]["ip-switch"] && !p1.progress[ago(0)]["d8-x"], "spunte lette");
  ok(p1.timers[ago(0)]["eng-daily"] === 600, "timer: si tiene il massimo");
  ok(p1.owner.name === "Luis", "responsabile salvato");
  await new Promise((r) => setTimeout(r, 10));
  ok(!(store.get(`warmup:d:${c1.id}`)["d|2020-01-01|vecchia"]), "spunte oltre 60 giorni potate");

  await S.patchMeta(c1.id, { state: "sospeso", stateSince: Date.now(), weekly: { "2026-W40": { views: 10 } } }, by);
  await S.patchMeta(c1.id, { weekly: { "2026-W41": { views: 20 } } }, by);
  sup = await loadAll();
  ok(sup.accounts.find((a) => a.id === c1.id).platformStatus === "suspended", "sospeso anche in Account social");
  const rec = await kv.get(`warmup:p:${c1.id}`);
  ok(rec.weekly["2026-W40"] && rec.weekly["2026-W41"], "settimane fuse una per una");
  await S.patchMeta(c1.id, { state: "online" }, by);
  ok((await loadAll()).accounts.find((a) => a.id === c1.id).platformStatus === "ok", "di nuovo ok in Account social");

  await S.appendLog(c1.id, ["Completata: prova"], by, "task", "@prova.uno");
  ok((await S.getLog(c1.id))[0].text === "Completata: prova", "storico del profilo");
  ok((await S.getActivity())[0].text.includes("@prova.uno"), "registro di tutto");

  ok(!(await S.purge(c2.id)).ok, "non si cancella un profilo che non è in archivio");
  await S.setArchived(c2.id, true, by);
  ok((await S.purge(c2.id)).ok, "cancellato dall'archivio");
  ok((await loadAll()).accounts.some((a) => a.id === c2.id), "l'account resta in Account social");

  // import dal backup della console di prima (forma di exportBackup)
  const backup = {
    profili: [
      { id: "a1", platform: "ig", username: "@_julii.life_", creator: "Giulia Ottorini US", device: "iPhone di Giulia", createdAt: ago(7), owner: "U-LUIS", status: "verde", state: "online", progress: { [ago(1)]: { "ip-switch": true, "d7-pro": true } }, timers: { [ago(1)]: { "eng-daily": 1800 } }, milestones: {}, weekly: {}, log: [{ ts: 1, text: "Account registrato nella console", un: "Miriam" }, { ts: 2, text: "Completata: ruota IP", un: "Luis" }], pfp: "data:image/jpeg;base64,AAAA" },
      { id: "a2", platform: "x", username: "@Elisa Vimercati", creator: "Elisa", createdAt: ago(1), owner: "U-MIR", progress: {}, log: [] },
      { id: "f1", kind: "folder", name: "Fishball" },
    ],
    persone: [{ id: "U-LUIS", name: "Luis" }, { id: "U-MIR", name: "Miriam" }],
    registro: [{ ts: 5, un: "Luis", type: "task", text: "Completata — @_julii.life_" }, { ts: 3, un: "Miriam", type: "account", text: "Account registrato" }],
  };
  const dry = await S.importBackup(backup, by, { dryRun: true });
  ok(dry.created.length === 2 && !store.has("warmup:p:a1"), "anteprima: due profili, nulla scritto");
  const before = (await S.loadState()).profiles.length;
  const real = await S.importBackup(backup, by, { dryRun: false });
  st = await S.loadState();
  const jul = st.profiles.find((p) => p.username === "@_julii.life_");
  ok(real.created.length === 2 && st.profiles.length === before + 2, "importati");
  ok(jul.progress[ago(1)]["d7-pro"] && jul.timers[ago(1)]["eng-daily"] === 1800, "spunte e timer importati");
  ok(jul.owner.name === "Luis" && jul.owner.id === null && jul.hasPfp, "responsabile col nome, foto importata");
  ok(jul.device === "iPhone di Giulia", "telefono già esistente riusato");
  const log = await S.getLog(jul.id);
  ok(log[0].text === "Completata: ruota IP" && log.length === 2, "storico importato, dal più recente");
  const el = st.profiles.find((p) => p.platform === "x");
  ok(el && el.username === "@elisa vimercati" && el.owner.name === "Miriam", "profilo X importato");
  ok((await S.getActivity()).some((e) => e.text === "Account registrato"), "registro importato");
  const again = await S.importBackup(backup, by, { dryRun: false });
  ok(again.created.length === 0 && again.skipped.length === 2, "rilanciato: niente doppioni");

  console.log(`warmup (archivio simulato): ${m} verifiche ok`);
}
