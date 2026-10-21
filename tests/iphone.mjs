// Controlli iPhone: quello che un browser automatico non vede (rimbalzo, zona della linea Home).
// Nato il 21/10/2026: senza viewport-fit=cover tutti gli env(safe-area-inset-*) valevano 0 e sotto
// la barra delle schede restava una striscia vuota; la pagina intera rimbalzava. Gira in CI (iphone.yml).
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const problems = [];

// 1. viewport: senza "cover" le distanze dalla linea Home valgono 0 ovunque
if (!/viewportFit:\s*"cover"/.test(read("src/app/layout.js"))) problems.push('src/app/layout.js: manca viewportFit: "cover" nel viewport');

// 2. niente rimbalzo della pagina intera
const css = read("src/app/globals.css");
const htmlRule = css.match(/(^|\n)html\s*\{[^}]*\}/);
if (!htmlRule || !/overscroll-behavior:\s*none/.test(htmlRule[0])) problems.push("src/app/globals.css: html senza overscroll-behavior: none");

// 3. elementi fissi ancorati in basso: devono tenere conto della linea Home (env(safe-area-inset-bottom),
//    nella distanza o nel padding). Quelli ancorati anche in alto (top/inset) sono pannelli a tutta altezza.
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx|css)$/.test(f)) files.push(p);
  }
})(path.join(root, "src"));

let fixedBottom = 0;
for (const file of files) {
  // ${...} dentro i template rompe la ricerca degli oggetti di stile: si sostituisce (stessa riga)
  const src = fs.readFileSync(file, "utf8").replace(/\$\{[^{}]*\}/g, "X");
  const rel = path.relative(root, file);
  for (const m of src.matchAll(/\{[^{}]*\}/g)) {
    const c = m[0];
    if (!/position:\s*["']?fixed/.test(c)) continue;
    if (!/(?<![-\w])bottom:/.test(c) || /(?<![-\w])(top|inset):/.test(c)) continue;
    fixedBottom++;
    const line = src.slice(0, m.index).split("\n").length;
    if (!/safe-area-inset-bottom/.test(c)) problems.push(`${rel}:${line}: elemento fisso in basso senza env(safe-area-inset-bottom)`);
    // 4. avvisi centrati in basso: sul telefono devono stare sopra la barra delle schede (classe hoc-dock)
    if (/left:\s*"50%"/.test(c) && !/hoc-dock/.test(src.slice(Math.max(0, m.index - 160), m.index))) {
      problems.push(`${rel}:${line}: avviso fisso in basso senza className="hoc-dock" (finisce sopra la barra delle schede)`);
    }
  }
}

assert.deepEqual(problems, [], "Controlli iPhone:\n  " + problems.join("\n  "));
console.log(`iphone: viewport e rimbalzo ok, ${fixedBottom} elementi fissi in basso controllati`);
