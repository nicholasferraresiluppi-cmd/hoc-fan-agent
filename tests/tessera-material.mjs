// node tests/tessera-material.mjs — materia della tessera (versione C, 03/10/2026)
import assert from "node:assert/strict";
import { guillochePaths, guillocheDataUri, tiltFrom, GRAIN_DATA_URI, MAT_W, MAT_H } from "../src/lib/tessera-material.js";

const a = guillochePaths(), b = guillochePaths();
assert.equal(a.length, 46, "20 onde + 26 anelli della rosetta");
assert.deepEqual(a, b, "deterministica: schermo e PNG disegnano la stessa trama");
for (const p of a) {
  assert.match(p.d, /^M[\d.,LZ-]+$/, "tracciato SVG valido");
  assert.ok(p.alpha > 0 && p.alpha < 0.2, "trama discreta");
  for (const [, x, y] of p.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) { assert.ok(+x >= -1 && +x <= MAT_W + 1); assert.ok(+y >= -12 && +y <= MAT_H + 12); }
}
assert.ok(guillocheDataUri().startsWith("data:image/svg+xml,"));
assert.equal(guillocheDataUri(), guillocheDataUri(), "calcolata una volta");
assert.ok(guillocheDataUri().length < 80000, "peso contenuto");
assert.ok(GRAIN_DATA_URI.startsWith("data:image/svg+xml,"));
assert.deepEqual(tiltFrom(0.5, 0.5), { rx: 0, ry: 0, mx: 50, my: 50 }, "al centro è piatta");
assert.deepEqual(tiltFrom(1, 0), { rx: 8, ry: 10, mx: 100, my: 0 });
assert.deepEqual(tiltFrom(-3, 9), tiltFrom(0, 1), "fuori dalla tessera: si ferma al bordo");
console.log("tessera-material: ok");
