// node tests/studio-giri.mjs — La redazione video di Regia social (logica pura).
import assert from "node:assert/strict";
import { TEAM, validateGiro, upsertGiro, teamTotals, funnel, teamWork, beatLine } from "../src/lib/studio-giri-core.js";

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error("✗", name); throw e; } };

const g6 = { n: 6, titolo: "Cosplay Spider-Man e Venom", day: "2026-11-05", montati: 6, tenuti: 4, revisioni: 3, scartati: [{ titolo: "S6-2 Captain Marvel", motivo: "viso magenta" }, { titolo: "S6-6", motivo: "gemello di S6-3" }] };
const g5 = { n: 5, titolo: "Primi piani e trasformazioni", day: "2026-11-05", montati: 16, tenuti: 8, revisioni: 2, scartati: [], fermati: [{ titolo: "K3 Noodles", motivo: "scollatura" }] };

t("la squadra va dal direttore creativo alla misura", () => {
  assert.deepEqual(TEAM.map((m) => m.id), ["direttore", "montaggio", "revisore", "scelta", "misura"]);
});

t("giro valido: pulito e con titolo", () => {
  const r = validateGiro({ ...g6, extra: 1, scartati: [...g6.scartati, { motivo: "senza titolo" }] });
  assert.equal(r.ok, true);
  assert.equal(r.giro.scartati.length, 2);
  assert.equal(r.giro.extra, undefined);
  assert.deepEqual(r.giro.fermati, []);
  assert.equal(validateGiro({ n: 2, day: "2026-11-01", montati: 3, tenuti: 3 }).giro.titolo, "Giro 2");
});

t("giro non valido: numero, data, conti che non tornano", () => {
  assert.equal(validateGiro({ day: "2026-11-05", montati: 1, tenuti: 1 }).ok, false);
  assert.equal(validateGiro({ n: 1, day: "5/11", montati: 1, tenuti: 1 }).ok, false);
  assert.equal(validateGiro({ n: 1, day: "2026-11-05", montati: 2, tenuti: 3 }).ok, false);
  assert.equal(validateGiro({ n: 1, day: "2026-11-05", montati: 3, tenuti: 2, scartati: [{ titolo: "a" }, { titolo: "b" }] }).ok, false);
  assert.equal(validateGiro({ n: 1, day: "2026-11-05", montati: -1, tenuti: 0 }).ok, false);
});

t("stesso numero si sovrascrive, ordine dal più recente", () => {
  const a = validateGiro(g5).giro, b = validateGiro(g6).giro;
  let list = upsertGiro(upsertGiro([], a), b);
  assert.deepEqual(list.map((g) => g.n), [6, 5]);
  list = upsertGiro(list, { ...a, tenuti: 9 });
  assert.equal(list.length, 2);
  assert.equal(list.find((g) => g.n === 5).tenuti, 9);
});

t("totali dell'ufficio", () => {
  const tt = teamTotals([validateGiro(g6).giro, validateGiro(g5).giro]);
  assert.deepEqual(tt, { giri: 2, montati: 22, tenuti: 12, scartati: 10, fermati: 1, revisioni: 5, primo: "2026-11-05", ultimo: "2026-11-05" });
  assert.equal(teamTotals([]).giri, 0);
});

t("percorso: dal montaggio al reel sopra il solito", () => {
  const banco = [{ state: "da_vedere" }, { state: "scelto" }, { state: "pronto" }, { state: "scartato" }];
  const esiti = [{ fileId: "a", ratio: 1.4 }, { fileId: "b", ratio: 0.6 }, { fileId: "c", ratio: null }, { fileId: null, ratio: 3 }, { fileId: "d", ratio: 2, video: { missing: true } }];
  const f = funnel({ giri: [validateGiro(g6).giro], banco, esiti });
  const by = Object.fromEntries(f.map((s) => [s.id, s]));
  assert.equal(by.montati.n, 6);
  assert.equal(by.tenuti.n, 4);
  assert.equal(by.banco.n, 4);
  assert.equal(by.scelti.n, 2);
  assert.equal(by.usciti.n, 3);
  assert.equal(by.sopra.n, 1);
  assert.equal(by.sopra.of, 2);
  // senza giri registrati montati/tenuti sono «non si sa», non zero
  assert.equal(funnel({ banco }).find((s) => s.id === "montati").n, null);
});

t("righe della squadra", () => {
  const w = teamWork({ giri: [validateGiro(g6).giro, validateGiro(g5).giro], banco: [{ state: "da_vedere" }, { state: "pronto" }], esiti: [{ fileId: "a", ratio: 1 }] });
  assert.equal(w.direttore, "2 giri di idee, 1 fermata prima del montaggio");
  assert.equal(w.montaggio, "22 video montati");
  assert.equal(w.revisore, "10 scartati su 22, 5 passaggi");
  assert.equal(w.scelta, "1 giudicato su 2");
  assert.equal(w.misura, "1 reel misurato");
  assert.deepEqual(teamWork({}), { direttore: null, montaggio: null, revisore: null, scelta: null, misura: null });
});

t("riga del battito per la Sede", () => {
  assert.equal(beatLine("fishballla", validateGiro(g6).giro), "@fishballla · Cosplay Spider-Man e Venom: 4 tenuti su 6 montati (2026-11-05)");
});

console.log(`studio-giri: ${n} prove ok`);
