// Unit test — Editoriale Instagram (editoriale-core + editoriale-store con KV e Drive finti).
// Esegui: node tests/editoriale.mjs
import assert from "node:assert/strict";
import {
  creatorKey, stageOf, filesOf, usageMap, readyProblems, normalizeItem, setReady, schedule, setPublished,
  pubKindOfTask, needsFromTaskIds, itemForTask, dayItems, coverage, monthGrid, shiftMonth,
} from "../src/lib/editoriale-core.js";

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// ── chiave creator ──
eq(creatorKey("Giulia Ottorini"), "giulia-ottorini", "chiave semplice");
eq(creatorKey("  Élisa  Vimercati "), "elisa-vimercati", "accenti e spazi");
eq(creatorKey(""), "", "vuota");

// ── normalizeItem ──
const kinds = new Map([["p1", "photo"], ["p2", "photo"], ["p3", "photo"], ["v1", "video"], ["v2", "video"], ["v3", "video"]]);
{
  const r = normalizeItem({ type: "carosello", files: ["p1", "p2", "p1"] }, null, kinds);
  ok(r.ok, "carosello valido");
  eq(r.item.files, ["p1", "p2"], "doppione nello stesso carosello tolto");
  eq(r.item.status, "lavorazione", "nasce in preparazione");
  eq(r.item.title, "Carosello", "titolo di base");
  ok(!normalizeItem({ type: "carosello", files: ["p1", "v1"] }, null, kinds).ok, "video in un carosello: rifiutato");
  ok(!normalizeItem({ type: "reel", files: ["p1"] }, null, kinds).ok, "foto in un reel: rifiutata");
  ok(!normalizeItem({ type: "carosello", files: ["sparita"] }, null, kinds).ok, "file non più nel drive: rifiutato");
  ok(!normalizeItem({ type: "storia", files: [] }, null, kinds).ok, "tipo sconosciuto");
  const reel = normalizeItem({ type: "reel", files: ["v1"], final: "v1" }, null, kinds);
  ok(!reel.ok, "il montato non può essere anche il grezzo");
  const reel2 = normalizeItem({ type: "reel", files: ["v1"], final: "v2" }, null, kinds);
  ok(reel2.ok && reel2.item.final === "v2", "reel con montato");
  const car = normalizeItem({ type: "carosello", files: ["p1"], final: "v2" }, null, kinds);
  ok(car.ok && car.item.final === null, "un carosello non ha montato");
  // un pronto che perde una foto torna in preparazione e fuori dal calendario
  const prev = { id: "a", type: "carosello", files: ["p1", "p2"], status: "pronto", slot: { profileId: "x", date: "2026-11-03", time: "15:00" } };
  const back = normalizeItem({ files: ["p1"] }, prev, kinds);
  ok(back.ok && back.item.status === "lavorazione" && back.item.slot === null, "pronto con una foto sola → in preparazione");
  const keep = normalizeItem({ caption: "ciao" }, prev, kinds);
  ok(keep.item.status === "pronto" && keep.item.slot && keep.item.files.length === 2 && keep.item.caption === "ciao", "modifica dei testi: resta pronto e in calendario");
  ok(normalizeItem({ type: "reel" }, prev, kinds).item.type === "carosello", "il tipo non si cambia");
}

// ── pronto / colonne ──
{
  const c1 = { id: "c", type: "carosello", files: ["p1"], status: "lavorazione" };
  eq(readyProblems(c1), ["Servono almeno 2 foto"], "carosello da 1 foto non pronto");
  ok(!setReady(c1, true).ok, "non si segna pronto");
  const c2 = { ...c1, files: ["p1", "p2"] };
  const r = setReady(c2, true);
  ok(r.ok && r.item.status === "pronto", "segnato pronto");
  eq(stageOf(r.item), "pronto", "colonna Pronti");
  const reel = { id: "r", type: "reel", files: ["v1"], status: "lavorazione" };
  eq(readyProblems(reel), ["Manca il reel montato"], "reel senza montato");
  ok(readyProblems({ ...reel, noEdit: true }).length === 0, "senza montaggio: pronto");
  ok(readyProblems({ ...reel, final: "v2" }).length === 0, "con montato: pronto");
  eq(filesOf({ ...reel, final: "v2" }), ["v1", "v2"], "file occupati dal reel: grezzi + montato");
  const back = setReady({ ...r.item, slot: { profileId: "x", date: "2026-11-01" } }, false);
  ok(back.item.status === "lavorazione" && back.item.slot === null, "riportato in preparazione esce dal calendario");
}

// ── calendario ──
{
  const it = { id: "c", type: "carosello", files: ["p1", "p2"], status: "pronto" };
  ok(!schedule({ ...it, files: ["p1"] }, { profileId: "A", date: "2026-11-03" }, ["A"]).ok, "non finito: non va in calendario");
  ok(!schedule(it, { profileId: "Z", date: "2026-11-03" }, ["A"]).ok, "profilo di un'altra creator: rifiutato");
  ok(!schedule(it, { profileId: "A", date: "3/11" }, ["A"]).ok, "data non valida");
  ok(!schedule(it, { profileId: "A", date: "2026-11-03", time: "25:00" }, ["A"]).ok, "ora non valida");
  const s = schedule(it, { profileId: "A", date: "2026-11-03", time: "15:00" }, ["A"]);
  ok(s.ok && stageOf(s.item) === "calendario", "in calendario");
  ok(schedule(s.item, null, ["A"]).item.slot === null, "tolto dal calendario");
  const p = setPublished(s.item, true, { by: "Luis" });
  ok(p.ok && p.item.status === "pubblicato" && p.item.publishedBy === "Luis", "pubblicato");
  ok(!schedule(p.item, null, ["A"]).ok, "un pubblicato non si sposta");
  const un = setPublished(p.item, false);
  ok(un.item.status === "pronto" && !("publishedAt" in un.item) && un.item.slot, "riaperto: torna pronto, resta in calendario");
  ok(!setPublished(it, true, {}).ok, "pubblicato senza profilo né calendario: chiede il profilo");
  const p2 = setPublished(it, true, { profileId: "A", today: "2026-11-05" });
  ok(p2.ok && p2.item.slot.date === "2026-11-05", "pubblicato senza calendario: va sul giorno di oggi");
}

// ── Warm-up ──
{
  eq(pubKindOfTask("d2-car"), "carosello", "task carosello");
  eq(pubKindOfTask("d5-r3"), "reel", "task reel numerato");
  eq(pubKindOfTask("w1-reels"), "reel", "task reel settimana 1");
  eq(pubKindOfTask("w3-r2"), "reel", "task reel settimane dopo");
  eq(pubKindOfTask("d2-story"), null, "storie: non c'entrano");
  eq(pubKindOfTask("eng-post"), null, "engagement: non c'entra");
  eq(needsFromTaskIds(["ip-switch", "d5-car", "d5-r1", "d5-r2", "d5-r3", "d5-stories"]), { carosello: 1, reel: 3, reelMax: 3 }, "giorno 5: 1 carosello e 3 reel");
  eq(needsFromTaskIds(["w1-reels"]), { carosello: 0, reel: 1, reelMax: 3 }, "settimana 1: da 1 a 3 reel");
  const day = "2026-11-03";
  const items = [
    { id: "r2", type: "reel", status: "pronto", slot: { profileId: "A", date: day, time: "19:00" } },
    { id: "r1", type: "reel", status: "pronto", slot: { profileId: "A", date: day, time: "13:00" } },
    { id: "c1", type: "carosello", status: "pronto", slot: { profileId: "A", date: day, time: "15:00" } },
    { id: "rB", type: "reel", status: "pronto", slot: { profileId: "B", date: day, time: "10:00" } },
  ];
  eq(dayItems(items, "A", day, "reel").map((x) => x.id), ["r1", "r2"], "reel del giorno in ordine di ora");
  eq(itemForTask(items, "A", day, "d5-r1")?.id, "r1", "1° reel → quello delle 13");
  eq(itemForTask(items, "A", day, "d5-r2")?.id, "r2", "2° reel → quello delle 19");
  eq(itemForTask(items, "A", day, "d5-r3")?.id, "r1", "3° reel senza contenuto → il primo non uscito");
  eq(itemForTask(items, "A", day, "d5-car")?.id, "c1", "carosello del giorno");
  eq(itemForTask(items, "A", "2026-11-04", "d5-car"), null, "giorno senza contenuti → niente");
  const pubd = items.map((x) => (x.id === "r1" ? { ...x, status: "pubblicato", pubTask: "d5-r2" } : x));
  eq(itemForTask(pubd, "A", day, "d5-r2")?.id, "r1", "task già collegata → lo stesso contenuto");
  eq(itemForTask(pubd, "A", day, "d5-r1")?.id, "r2", "il 1° è già uscito con un'altra task → il primo ancora da pubblicare");
  const cov = coverage(items, "A", day, { carosello: 1, reel: 3, reelMax: 3 });
  eq([cov.carosello.missing, cov.reel.missing], [0, 1], "copertura: manca un reel");
  const used = usageMap([{ id: "x", files: ["p1"], final: null }, { id: "y", files: ["v1"], final: "v2" }]);
  eq([used.get("p1"), used.get("v2"), used.get("p9")], ["x", "y", undefined], "mappa file → contenuto");
}

// ── griglia del mese ──
{
  const g = monthGrid("2026-11");
  eq(g[0], "2026-10-26", "novembre 2026 parte da lunedì 26 ottobre");
  ok(g.length % 7 === 0 && g.includes("2026-11-30"), "settimane intere fino al 30");
  eq(shiftMonth("2026-12", 1), "2027-01", "dicembre → gennaio");
  eq(shiftMonth("2026-01", -1), "2025-12", "gennaio → dicembre");
}

// ── archivio con KV e Drive finti: il lucchetto anti-doppione ──
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const hash = (k) => { if (!store.has(k)) store.set(k, {}); return store.get(k); };
  const list = (k) => { if (!store.has(k)) store.set(k, []); return store.get(k); };
  const kv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v) { store.set(k, clone(v)); return "OK"; },
    async del(k) { store.delete(k); return 1; },
    async hset(k, obj) { Object.assign(hash(k), clone(obj)); return 1; },
    async hsetnx(k, f, v) { const h = hash(k); if (f in h) return 0; h[f] = v; return 1; },
    async hget(k, f) { return store.get(k)?.[f] ?? null; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hdel(k, ...fs) { if (store.get(k)) fs.forEach((f) => delete store.get(k)[f]); return 1; },
    async lpush(k, ...v) { list(k).unshift(...v.reverse()); return 1; },
    async lrange(k, a, b) { return (store.get(k) || []).slice(a, b + 1); },
    async ltrim(k, a, b) { store.set(k, (store.get(k) || []).slice(a, b + 1)); return "OK"; },
  };
  globalThis.__edKv = kv;
  globalThis.__edDrive = {
    files: [
      ...["a", "b", "c", "d"].map((x) => ({ id: "ph-" + x, name: x + ".jpg", kind: "photo", path: "" })),
      ...["1", "2", "3"].map((x) => ({ id: "vd-" + x, name: x + ".mp4", kind: "video", path: "Video" })),
    ],
  };
  globalThis.__edSup = { accounts: [
    { id: "acc1", platform: "instagram", username: "julii", creator: "Giulia Ottorini" },
    { id: "acc2", platform: "instagram", username: "julistyled", creator: "Giulia Ottorini" },
    { id: "acc3", platform: "instagram", username: "altra", creator: "Altra Creator" },
  ], devices: [], mailboxes: [] };
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__edKv;", shortCircuit: true };
      if (specifier === "@/lib/google-drive") return { url: "data:text/javascript,export const folderIdFromUrl = (u) => String(u).split('/').pop() || null; export const folderInfo = async (id) => ({ id, name: 'Drive Giulia' }); export const listMedia = async () => ({ files: globalThis.__edDrive.files, truncated: false });", shortCircuit: true };
      if (specifier === "@/lib/supervisor-store") return { url: "data:text/javascript,export const loadAll = async () => globalThis.__edSup;", shortCircuit: true };
      if (specifier.startsWith("@/")) { const p = path.join(SRC, specifier.slice(2)); return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context); }
      return next(specifier, context);
    },
  });
  const S = await import("../src/lib/editoriale-store.js");
  const by = { userId: "u1", name: "Luis" };
  const ck = "giulia-ottorini";

  const cs = await S.creatorsWithProfiles();
  eq(cs.map((c) => [c.ck, c.profiles.length]), [["altra-creator", 1], ["giulia-ottorini", 2]], "creator con i loro profili IG");
  ok((await S.setFolder("Giulia Ottorini", "https://drive.google.com/drive/folders/ABCDEFGHIJKL", by)).ok, "cartella collegata");
  const files = await S.getFiles(ck);
  eq(files.files.length, 7, "file letti dal drive");

  const a = await S.saveItem(ck, { type: "carosello", files: ["ph-a", "ph-b", "ph-c"], title: "Palestra" }, by);
  ok(a.ok, "carosello creato");
  const dup = await S.saveItem(ck, { type: "carosello", files: ["ph-c", "ph-d"], title: "Caffè" }, by);
  ok(!dup.ok && /già usato in «Palestra»/.test(dup.errors[0]), "foto già usata: secondo carosello rifiutato");
  eq(await kv.hget(`edit:used:${ck}`, "ph-d"), null, "nessun lucchetto lasciato a metà dal rifiuto");
  const b = await S.saveItem(ck, { type: "carosello", files: ["ph-d"], title: "Caffè" }, by);
  ok(b.ok, "con la foto libera sì");
  // togliere una foto dal primo la libera; aggiungerla al secondo ora passa
  ok((await S.saveItem(ck, { id: a.item.id, files: ["ph-a", "ph-b"] }, by)).ok, "foto tolta da Palestra");
  ok((await S.saveItem(ck, { id: b.item.id, files: ["ph-d", "ph-c"] }, by)).ok, "e ora entra in Caffè");
  // reel: grezzo + montato occupano due video
  const r = await S.saveItem(ck, { type: "reel", files: ["vd-1"] }, by);
  ok(r.ok, "reel creato");
  ok((await S.saveItem(ck, { id: r.item.id, final: "vd-2" }, by)).ok, "montato scelto");
  ok(!(await S.saveItem(ck, { type: "reel", files: ["vd-2"] }, by)).ok, "il montato non si può usare come grezzo altrove");
  // pronto, calendario, pubblicato dal Warm-up
  ok((await S.stepItem(ck, a.item.id, "ready", { on: true }, by)).ok, "Palestra pronto");
  ok(!(await S.stepItem(ck, a.item.id, "schedule", { slot: { profileId: "acc3", date: "2026-11-03" } }, by)).ok, "profilo di un'altra creator: no");
  ok((await S.stepItem(ck, a.item.id, "schedule", { slot: { profileId: "acc1", date: "2026-11-03", time: "15:00" } }, by)).ok, "in calendario su @julii");
  const sch = await S.scheduledForProfiles([{ id: "acc1", creator: "Giulia Ottorini" }], ["2026-11-03"]);
  eq(sch.acc1["2026-11-03"].map((x) => [x.title, x.time, x.cover]), [["Palestra", "15:00", "ph-a"]], "il Warm-up vede cosa esce quel giorno");
  const pub = await S.publishFromTask({ id: "acc1", creator: "Giulia Ottorini" }, "2026-11-03", "d3-car", true, by);
  ok(pub && pub.status === "pubblicato" && pub.pubTask === "d3-car", "spunta nel Warm-up → pubblicato");
  ok(!(await S.deleteItem(ck, a.item.id, by)).ok, "un pubblicato non si smonta");
  ok(!(await S.saveItem(ck, { id: a.item.id, files: ["ph-a"] }, by)).ok, "un pubblicato non si modifica");
  const unpub = await S.publishFromTask({ id: "acc1", creator: "Giulia Ottorini" }, "2026-11-03", "d3-car", false, by);
  ok(unpub && unpub.status === "pronto", "spunta tolta → torna pronto");
  ok((await S.publishFromTask({ id: "acc1", creator: "Giulia Ottorini" }, "2026-11-04", "d4-car", true, by)) === null, "giorno senza contenuti: il Warm-up non tocca niente");
  // smontare libera i file
  ok((await S.deleteItem(ck, b.item.id, by)).ok, "Caffè smontato");
  eq([await kv.hget(`edit:used:${ck}`, "ph-c"), await kv.hget(`edit:used:${ck}`, "ph-d")], [null, null], "le sue foto tornano libere");
  // lucchetto orfano (contenuto sparito senza liberare): si riprende
  await kv.hset(`edit:used:${ck}`, { "ph-c": "fantasma" });
  ok((await S.saveItem(ck, { type: "carosello", files: ["ph-c", "ph-d"] }, by)).ok, "lucchetto orfano non blocca");
  const log = await S.getLog(ck);
  ok(log.length >= 5 && log.every((e) => e.un === "Luis"), "storico scritto con chi l'ha fatto");
}

console.log(`editoriale: ${n} verifiche ok`);
