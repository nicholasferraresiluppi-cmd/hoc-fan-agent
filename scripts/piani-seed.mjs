// Carica (o aggiorna) un piano in KV. Le spunte stanno in un'altra chiave e restano.
// Uso: node --env-file=.env.local scripts/piani-seed.mjs social [--force]
// Dal 30/10 i piani si modificano dall'editor in /admin/piani: se il piano c'è già non si
// sovrascrive (si perderebbero le modifiche fatte in app), a meno di --force.
import { kv } from "@vercel/kv";
import { normalizePlan } from "../src/lib/piani-core.js";

const name = process.argv[2] || "social";
const mod = await import(`../src/data/piani/${name}.js`);
const def = Object.values(mod)[0];
const r = normalizePlan(def);
if (r.ok && !process.argv.includes("--force") && (await kv.exists(`piani:p:${r.plan.id}`))) { console.error(`«${r.plan.title}» c'è già: si modifica da /admin/piani (o --force per sovrascriverlo)`); process.exit(1); }
if (!r.ok) { console.error(r.errors.join("\n")); process.exit(1); }
await kv.set(`piani:p:${r.plan.id}`, r.plan);
await kv.sadd("piani:index", r.plan.id);
const items = r.plan.phases.flatMap((p) => p.items);
console.log(`piano «${r.plan.title}»: ${r.plan.phases.length} fasi, ${items.length} voci (${items.filter((i) => i.auto).length} automatiche)`);
