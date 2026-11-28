// Pagine nascoste (lib/hidden-pages, 28/11/2026): spariscono da menu/hub/ricerca per tutti,
// senza trascinarsi dietro le pagine vicine, e chi ci arriva torna a una pagina che può aprire.
import fs from "node:fs";
import assert from "node:assert/strict";
import { HIDDEN_PAGES, isHiddenHref, landingFor } from "../src/lib/hidden-pages.js";
import { canSee } from "../src/lib/nav-access.js";
import { getFunnel } from "../src/lib/role-funnels.js";

// 1. ogni pagina nascosta esiste davvero (un refuso nasconderebbe niente)
for (const { href } of HIDDEN_PAGES) {
  const file = new URL(`../src/app${href === "/" ? "" : href}/page.js`, import.meta.url);
  assert.ok(fs.existsSync(file), `pagina nascosta inesistente: ${href}`);
}
assert.equal(new Set(HIDDEN_PAGES.map((p) => p.href)).size, HIDDEN_PAGES.length, "voci doppie");

// 2. confronto esatto: le pagine vicine restano
assert.ok(isHiddenHref("/leaderboard") && isHiddenHref("/leaderboard/") && isHiddenHref("/") && isHiddenHref("/admin/loop?x=1"));
for (const h of ["/leaderboard/sales-cp", "/leaderboard/creators/heatmap", "/leaderboard/operational/Mario", "/admin/hr", "/admin", "/me/contestazioni", "/admin/sessions/abc"]) {
  assert.equal(isHiddenHref(h), false, `${h} non deve essere nascosta`);
}

// 3. canSee: nascoste per tutti, admin compreso (l'admin le ritrova solo nel gruppo «Nascoste»)
const adminCaps = {};
for (const { href } of HIDDEN_PAGES) assert.equal(canSee(href, adminCaps, true), false, `admin vede ${href} nel menu`);
assert.equal(canSee("/admin/bilancio", adminCaps, true), true);

// 4. dove si atterra
const sm = (h) => canSee(h, { "scores.view": "team", "analytics.view": "team" }, false);
const op = (h) => canSee(h, { "scores.view": "own" }, false);
const ad = (h) => canSee(h, {}, true);
assert.equal(landingFor(sm, "/admin/settimana"), "/admin/bilancio", "sales manager: la home Da seguire è nascosta");
assert.equal(landingFor(op, null), "/me/score", "operatore");
assert.equal(landingFor(ad, "/admin"), "/admin", "admin");
assert.equal(landingFor(() => false, null), "/welcome", "nessuna pagina: benvenuto");

// 5. la guida non manda su pagine nascoste
for (const k of ["operator", "manager", "leadership", "people"]) {
  const f = getFunnel(k);
  for (const s of [...f.steps, ...(f.checklist || [])]) assert.ok(!s.href || !isHiddenHref(s.href), `guida ${k} → ${s.href}`);
}

console.log(`hidden-pages: ${HIDDEN_PAGES.length} pagine nascoste, controlli ok`);
