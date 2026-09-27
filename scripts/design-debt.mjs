#!/usr/bin/env node
// Debito di design: quante pagine sono davvero sul design system (26/09/2026).
// Nato da un errore: il 26/09 avevo dichiarato "tutto chiuso" con ~80 pagine
// ancora sull'impianto vecchio. Il conteggio lo fa il sistema, non la memoria.
//
// Uso:  node scripts/design-debt.mjs            → riepilogo + pagine da fare
//       node scripts/design-debt.mjs --all      → anche le pagine allineate
//       node scripts/design-debt.mjs --json     → per script/controllo mattutino
//
// Una pagina è ALLINEATA se usa la testata del DS (PageHead da components/ds) e
// non ha i segni dell'impianto vecchio. Segni contati:
//   hex      colori scritti a mano (#rrggbb) → vanno sui token CP (eccezioni: email, attestato)
//   upper    etichette MAIUSCOLE spaziate (textTransform uppercase) → sentence case
//   bold     fontWeight 600/700/800 → 400/500
//   mono     numeri in FONTS.mono → cifre tabellari del font normale (NUM)
//   legacy   testata/card vecchie (PageHeader/StatCard/CpCard di cp-style)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const APP = path.join(ROOT, "src/app");
const SKIP = [/\/content-pipeline\//, /\/sign-in\//, /\/sign-up\//];
// Eccezioni dichiarate: colori fissi voluti (vedi commenti nei file)
const HEX_OK = [];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "page.js") out.push(p);
  }
  return out;
}

const count = (s, re) => (s.match(re) || []).length;
// Pagine che fanno solo redirect: nessuna UI da portare sul design system
const isRedirect = (f) => { const s = fs.readFileSync(f, "utf8"); return /\bredirect\(/.test(s) && !/<[A-Za-z]/.test(s); };
const rows = walk(APP)
  .filter((f) => !SKIP.some((re) => re.test(f)) && !isRedirect(f))
  .map((f) => {
    const s = fs.readFileSync(f, "utf8");
    const route = "/" + path.relative(APP, path.dirname(f)).split(path.sep).join("/");
    const sig = {
      hex: HEX_OK.includes(route) ? 0 : count(s, /["'`]#[0-9A-Fa-f]{6}\b/g),
      upper: count(s, /textTransform:\s*["']uppercase/g),
      bold: count(s, /fontWeight:\s*["']?(600|700|800)\b/g),
      mono: count(s, /FONTS\.mono/g),
      legacy: count(s, /<(PageHeader|StatCard|CpCard)\b/g),
    };
    const head = /from\s+["']@\/components\/ds["']/.test(s) && /<PageHead\b/.test(s);
    const marks = sig.hex + sig.upper + sig.bold + sig.mono + sig.legacy;
    const status = head && marks === 0 ? "allineata" : head ? "parziale" : "vecchia";
    return { route: route === "/." ? "/" : route, lines: s.split("\n").length, status, ...sig };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const by = (st) => rows.filter((r) => r.status === st);
const summary = {
  pagine: rows.length,
  allineate: by("allineata").length,
  parziali: by("parziale").length,
  vecchie: by("vecchia").length,
  righe_da_fare: rows.filter((r) => r.status !== "allineata").reduce((s, r) => s + r.lines, 0),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log(`Pagine ${summary.pagine}: allineate ${summary.allineate} · parziali ${summary.parziali} · vecchie ${summary.vecchie} · righe ancora da portare ${summary.righe_da_fare}`);
  const show = process.argv.includes("--all") ? rows : rows.filter((r) => r.status !== "allineata");
  for (const r of show) {
    const m = ["hex", "upper", "bold", "mono", "legacy"].filter((k) => r[k]).map((k) => `${k} ${r[k]}`).join(", ");
    console.log(`${r.status.padEnd(9)} ${r.route.padEnd(44)} ${String(r.lines).padStart(5)} righe  ${m}`);
  }
}
