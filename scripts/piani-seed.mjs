// Carica (o aggiorna) un piano in KV. Le spunte stanno in un'altra chiave e restano.
// Uso: node --env-file=.env.local scripts/piani-seed.mjs social
import { kv } from "@vercel/kv";
import { normalizePlan } from "../src/lib/piani-core.js";

const name = process.argv[2] || "social";
const mod = await import(`../src/data/piani/${name}.js`);
const def = Object.values(mod)[0];
const r = normalizePlan(def);
if (!r.ok) { console.error(r.errors.join("\n")); process.exit(1); }
await kv.set(`piani:p:${r.plan.id}`, r.plan);
await kv.sadd("piani:index", r.plan.id);
const items = r.plan.phases.flatMap((p) => p.items);
console.log(`piano «${r.plan.title}»: ${r.plan.phases.length} fasi, ${items.length} voci (${items.filter((i) => i.auto).length} automatiche)`);
