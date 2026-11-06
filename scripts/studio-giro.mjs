// La redazione video — registra un giro di montaggio finito (o tutti quelli di un file).
// Uso: node --env-file=.env.local scripts/studio-giro.mjs <profileId> <giro.json> [--dry]
// Il file è un giro o un array di giri:
//   { n, titolo, day, cartella, montati, tenuti, revisioni, scartati: [{ titolo, motivo }], fermati: [{ titolo, motivo }] }
// Lo stesso numero di giro si sovrascrive: si può correggere rilanciando.
import { readFileSync } from "node:fs";
import { kv } from "@vercel/kv";
import { validateGiro } from "../src/lib/studio-giri-core.js";
import { recordGiro } from "../src/lib/studio-giri.js";

const [pid, file, flag] = process.argv.slice(2);
if (!pid || !file) { console.error("uso: scripts/studio-giro.mjs <profileId> <giro.json> [--dry]"); process.exit(1); }
const profiles = (await kv.get("studio:profiles")) || [];
const profile = (Array.isArray(profiles) ? profiles : Object.values(profiles)).find((p) => p?.id === pid);
if (!profile) { console.error(`profilo ${pid} non trovato in Regia social`); process.exit(1); }
const raw = JSON.parse(readFileSync(file, "utf8"));
const list = Array.isArray(raw) ? [...raw].sort((a, b) => a.n - b.n) : [raw];
for (const g of list) {
  const v = validateGiro(g);
  if (!v.ok) { console.error(`giro ${g?.n}: ${v.error}`); process.exit(1); }
  if (flag === "--dry") { console.log("ok (prova)", v.giro.n, v.giro.titolo, `${v.giro.tenuti}/${v.giro.montati}`); continue; }
  const r = await recordGiro(pid, profile.handle, g);
  console.log("registrato", r.giro.n, r.giro.titolo, `${r.giro.tenuti}/${r.giro.montati}`);
}
