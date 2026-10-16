// node tests/studio-editorial.mjs — Editoriale dello Studio social (logica pura).
import assert from "node:assert/strict";
import { weekStartOf, weekDays, normalizeArc, hasOfLink, dailyLinkGaps, slotOfTime, editorialGrid, romeDayOf } from "../src/lib/studio-editorial-core.js";
import { romeLocalToMs, normalizeTgPost, sendPlan, canApproveTg } from "../src/lib/studio-telegram-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const at = (local) => romeLocalToMs(local);

t("settimana: lunedì, 7 giorni", () => {
  assert.equal(weekStartOf("2026-10-25"), "2026-10-19"); // domenica → lunedì prima
  assert.equal(weekStartOf("2026-10-19"), "2026-10-19");
  assert.deepEqual(weekDays("2026-10-19").slice(-1), ["2026-10-25"]);
  assert.equal(weekStartOf("boh"), null);
});

t("storia: titolo e settimana obbligatori, settimana portata al lunedì", () => {
  assert.equal(normalizeArc({}).ok, false);
  const { ok, arc } = normalizeArc({ title: "Marco non molla", weekStart: "2026-10-22", status: "boh" });
  assert.equal(ok, true); assert.equal(arc.weekStart, "2026-10-19"); assert.equal(arc.status, "bozza");
});

t("link OnlyFans: pulsante o testo; giorni scoperti (anche quelli senza post)", () => {
  assert.equal(hasOfLink({ buttonUrl: "https://onlyfans.com/marty/c3" }), true);
  assert.equal(hasOfLink({ text: "di là: https://onlyfans.com/marty/c3" }), true);
  assert.equal(hasOfLink({ text: "onlyfans" }), false);
  const days = ["2026-10-19", "2026-10-20", "2026-10-21"];
  const posts = [
    { status: "bozza", sendAt: at("2026-10-19T21:30"), buttonUrl: "https://onlyfans.com/x" },
    { status: "programmato", sendAt: at("2026-10-20T09:30"), text: "buongiorno" },
    { status: "annullato", sendAt: at("2026-10-21T21:30"), buttonUrl: "https://onlyfans.com/x" }, // annullato non conta
  ];
  assert.deepEqual(dailyLinkGaps(posts, days), [{ day: "2026-10-20", planned: true }, { day: "2026-10-21", planned: false }]);
  // a mezzanotte e mezza di Roma è già il giorno dopo
  assert.equal(romeDayOf(at("2026-10-20T00:30")), "2026-10-20");
});

t("griglia: momento dall'ora o dallo slot esplicito; contenuti scartati fuori", () => {
  assert.equal(slotOfTime(at("2026-10-19T09:30")), "mattina");
  assert.equal(slotOfTime(at("2026-10-19T15:00")), "pomeriggio");
  assert.equal(slotOfTime(at("2026-10-19T21:30")), "sera");
  const g = editorialGrid(["2026-10-19"], [{ id: "a", day: "2026-10-19", status: "da_girare" }, { id: "b", day: "2026-10-19", status: "scartato" }],
    [{ id: "p1", status: "bozza", sendAt: at("2026-10-19T10:00") }, { id: "p2", status: "bozza", sendAt: at("2026-10-19T10:00"), slot: "sera" }]);
  assert.deepEqual(g[0].ig.map((x) => x.id), ["a"]);
  assert.deepEqual(g[0].tg.mattina.map((x) => x.id), ["p1"]);
  assert.deepEqual(g[0].tg.sera.map((x) => x.id), ["p2"]);
});

t("post Telegram: sondaggio valido, fissato, ruolo e storia; come si manda", () => {
  assert.match(normalizeTgPost({ poll: { question: "Gli rispondo?", options: ["Sì"] } }).errors[0], /almeno 2/);
  const { ok, post } = normalizeTgPost({ text: "Avete deciso voi.", poll: { question: "Gli rispondo?", options: ["Sì", "No", ""] }, pin: true, slot: "pomeriggio", role: "sondaggio", arcId: "arc1", buttonUrl: "https://onlyfans.com/x", buttonLabel: "Di là" });
  assert.equal(ok, true); assert.deepEqual(post.poll.options, ["Sì", "No"]); assert.equal(post.pin, true); assert.equal(post.arcId, "arc1");
  assert.deepEqual(sendPlan(post).map((s) => s.method), ["sendMessage", "sendPoll", "sendMessage"]); // testo, sondaggio, pulsante a parte
  assert.equal(sendPlan(post)[0].button, null);
  assert.deepEqual(sendPlan(normalizeTgPost({ poll: { question: "A o B?", options: ["A", "B"] } }).post).map((s) => s.method), ["sendPoll"]);
});

t("segnaposto non sostituito: non si approva; condizione salvata", () => {
  const future = Date.now() + 3600e3;
  const rv = { conformita: { outcome: "ok" }, qualita: { outcome: "ok" } };
  const { post } = normalizeTgPost({ text: "Il nome è {soprannome}.", condition: "Se vince «Sì»", sendAt: future, reviews: rv });
  assert.equal(post.condition, "Se vince «Sì»");
  assert.match(canApproveTg(post).reason, /\{soprannome\}/);
  assert.equal(canApproveTg({ ...post, text: "Il nome è il Ripetente." }).ok, true);
  assert.match(canApproveTg({ ...post, text: "ok", poll: { question: "Diamo il numero a {soprannome}?", options: ["Sì", "No"] } }).reason, /soprannome/);
});

console.log(`studio-editorial: ${n} gruppi di asserzioni ok`);
