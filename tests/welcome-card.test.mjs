// node tests/welcome-card.test.mjs
import assert from "node:assert/strict";
import { sanitizeWelcome, welcomeVars, composeWelcome, welcomeEmailHtml, DEFAULT_WELCOME } from "../src/lib/welcome-card.js";

const t = sanitizeWelcome({ heading: "", body: "Ciao {nome}\n\nsecondo {creator} {mese}", evil: "x", subject: 5 });
assert.equal(t.heading, DEFAULT_WELCOME.heading, "vuoto → default");
assert.equal(t.subject, DEFAULT_WELCOME.subject, "non stringa → default");
assert.ok(!("evil" in t), "campi ignoti scartati");
const v = welcomeVars({ employee: "Sara Marzo", creator: "Camilla ITA", number: 7, date: new Date(2026, 8, 29) });
assert.equal(v.nome, "Sara"); assert.equal(v.mese, "settembre 2026"); assert.equal(v.numero, "007");
const c = composeWelcome(t, v);
assert.deepEqual(c.paragraphs, ["Ciao Sara", "secondo Camilla ITA settembre 2026"]);
const h = welcomeEmailHtml(composeWelcome({ heading: "<script>x</script>" }, v), "https://x.test/?a=1&b=2");
assert.ok(!h.includes("<script>x"), "escape HTML");
assert.ok(h.includes("a=1&amp;b=2"), "link escapato");
assert.ok(!welcomeEmailHtml(c, null).includes("<a href"), "senza link niente bottone");
console.log("welcome-card: ok");
