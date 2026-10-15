// Unit test — live-creators (raggruppamento pagine → creator). Esegui: node tests/live-creators.mjs
import assert from "node:assert/strict";
import { buildLiveCreators, seesCreator, personOfPage, countryOfPage, slugOf, FALLBACK_PAGES } from "../src/lib/live-creators.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("persona e paese dall'alias", () => {
  assert.equal(personOfPage({ alias: "Fishball - IT" }), "Fishball");
  assert.equal(countryOfPage({ alias: "Fishball - EN" }), "EN");
  assert.equal(countryOfPage({ alias: "Cubanita", language: "ITA" }), "IT");
  assert.equal(countryOfPage({ alias: "Cubanita" }), null);
  assert.equal(personOfPage({ alias: null, name: "Elisa Vimercati🦋" }), "Elisa Vimercati");
});

t("due pagine della stessa persona → una creator con due account, IT prima", () => {
  const [c, ...rest] = buildLiveCreators([
    { id: 7560862, alias: "Fishball - EN", platform_id: 7560862, shifts14: 74 },
    { id: 160294962, alias: "Fishball - IT", platform_id: 160294962, shifts14: 100 },
  ]);
  assert.equal(rest.length, 0);
  assert.equal(c.slug, "fishball");
  assert.deepEqual(c.accounts.map((a) => [a.creator_id, a.country]), [[160294962, "IT"], [7560862, "EN"]]);
});

t("copia (stesso platform_id): si tiene quella con i turni, l'altra esce dichiarata", () => {
  const [c] = buildLiveCreators([
    { id: 1000000397, alias: "Elisa Vimercati", platform_id: 173440612, shifts14: 0 },
    { id: 173440612, alias: "Elisa Vimercati - IT", platform_id: 173440612, shifts14: 74, language: "ITA" },
  ]);
  assert.deepEqual(c.accounts.map((a) => a.creator_id), [173440612]);
  assert.equal(c.skipped.length, 1);
  assert.match(c.skipped[0].reason, /copia/);
});

t("paese mancante → dedotto sul primo libero, e dichiarato", () => {
  const [c] = buildLiveCreators([{ id: 1000000408, alias: "Cubanita", platform_id: 274442033 }]);
  assert.equal(c.accounts[0].country, "IT");
  assert.equal(c.accounts[0].guessed, true);
});

t("due pagine diverse nello stesso paese → ne entra una (la query ha un paese per account)", () => {
  const [c] = buildLiveCreators([
    { id: 1, alias: "Andie - IT", platform_id: 11, shifts14: 3 },
    { id: 2, alias: "Andie - IT", platform_id: 22, shifts14: 9 },
  ]);
  assert.deepEqual(c.accounts.map((a) => a.creator_id), [2]);
  assert.match(c.skipped[0].reason, /una per paese/);
});

t("pagine cancellate fuori", () => {
  const [c] = buildLiveCreators([{ id: 5, alias: "X - IT", platform_id: 5, deleted: true }]);
  assert.equal(c.accounts.length, 0);
});

t("visibilità: nome uguale, non 'contiene' (Giulia non vede tutte le Giulia)", () => {
  const amici = { name: "Giulia Amici" };
  assert.equal(seesCreator({ all: false, creators: new Set(["Giulia Amici"]) }, amici), true);
  assert.equal(seesCreator({ all: false, creators: new Set(["giulia  amici"]) }, amici), true);
  assert.equal(seesCreator({ all: false, creators: new Set(["Giulia"]) }, amici), false);
  assert.equal(seesCreator({ all: true }, amici), true);
  assert.equal(seesCreator({ all: false, creators: new Set() }, amici), false);
});

t("riserva: 12 creator, slug storici invariati (cache e obiettivi sono per slug)", () => {
  const list = buildLiveCreators(FALLBACK_PAGES);
  assert.equal(list.length, 12);
  for (const s of ["giulia-amici", "martina-scavo", "rebecca-bardaro", "cubanita", "fishball", "elisa-vimercati"]) assert.ok(list.some((c) => c.slug === s), s);
  assert.equal(slugOf("Rebecca Bardaro"), "rebecca-bardaro");
});

console.log(`ok — ${n} test`);
