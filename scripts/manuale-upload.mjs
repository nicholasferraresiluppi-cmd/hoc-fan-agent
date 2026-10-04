// Carica i documenti del manuale vendite nel KV (non nel repo: contengono estratti di chat reali).
// Uso: node --env-file=.env.local scripts/manuale-upload.mjs <cartella>
// La cartella contiene i file HTML; titoli e ordine sono qui sotto.
import { createClient } from "@vercel/kv";
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2];
if (!dir) { console.error("cartella mancante"); process.exit(1); }
const kv = createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const DOCS = [
  { file: "capitolo-1-nuovo-iscritto.html", slug: "cap-1-nuovo-iscritto", title: "Capitolo 1 · Il nuovo iscritto", kind: "Manuale", order: 1 },
  { file: "capitolo-2-primo-acquisto.html", slug: "cap-2-primo-acquisto", title: "Capitolo 2 · Il primo acquisto", kind: "Manuale", order: 2 },
  { file: "capitolo-3-dopo-acquisto.html", slug: "cap-3-dopo-acquisto", title: "Capitolo 3 · Dopo l'acquisto", kind: "Manuale", order: 3 },
  { file: "guida-martina-scavo.html", slug: "guida-martina-scavo", title: "Guida di profilo · Martina Scavo", kind: "Guida di profilo", order: 10 },
];
const index = (await kv.get("manuale:docs")) || [];
for (const d of DOCS) {
  const p = path.join(dir, d.file);
  if (!fs.existsSync(p)) { console.log("manca", d.file); continue; }
  const html = fs.readFileSync(p, "utf8");
  await kv.set(`manuale:doc:${d.slug}`, html);
  const i = index.findIndex((x) => x.slug === d.slug);
  const rec = { slug: d.slug, title: d.title, kind: d.kind, order: d.order, updated_at: Date.now(), bytes: html.length };
  if (i >= 0) index[i] = rec; else index.push(rec);
  console.log("caricato", d.slug, html.length, "byte");
}
await kv.set("manuale:docs", index);
