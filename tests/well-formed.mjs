import assert from "node:assert/strict";
import { wellFormedString, wellFormedDeep } from "../src/lib/well-formed.js";

const half = "ciao 😘".slice(0, 6); // "ciao " + surrogato alto solitario
assert.equal(wellFormedString(half), "ciao �");
assert.equal(wellFormedString("ok 😘 ok"), "ok 😘 ok");
assert.equal(wellFormedString("\uDE18x"), "�x");
const hit = { n: 0 };
const out = wellFormedDeep({ a: [half, 1, null, { [half]: true }], b: "pulito", c: 3 }, hit);
assert.equal(hit.n, 2);
assert.deepEqual(out, { a: ["ciao �", 1, null, { "ciao �": true }], b: "pulito", c: 3 });
// il JSON risultante non contiene più escape di surrogati solitari
assert.ok(!/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i.test(JSON.stringify(out)));
const clean = { x: "😘", y: [1, 2] };
const h2 = { n: 0 };
assert.deepEqual(wellFormedDeep(clean, h2), clean);
assert.equal(h2.n, 0);
console.log("well-formed: ok");
