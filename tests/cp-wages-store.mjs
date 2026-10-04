// node tests/cp-wages-store.mjs — storage wage CP a pezzi: compressione + copia in memoria (04/10/2026)
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const store = new Map();
const calls = { get: 0, chunkGet: 0 };
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
globalThis.__wagesFakeKv = {
  async get(k) { calls.get++; if (k.startsWith("cp:wagechunk:")) calls.chunkGet++; return store.has(k) ? clone(store.get(k)) : null; },
  async set(k, v) { store.set(k, clone(v)); return "OK"; },
  async del(...ks) { let c = 0; for (const k of ks.flat()) if (store.delete(k)) c++; return c; },
};
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__wagesFakeKv;", shortCircuit: true };
    return next(spec, ctx);
  },
});
const W = await import("../src/lib/cp-wages-store.js");

let n = 0;
const t = (name, fn) => fn().then(() => { n++; });

// un mese finto grande abbastanza da fare più pezzi (> 3 MB di JSON)
const wage = (i) => ({ id: `w${i}`, employee: `Operatore ${i % 37}`, creator: `Creator ${i % 11}`, total: i * 1.5, shifts: Array.from({ length: 6 }, (_, j) => ({ start: `2026-09-0${(j % 9) + 1}T10:00:00Z`, sales: [{ fan: `f${i}-${j}`, amount: j * 2.5, note: "x".repeat(400) }] })) });
const month = Array.from({ length: 1500 }, (_, i) => wage(i));

await t("scrive a pezzi COMPRESSI e rilegge identico", async () => {
  const r = await W.setWages("2026-09", month);
  assert.ok(r.chunks >= 2, "deve fare più pezzi");
  const m = store.get("cp:wages:2026-09");
  assert.equal(m.enc, "gz1");
  assert.ok(String(store.get("cp:wagechunk:2026-09:0")).startsWith("gz1:"));
  const back = await W.getWages("2026-09");
  assert.equal(JSON.stringify(back), JSON.stringify(month));
});

await t("seconda lettura dalla copia in memoria: nessun pezzo riscaricato", async () => {
  const before = calls.chunkGet;
  const back = await W.getWages("2026-09");
  assert.equal(calls.chunkGet, before);
  assert.equal(JSON.stringify(back), JSON.stringify(month));
});

await t("un chiamante che modifica il risultato non sporca la copia", async () => {
  const a = await W.getWages("2026-09");
  a[0].total = -999; a.push({ id: "spurio" });
  const b = await W.getWages("2026-09");
  assert.equal(b[0].total, month[0].total);
  assert.equal(b.length, month.length);
});

await t("una nuova scrittura invalida la copia", async () => {
  const smaller = month.slice(0, 10);
  await W.setWages("2026-09", smaller);
  const back = await W.getWages("2026-09");
  assert.equal(back.length, 10);
  assert.ok(!store.has("cp:wagechunk:2026-09:1"), "i pezzi avanzati si cancellano");
});

await t("mese scritto da UN ALTRO server (manifest cambiato): si riscarica", async () => {
  await W.getWages("2026-09"); // in copia
  const other = month.slice(0, 3);
  store.set("cp:wagechunk:2026-09:0", W.encodeChunk(other));
  store.set("cp:wages:2026-09", { chunked: true, n: 1, count: 3, at: Date.now() + 1000, enc: "gz1" });
  const back = await W.getWages("2026-09");
  assert.equal(back.length, 3);
});

await t("pezzi VECCHI non compressi si leggono ancora (retrocompatibile)", async () => {
  store.set("cp:wagechunk:2025-10:0", month.slice(0, 5));
  store.set("cp:wagechunk:2025-10:1", month.slice(5, 8));
  store.set("cp:wages:2025-10", { chunked: true, n: 2, count: 8, at: 123 });
  const back = await W.getWages("2025-10");
  assert.equal(JSON.stringify(back), JSON.stringify(month.slice(0, 8)));
});

await t("mese salvato come array unico (formato più vecchio) e mese assente", async () => {
  store.set("cp:wages:2025-01", month.slice(0, 2));
  assert.equal((await W.getWages("2025-01")).length, 2);
  assert.equal(await W.getWages("2024-01"), null);
});

await t("appendWages e deleteWages", async () => {
  await W.setWages("2026-08", month.slice(0, 2));
  await W.appendWages("2026-08", month.slice(2, 4));
  assert.equal((await W.getWages("2026-08")).length, 4);
  await W.deleteWages("2026-08");
  assert.equal(await W.getWages("2026-08"), null);
  assert.ok(![...store.keys()].some((k) => k.startsWith("cp:wagechunk:2026-08")));
});

await t("mese vuoto", async () => {
  await W.setWages("2026-07:staging", []);
  assert.deepEqual(await W.getWages("2026-07:staging"), []);
});

console.log(`cp-wages-store: ${n} test ok`);
