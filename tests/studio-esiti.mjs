// node tests/studio-esiti.mjs — Cosa ha funzionato di Regia social (logica pura).
import assert from "node:assert/strict";
import { shortcodeOf, addDays, median, buildReels, buildAccountDays, baselineFor, clicksFor, buildOutcomes, byFormat, normalizeLinks, toLink, MIN_BASE, BASE_REELS } from "../src/lib/studio-esiti-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };

t("codice del link dall'id numerico (verificato su reel veri di @fishballla)", () => {
  assert.equal(shortcodeOf("3616476355256011885"), "DIwThWNokxt");
  assert.equal(shortcodeOf("4013622802798426212"), "DezQKyPNThk");
  assert.equal(shortcodeOf("3616476355256011885_2033306223"), "DIwThWNokxt");
  assert.equal(shortcodeOf("abc"), null);
  assert.equal(shortcodeOf(null), null);
});

t("date e mediana", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-11-02", -2), "2026-10-31");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

// reel uscito il 22/10 alle 08:20 UTC, fotografato dal 22/10 al 30/10 con un buco il 27
const ts = Date.parse("2026-10-22T08:20:00Z") / 1000;
const snaps = [["2026-10-22", 9029], ["2026-10-23", 12521], ["2026-10-24", 16026], ["2026-10-25", 17984], ["2026-10-26", 19460], ["2026-10-28", 26986], ["2026-10-29", 27854], ["2026-10-30", 28503]];
const rowsA = snaps.map(([d, v]) => ({ content_id: "4013622802798426212", date_key: d, play_count: v, like_count: 10, comment_count: 1, create_time: String(ts), thumbnail_url: `th-${d}` }));

t("serie di un reel: 24 h, 7 giorni (col buco vale la foto prima), ultima foto", () => {
  const [r] = buildReels(rowsA, "2026-10-30");
  assert.equal(r.code, "DezQKyPNThk");
  assert.equal(r.url, "https://www.instagram.com/reel/DezQKyPNThk/");
  assert.equal(r.pubDay, "2026-10-22");
  assert.equal(r.views1, 12521);
  assert.equal(r.views7, 27854); // 29/10
  assert.equal(r.views, 28503);
  assert.equal(r.thumb, "th-2026-10-30");
});

t("buco proprio sul giorno misurato: vale la foto del giorno prima", () => {
  const rows = rowsA.filter((x) => x.date_key !== "2026-10-29");
  const [r] = buildReels(rows, "2026-10-30");
  assert.equal(r.views7, 26986);
});

t("buco lungo (reel non più seguito): niente misura, non la foto vecchia", () => {
  const rows = rowsA.filter((x) => x.date_key <= "2026-10-24");
  const [r] = buildReels(rows, "2026-10-30");
  assert.equal(r.views1, 12521);
  assert.equal(r.views7, null);
  assert.equal(r.due7, true);
});

t("7 giorni non ancora passati → null, non lo zero", () => {
  const [r] = buildReels(rowsA.slice(0, 3), "2026-10-24");
  assert.equal(r.views1, 12521);
  assert.equal(r.views7, null);
  assert.equal(r.due7, false);
});

t("date_key come oggetto { value } (risposta BigQuery) e righe sporche", () => {
  const rows = [{ content_id: "4013622802798426212", date_key: { value: "2026-10-23" }, play_count: "5", create_time: String(ts) }, { content_id: "", date_key: "2026-10-23" }, { content_id: "1", date_key: null }];
  const out = buildReels(rows, "2026-10-30");
  assert.equal(out.length, 1);
  assert.equal(out[0].views1, 5);
});

// profilo: 7 reel, uno al giorno
const mk = (i, v7) => ({ id: String(i), code: `c${i}`, pubDay: addDays("2026-10-01", i), pubAt: Date.parse(addDays("2026-10-01", i) + "T10:00:00Z"), views7: v7 });
const reels = [mk(0, 100), mk(1, 200), mk(2, 300), mk(3, 400), mk(4, 500), mk(5, 1200), mk(10, null)];

t("il solito: mediana dei reel prima, solo con almeno MIN_BASE reel, al massimo BASE_REELS", () => {
  assert.equal(MIN_BASE, 5);
  assert.equal(baselineFor(reels[4], reels), null);           // 4 reel prima
  assert.deepEqual(baselineFor(reels[5], reels), { median: 300, n: 5 });
  // il reel stesso e quelli dopo non entrano; senza view a 7 g non entra
  assert.equal(baselineFor(reels[6], reels).n, 6);
  // profilo lento: reel lontani mesi contano lo stesso, ma solo gli ultimi BASE_REELS
  const many = Array.from({ length: 14 }, (_, i) => mk(i * 9, i < 4 ? 10 : 1000));
  const last = mk(200, 5000);
  assert.deepEqual(baselineFor(last, [...many, last]), { median: 1000, n: BASE_REELS });
});

t("visite al link: giorno dell'uscita + quello dopo, condivise se escono altri reel", () => {
  const acc = buildAccountDays([
    { date_key: "2026-10-11", unique_visitors_count_diff: 40, subs_diff: 3, followed_by: 10 },
    { date_key: "2026-10-12", unique_visitors_count_diff: 25, subs_diff: 1, followed_by: 12 },
    { date_key: "2026-10-06", unique_visitors_count_diff: 10, subs_diff: 0 },
    { date_key: "2026-10-07", unique_visitors_count_diff: 12, subs_diff: null },
  ]);
  assert.deepEqual(clicksFor(reels[6], acc, reels), { visits: 65, subs: 4, shared: 0 });
  // 6/10: esce il reel 5; il 5/10 è uscito il reel 4 → condiviso
  assert.deepEqual(clicksFor(reels[5], acc, reels), { visits: 22, subs: null, shared: 1 });
  // giorno mancante → niente numero
  assert.deepEqual(clicksFor(reels[0], acc, reels), { visits: null, subs: null, shared: 0 });
});

t("esiti: × il solito, collegamento al Banco, finestra mostrata", () => {
  const out = buildOutcomes({
    reels, accountDays: {}, lastDay: "2026-10-20", showDays: 18,
    links: { c5: { fileId: "f1" }, c3: { fileId: "gone" } },
    banco: { f1: { title: "P1 Shoulder", path: "7 - Primi piani" } },
  });
  assert.equal(out.length, 6);                         // il reel del 1/10 è fuori dai 18 giorni
  const r5 = out.find((o) => o.code === "c5");
  assert.equal(r5.ratio, 4);
  assert.equal(r5.video.title, "P1 Shoulder");
  assert.equal(out.find((o) => o.code === "c3").video.missing, true);
  assert.equal(out.find((o) => o.code === "c1").ratio, null);
});

t("per formato: confronto solo con abbastanza reel misurati", () => {
  const o = (code, path, ratio, views7 = 1000) => ({ code, fileId: code, video: { path }, ratio, views7 });
  const f = byFormat([o("a", "P", 2), o("b", "P", 1), o("c", "P", 3), o("d", "K", 5), o("e", "K", null), o("x", null, 9), { code: "z", fileId: null }]);
  assert.equal(f[0].path, "P");
  assert.equal(f[0].ratio, 2);
  assert.equal(f[0].enough, true);
  const k = f.find((g) => g.path === "K");
  assert.equal(k.n, 2);
  assert.equal(k.measured, 1);
  assert.equal(k.ratio, null);
  assert.equal(f.find((g) => g.path === null || g.path === "").label, "Cartella principale");
});

t("collegamenti: un video = un reel, vince l'ultimo; righe illeggibili scartate", () => {
  const l = normalizeLinks({ a: JSON.stringify({ fileId: "f", at: 1 }), b: { fileId: "f", at: 2 }, c: { fileId: "g", at: 3 }, d: "{rotto", e: { at: 4 } });
  assert.deepEqual(Object.keys(l).sort(), ["b", "c"]);
});

t("da collegare: solo i reel usciti dopo il collegamento della cartella", () => {
  const out = [{ fileId: null, pubAt: 100 }, { fileId: null, pubAt: 300 }, { fileId: "x", pubAt: 400 }];
  assert.equal(toLink(out, 200), 1);
  assert.equal(toLink(out, null), 2);
});

console.log(`studio-esiti: ${n} prove ok`);
