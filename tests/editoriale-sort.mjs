// Unit test — smistamento del drive dell'Editoriale (editoriale-sort-core + editoriale-sort con
// KV, Drive e AI finti). Esegui: node tests/editoriale-sort.mjs
import assert from "node:assert/strict";
import {
  SORT_KEYS, SORT_STEP_MAX, parseSortAnswer, duplicatesOf, groupOf, pendingFiles, sortSummary, sortPrompt, sortLabel,
} from "../src/lib/editoriale-sort-core.js";

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n++; };

// ── risposta dell'AI ──
eq(parseSortAnswer("1: selfie\n2: mare\n3: palestra", 3), ["selfie", "mare", "palestra"], "risposta pulita");
eq(parseSortAnswer("Ecco:\n1. Selfie\n3) outfit\n2 - casa", 3), ["selfie", "casa", "outfit"], "formati diversi e ordine sparso");
eq(parseSortAnswer("1: selfie\n2: spiaggia\n9: mare", 3), ["selfie", null, null], "chiave sconosciuta o numero fuori = non letto");
eq(parseSortAnswer("1: selfie\n1: mare", 2), ["selfie", null], "vale la prima risposta per numero, mancante = null");
eq(parseSortAnswer("", 2), [null, null], "risposta vuota");
eq(parseSortAnswer("Immagine 2: locali", 2), [null, "locali"], "«Immagine 2:» riconosciuto");
ok(SORT_KEYS.every((k) => sortPrompt(4).includes(`- ${k}:`)), "ogni gruppo è nelle istruzioni");
eq(sortLabel("dup"), "Doppioni", "etichetta dei doppioni");

// ── doppioni: stessi byte, si tiene il più vecchio ──
const files = [
  { id: "a", kind: "photo", md5: "x", created: "2026-10-02" },
  { id: "b", kind: "photo", md5: "x", created: "2026-10-01" },
  { id: "c", kind: "photo", md5: "x", created: "2026-10-03" },
  { id: "d", kind: "video", md5: "x", created: "2026-10-01" },   // stesso md5 ma video: altro gruppo
  { id: "e", kind: "photo", md5: null, created: "2026-10-01" },
  { id: "f", kind: "photo", md5: "y", created: "2026-10-01" },
];
const dups = duplicatesOf(files);
eq([...dups].sort(), [["a", "b"], ["c", "b"]], "copie → originale più vecchio; video e file senza impronta esclusi");

// ── gruppo per file e file da smistare ──
const labels = { b: "selfie", e: "nd", f: "boh" };
eq(groupOf(files[0], labels, dups), "dup", "copia = doppione anche senza etichetta");
eq(groupOf(files[1], labels, dups), "selfie", "etichetta dell'AI");
eq(groupOf(files[4], labels, dups), "nd", "non letto");
eq(groupOf(files[5], labels, dups), null, "etichetta non valida = da smistare");
eq(pendingFiles(files, labels, dups).map((f) => f.id), ["d", "f"], "da smistare: niente doppioni, niente già fatti");
eq(pendingFiles(files, labels, dups, { retry: true }).map((f) => f.id), ["d", "e", "f"], "riprova: anche i non letti");
const sum = sortSummary(files, labels, dups, (f) => f.id !== "b");
eq([sum.done, sum.pending, sum.total], [4, 2, 6], "conteggi");
eq(sum.groups.find((g) => g.key === "selfie"), { kind: "photo", key: "selfie", n: 1, free: 0 }, "liberi per gruppo");

// ── archivio con KV, Drive e AI finti ──
{
  const { registerHooks } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const path = await import("node:path");
  const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../src");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const hash = (k) => { if (!store.has(k)) store.set(k, {}); return store.get(k); };
  const kv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v, o) { if (o?.nx && store.has(k)) return null; store.set(k, clone(v)); return "OK"; },
    async del(k) { store.delete(k); return 1; },
    async incrbyfloat(k, v) { store.set(k, (Number(store.get(k)) || 0) + v); return store.get(k); },
    async hset(k, obj) { Object.assign(hash(k), clone(obj)); return 1; },
    async hget(k, f) { return store.get(k)?.[f] ?? null; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hdel(k, ...fs) { if (store.get(k)) fs.forEach((f) => delete store.get(k)[f]); return 1; },
    async lpush() { return 1; }, async ltrim() { return "OK"; }, async lrange() { return []; },
  };
  globalThis.__esKv = kv;
  // 60 foto + 2 copie identiche + 1 senza miniatura
  const drive = [
    ...Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `${i}.jpg`, kind: "photo", path: "", md5: `m${i}`, created: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}` })),
    { id: "copy1", name: "0 copia.jpg", kind: "photo", path: "", md5: "m0", created: "2026-12-01" },
    { id: "copy2", name: "1 copia.jpg", kind: "photo", path: "", md5: "m1", created: "2026-12-01" },
    { id: "nothumb", name: "rotta.jpg", kind: "photo", path: "", md5: "zz", created: "2026-10-01" },
  ];
  globalThis.__esDrive = drive;
  globalThis.__esThumbs = 0;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__esKv;", shortCircuit: true };
      if (specifier === "@/lib/google-drive") return { url: "data:text/javascript,export const smallThumb = async (id) => { globalThis.__esThumbs++; return id === 'nothumb' ? null : { type: 'image/jpeg', body: Buffer.from([0xff,0xd8,1]) }; };", shortCircuit: true };
      if (specifier === "@/lib/editoriale-store") return { url: "data:text/javascript,export const getFiles = async () => ({ files: globalThis.__esDrive }); export const appendLog = async (ck, t) => { (globalThis.__esLog ||= []).push(t); };", shortCircuit: true };
      if (specifier.startsWith("@/")) { const p = path.join(SRC, specifier.slice(2)); return next(pathToFileURL(p.endsWith(".js") ? p : `${p}.js`).href, context); }
      return next(specifier, context);
    },
  });
  // AI finta: risponde «selfie» ai numeri pari, «mare» ai dispari; la chiamata n° fail fallisce
  let calls = 0, failOn = null;
  const imagesSeen = [];
  globalThis.__editSortFakeAi = { messages: { create: async ({ messages }) => {
    calls++;
    if (failOn === calls) throw Object.assign(new Error("overloaded"), { status: 529 });
    const imgs = messages[0].content.filter((c) => c.type === "image");
    imagesSeen.push(imgs.length);
    return { content: [{ type: "text", text: imgs.map((_, i) => `${i + 1}: ${i % 2 ? "mare" : "selfie"}`).join("\n") }], usage: { input_tokens: 300 * imgs.length, output_tokens: 40 } };
  } } };

  const S = await import("../src/lib/editoriale-sort.js");
  const ck = "giulia";
  const by = { name: "Luis" };

  const s1 = await S.sortStep(ck, by);
  ok(s1.ok, "primo passo riuscito");
  eq(Object.keys(s1.labels).length, SORT_STEP_MAX, "un passo guarda al massimo 48 file");
  ok(imagesSeen.every((k) => k <= 12), "al massimo 12 miniature per chiamata");
  eq(s1.remaining, 61 - SORT_STEP_MAX, "rimasti: 61 da smistare (63 meno 2 doppioni) meno 48");
  ok(!("copy1" in s1.labels) && !("copy2" in s1.labels), "i doppioni non vanno all'AI");
  ok(s1.spent > 0, "spesa registrata");
  eq(await kv.get(`edit:sort:lock:${ck}`), null, "lucchetto liberato a fine passo");

  failOn = calls + 1; // l'unica chiamata del secondo passo fallisce: quei file restano da smistare
  const s2 = await S.sortStep(ck, by);
  ok(!s2.ok && s2.status === 503 && /sovraccarica/.test(s2.errors[0]), "AI sovraccarica: detto in parole");
  eq((await S.getLabels(ck)).nothumb, "nd", "senza miniatura = non letto, mai messo a caso");
  eq(pendingFiles(drive, await S.getLabels(ck), duplicatesOf(drive)).length, 12, "i file della chiamata fallita restano da smistare");
  failOn = null;
  let s3 = await S.sortStep(ck, by);
  while (s3.ok && s3.remaining > 0) s3 = await S.sortStep(ck, by);
  eq(s3.remaining, 0, "alla fine tutto smistato");
  const labels = await S.getLabels(ck);
  eq(Object.keys(labels).length, 61, "61 etichette (doppioni esclusi)");
  ok(Object.values(labels).every((v) => ["selfie", "mare", "nd"].includes(v)), "solo gruppi validi o non letto");
  ok((globalThis.__esLog || []).some((t) => /2 doppioni, 1 non letti/.test(t)), "storico a fine smistamento");

  // lucchetto: due passi insieme
  await kv.set(`edit:sort:lock:${ck}`, "1");
  const busy = await S.sortStep(ck, by);
  ok(!busy.ok && busy.status === 409, "un secondo passo insieme è rifiutato");
  await kv.del(`edit:sort:lock:${ck}`);

  // riprova i non letti: la miniatura manca ancora → resta non letto, nessun giro infinito
  const r = await S.sortStep(ck, by, { retry: true });
  ok(r.ok && r.remaining === 0 && r.labels.nothumb === "nd", "riprova: torna non letto, finito");

  // correzione a mano
  const m = await S.setLabels(ck, ["p0", "p1", "nonEsiste"], "palestra");
  ok(m.ok && Object.keys(m.labels).length === 2, "spostati solo i file del drive");
  eq((await S.getLabels(ck)).p0, "palestra", "correzione salvata");
  ok(!(await S.setLabels(ck, ["p0"], "spiaggia")).ok, "gruppo sconosciuto rifiutato");
  await S.setLabels(ck, ["p1"], null);
  ok(!("p1" in (await S.getLabels(ck))), "di nuovo da smistare");

  // tetto di spesa
  store.set(`edit:sort:spend:${new Date().toISOString().slice(0, 7)}`, 10);
  const capped = await S.sortStep(ck, by);
  ok(!capped.ok && capped.status === 402, "tetto del mese: si ferma prima di spendere");

  await S.resetLabels(ck, by);
  eq(await S.getLabels(ck), {}, "azzerato");
}

console.log(`editoriale-sort: ${n} verifiche ok`);
