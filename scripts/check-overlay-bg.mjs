#!/usr/bin/env node
// Pannelli che galleggiano (position fixed/absolute + zIndex) con fondo semitrasparente (10/10/2026).
// Nato da un errore: nello stile "Casa" CP.surface / CP.surfaceAlt / CP.heroBg sono velature
// (rgba o transparent), giuste per le schede sulla pagina; un pannello sopra altro contenuto si
// legge in trasparenza (il calendario di Analisi vendite). I pannelli che galleggiano usano CP.panel,
// pieno in tutti e quattro gli stili.
// Uso: node scripts/check-overlay-bg.mjs  → elenco + exit 1 se ne trova
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
})(path.join(ROOT, "src"));

const FLOAT = /position:\s*["'](fixed|absolute)["']/;
const Z = /zIndex:\s*\d/;
const SEE_THROUGH = /background:\s*CP\.(surface|surfaceAlt|heroBg)\b/;
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => {
    // un oggetto stile sta quasi sempre su una o due righe: si guarda la riga e la successiva
    const s = l + (lines[i + 1] || "");
    if (FLOAT.test(l) && Z.test(s) && SEE_THROUGH.test(s)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
  });
}
if (hits.length) {
  console.log(`Pannelli che galleggiano con fondo semitrasparente (usa CP.panel): ${hits.length}`);
  for (const h of hits) console.log(`  ${h}`);
  process.exit(1);
}
console.log("ok: nessun pannello che galleggia con fondo semitrasparente");
