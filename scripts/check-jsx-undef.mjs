#!/usr/bin/env node
// Componenti JSX usati ma mai definiti/importati: la build di Next NON li vede e
// la pagina si rompe solo quando la apri (React #130). eslint no-undef nemmeno,
// senza il plugin React. Uso: node scripts/check-jsx-undef.mjs [file…] (default: tutte le page.js)
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, o) : /\.js$/.test(e.name) && o.push(p); } return o; };
const files = process.argv.slice(2).length ? process.argv.slice(2) : walk(path.join(ROOT, "src/app")).filter((f) => f.endsWith("page.js"));
let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const used = new Set([...s.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s>/.]/g)].map((m) => m[1]));
  const defined = new Set();
  for (const m of s.matchAll(/import\s+([\s\S]*?)\s+from\s+["']/g)) for (const n of m[1].replace(/[{}*]/g, " ").split(/[\s,]+/)) if (n && n !== "as") defined.add(n);
  for (const m of s.matchAll(/\b(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)/g)) defined.add(m[1]);
  for (const m of s.matchAll(/\{\s*([^}]*)\}\s*=\s*/g)) for (const n of m[1].split(/[\s,:]+/)) defined.add(n);
  // rinomina in destrutturazione/parametri: ({ icon: Icon }) , .map(({ icon: I }) => …)
  for (const m of s.matchAll(/\b[a-z]\w*\s*:\s*([A-Z][A-Za-z0-9_]*)\s*[,}=]/g)) defined.add(m[1]);
  const missing = [...used].filter((n) => !defined.has(n) && n !== "React" && n !== "Fragment");
  if (missing.length) { bad++; console.log(`${path.relative(ROOT, f)}: ${missing.join(", ")}`); }
}
console.log(bad ? `${bad} file con componenti non definiti` : `ok: ${files.length} file, nessun componente JSX non definito`);
process.exit(bad ? 1 : 0);
