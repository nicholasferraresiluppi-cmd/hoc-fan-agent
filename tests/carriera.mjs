// Unit test — carriera-core (funzioni pure). Esegui: node tests/carriera.mjs
// Copre le regole che decidono di persone: soglie delle fasce ai bordi, la revisione
// che parte SOLO con due mesi chiusi in C, l'eccezione che scade, le due firme diverse.
import assert from "node:assert/strict";
import {
  SOGLIE, fasciaOf, primaryProfile, triggerOf, statoOperatore, isoWeek,
  newReview, applyReviewStep, newException, isExceptionActive, newRoundtable, buildQuadro,
} from "../src/lib/carriera-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const NOW = Date.parse("2026-11-23T10:00:00Z"); // lunedì

t("fasce: bordi delle soglie e dati mancanti", () => {
  assert.equal(fasciaOf(SOGLIE.A), "A");
  assert.equal(fasciaOf(1.19), "B");
  assert.equal(fasciaOf(SOGLIE.C), "B"); // la soglia esatta è ancora B
  assert.equal(fasciaOf(SOGLIE.C - 0.001), "C");
  assert.equal(SOGLIE.C, 0.7); // v0.2, scelta di Nicholas il 23/11/2026
  assert.equal(fasciaOf(null), null);
  assert.equal(fasciaOf(undefined), null);
  assert.equal(fasciaOf(""), null); // Number("") = 0 non deve diventare C
  assert.equal(fasciaOf("abc"), null);
});

t("profilo principale = pagina con più ore, nome dalla mappa", () => {
  assert.deepEqual(primaryProfile({ 10: 0.3, 20: 0.7 }, { 20: "Gaja - IT" }), { cid: "20", name: "Gaja - IT", share: 0.7 });
  assert.equal(primaryProfile({}, {}), null);
  assert.equal(primaryProfile(null), null);
  assert.equal(primaryProfile({ 5: 1 }).name, "5"); // senza nome resta l'id
});

t("revisione: dovuta solo con C in entrambi i mesi chiusi", () => {
  assert.equal(triggerOf({ m2: 0.5, m1: 0.6 }), "dovuta");
  assert.equal(triggerOf({ m2: 0.9, m1: 0.6 }), "attenzione");
  assert.equal(triggerOf({ m2: 0.5, m1: 0.9 }), null); // il mese più vecchio da solo non conta
  assert.equal(triggerOf({ m2: null, m1: 0.5 }), "attenzione"); // un mese non valutabile non fa scattare
  assert.equal(triggerOf({ m2: 0.5, m1: null }), null);
});

t("stato: revisione aperta e eccezione hanno la precedenza giusta", () => {
  const due = { idx: 0.5, m2: 0.5, m1: 0.5 };
  assert.equal(statoOperatore(due), "revisione_dovuta");
  assert.equal(statoOperatore(due, { exceptionActive: true }), "eccezione");
  assert.equal(statoOperatore(due, { reviewOpen: true, exceptionActive: true }), "in_revisione");
  assert.equal(statoOperatore({ idx: null, m2: null, m1: null }), "non_valutabile");
  assert.equal(statoOperatore({ idx: 1.3, m2: 1.2, m1: 1.4 }), "ok");
  // l'eccezione non tocca chi non è in revisione dovuta
  assert.equal(statoOperatore({ idx: 1, m2: 1, m1: 1 }, { exceptionActive: true }), "ok");
});

t("settimana ISO in ora di Roma", () => {
  assert.equal(isoWeek(Date.parse("2026-11-23T10:00:00Z")), "2026-W48");
  assert.equal(isoWeek(Date.parse("2026-11-22T22:30:00Z")), "2026-W47"); // dom 23:30 a Roma (UTC+1 a novembre)
  assert.equal(isoWeek(Date.parse("2026-11-22T23:30:00Z")), "2026-W48"); // lun 00:30 a Roma
  assert.equal(isoWeek(Date.parse("2027-01-01T12:00:00Z")), "2026-W53"); // ven 1/1/2027 sta nell'ultima del 2026
  assert.equal(isoWeek(Date.parse("2026-01-01T12:00:00Z")), "2026-W01");
});

t("revisione: i passi vanno in ordine, l'esito vuole due firme diverse", () => {
  const o = newReview({ operator: "Mario Rossi", profile: "Gaja", trigger: { idx: 0.7, m2: 0.6, m1: 0.7 }, by: "rev", now: NOW, id: "r1" });
  assert.ok(o.ok);
  let r = o.review;
  assert.equal(r.fase, "colloquio");
  assert.equal(applyReviewStep(r, "piano", { obiettivi: ["x"] }, { by: "rev", now: NOW }).ok, false); // prima il colloquio
  assert.equal(applyReviewStep(r, "colloquio", { note: "corto" }, { by: "rev", now: NOW }).ok, false);
  r = applyReviewStep(r, "colloquio", { note: "Parlato dei prezzi PPV e degli orari." }, { by: "rev", now: NOW }).review;
  assert.equal(r.fase, "piano");
  assert.equal(o.review.fase, "colloquio"); // l'input non viene mutato
  r = applyReviewStep(r, "piano", { obiettivi: ["resa ≥ 0,9", "prezzo medio ≥ 20$", "terzo ignorato"] }, { by: "rev", now: NOW }).review;
  assert.equal(r.piano.obiettivi.length, 2);
  assert.equal(r.piano.fine, new Date(NOW + 42 * 86400000).toISOString());
  assert.equal(r.fase, "verifica");
  r = applyReviewStep(r, "verifica", { note: "A metà piano: resa 0,88." }, { by: "rev", now: NOW }).review;
  assert.equal(r.verifiche.length, 1);
  assert.equal(applyReviewStep(r, "esito", { tipo: "rientra", firma_revisore: "Anna", firma_coach: "" }).ok, false);
  assert.equal(applyReviewStep(r, "esito", { tipo: "rientra", firma_revisore: "Anna", firma_coach: "anna" }).ok, false);
  assert.equal(applyReviewStep(r, "esito", { tipo: "boh", firma_revisore: "Anna", firma_coach: "Ciro" }).ok, false);
  r = applyReviewStep(r, "esito", { tipo: "rientra", firma_revisore: "Anna", firma_coach: "Ciro" }, { by: "rev", now: NOW }).review;
  assert.equal(r.fase, "chiusa");
  assert.equal(applyReviewStep(r, "verifica", { note: "dopo la chiusura" }).ok, false);
  assert.equal(r.log.map((l) => l.what).join(","), "aperta,colloquio,piano,verifica,esito");
});

t("eccezione: motivo obbligatorio, massimo 31 giorni, poi scade", () => {
  assert.equal(newException({ operator: "Mario", motivo: "corto", giorni: 10 }).ok, false);
  assert.equal(newException({ operator: "Mario", motivo: "Sta imparando il profilo nuovo", giorni: 40 }).ok, false);
  const e = newException({ operator: "Mario", motivo: "Sta imparando il profilo nuovo", giorni: 10, now: NOW }).exception;
  assert.ok(isExceptionActive(e, NOW + 9 * 86400000));
  assert.ok(!isExceptionActive(e, NOW + 11 * 86400000));
  assert.ok(!isExceptionActive({ ...e, ended_at: new Date(NOW).toISOString() }, NOW));
});

t("roundtable: cosa si è visto e la prova sono obbligatori", () => {
  assert.equal(newRoundtable({ profile: "Gaja", visto: "", prova: "massa alle 6" }).ok, false);
  const rt = newRoundtable({ profile: "Gaja", presenti: "4", visto: "Chat riuscita su un fan nuovo", prova: "Massa alle 6 per 2 settimane", now: NOW }).roundtable;
  assert.equal(rt.week, "2026-W48");
  assert.equal(rt.presenti, 4);
});

t("quadro: filtro per profilo, aggancio di revisioni ed eccezioni, conteggi coerenti", () => {
  const L = "2026-11-20";
  const rows = [
    { name: "Ada", idx: 1.3, m2: 1.2, m1: 1.4, crs: { 1: 0.9, 2: 0.1 }, last_shift: L },
    { name: "Bea", idx: 0.5, m2: 0.5, m1: 0.6, crs: { 1: 1 }, last_shift: L },
    { name: "Cleo", idx: 0.6, m2: 0.5, m1: 0.6, crs: { 2: 1 }, last_shift: L },
    { name: "Dino", idx: null, m2: null, m1: null, crs: { 2: 1 }, last_shift: L },
    { name: "Ezio", idx: 1, m2: 0.6, m1: 0.6, crs: { 3: 1 }, last_shift: L },
    { name: "Fermo", idx: 0.2, m2: 0.2, m1: 0.2, crs: { 1: 1 }, last_shift: "2026-10-18" }, // fuori: niente turni da 5 settimane
    { name: "Senza data", idx: 0.2, m2: 0.2, m1: 0.2, crs: { 1: 1 } },
  ];
  const names = { 1: "Gaja", 2: "Eva", 3: "Elisa" };
  const reviews = [{ id: "r1", key: "cleo", fase: "piano" }, { id: "r0", key: "ada", fase: "chiusa" }];
  const exceptions = newException({ operator: "Ezio", motivo: "Rientra da un mese di malattia", giorni: 20, now: NOW }).exception;
  const rts = [{ profile: "Gaja", week: "2026-W48" }, { profile: "Eva", week: "2026-W47" }];
  const q = buildQuadro({ rows, names, reviews, exceptions: [exceptions], roundtables: rts, now: NOW });
  const by = Object.fromEntries(q.operators.map((o) => [o.name, o]));
  assert.equal(by.Ada.stato, "ok"); // revisione chiusa non conta
  assert.equal(by.Bea.stato, "revisione_dovuta");
  assert.equal(by.Cleo.stato, "in_revisione");
  assert.equal(by.Dino.stato, "non_valutabile");
  assert.equal(by.Ezio.stato, "eccezione");
  assert.equal(q.operators[0].name, "Cleo"); // in revisione in cima
  assert.deepEqual(q.counts, { A: 1, B: 1, C: 2, nv: 1, dovute: 1, attenzione: 0, in_revisione: 1, eccezioni: 1, fermi: 2 });
  assert.ok(!q.operators.some((o) => o.name === "Fermo")); // chi non lavora non finisce in revisione
  assert.equal(q.counts.A + q.counts.B + q.counts.C + q.counts.nv, q.operators.length);
  const gaja = q.profiles.find((p) => p.profile === "Gaja");
  assert.equal(gaja.roundtable, true);
  assert.equal(q.profiles.find((p) => p.profile === "Eva").roundtable, false); // quella della settimana scorsa non vale
  const soloEva = buildQuadro({ rows, names, allow: (p) => p === "Eva", now: NOW });
  assert.deepEqual(soloEva.operators.map((o) => o.name).sort(), ["Cleo", "Dino"]);
});

console.log(`carriera: ${n} gruppi di asserzioni ok`);
