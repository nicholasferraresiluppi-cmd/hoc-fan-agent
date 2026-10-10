// Ogni voce /admin del menu deve avere la sua regola in lib/nav-access (senza regola = visibile a TUTTI).
// Nato dal giro per persona (10/10/2026): «Controllo contratti» era nel menu degli operatori e rispondeva 403.
import fs from "node:fs";
import assert from "node:assert/strict";
const side = fs.readFileSync(new URL("../src/components/Sidebar.js", import.meta.url), "utf8");
const nav = fs.readFileSync(new URL("../src/lib/nav-access.js", import.meta.url), "utf8");
// pagine admin senza API protetta (statiche o redirect): visibili a tutti di proposito
const OPEN = new Set(["/admin/fan-archetypes", "/admin/creators"]);
const hrefs = [...new Set([...side.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map((m) => m[1]))];
const missing = hrefs.filter((h) => !OPEN.has(h) && !nav.includes(`"${h}"`));
assert.deepEqual(missing, [], `Voci del menu senza regola in nav-access: ${missing.join(", ")}`);
console.log(`nav-access-coverage: ${hrefs.length} voci admin coperte`);
