// Unit test — Piani di lavoro (piani-core). Esegui: node tests/piani.mjs
import assert from "node:assert/strict";
import { newId, AUTO_TYPES, AUTO_FIELDS, normalizePlan, itemStatus, evaluatePlan, currentPhase, openItemsFor, dueLabel, shortDay, coveredDays } from "../src/lib/piani-core.js";
import { SOCIAL_PLAN } from "../src/data/piani/social.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// validazione
ok(!normalizePlan({ title: "x", phases: [{ title: "a" }] }).ok, "senza id");
ok(!normalizePlan({ id: "p", title: "x", phases: [] }).ok, "senza fasi");
ok(!normalizePlan({ id: "p", title: "x", phases: [{ title: "a", items: [{ text: "v", auto: { type: "boh" } }] }] }).ok, "tipo automatico sconosciuto");
ok(!normalizePlan({ id: "p", title: "x", phases: [{ title: "a", items: [{ id: "v", text: "1" }, { id: "v", text: "2" }] }] }).ok, "voce ripetuta");
const np = normalizePlan({ id: "Prova 1", title: "Prova", phases: [{ title: "Fase", due: "2026-11-03", items: [{ text: "voce", due: "3/11" }] }] });
eq([np.plan.id, np.plan.phases[0].id, np.plan.phases[0].items[0].id, np.plan.phases[0].items[0].due], ["prova-1", "fase-1", "fase-1-1", null], "id e date ripuliti");

// stato di una voce
const T = "2026-11-02";
eq(itemStatus({ id: "a", due: "2026-11-01" }, null, null, T).late, true, "manuale scaduta = in ritardo");
eq(itemStatus({ id: "a", due: "2026-11-01" }, { done: { at: 1, by: "Luis" } }, null, T), { done: true, late: false, via: "mano", by: "Luis", at: 1, answer: null, auto: null }, "spuntata a mano");
const au = { id: "b", auto: { type: "radar_profiles" } };
eq(itemStatus(au, null, { ok: true, value: 6, target: 5 }, T).via, "dati", "automatica chiusa dai dati");
eq(itemStatus(au, null, { ok: false, value: 2, target: 5 }, T).done, false, "automatica aperta");
eq(itemStatus(au, null, undefined, T).auto.label, "dato non disponibile", "automatica senza dato non si chiude");
eq(itemStatus(au, { done: { at: 2, by: "N" } }, { ok: false }, T).via, "mano", "la spunta a mano vince sui dati");
const q = { id: "c", ask: true };
eq(itemStatus(q, { answer: "  " }, null, T).done, false, "risposta vuota non chiude");
eq(itemStatus(q, { answer: "40 minuti", answerBy: "Luis" }, null, T).via, "risposta", "domanda chiusa dalla risposta");

// piano valutato
const plan = normalizePlan({
  id: "p", title: "P", people: ["Luis", "Nicholas"], phases: [
    { id: "f1", title: "Uno", due: "2026-11-01", items: [{ id: "a", text: "a", who: "Luis" }, { id: "b", text: "b", who: "Nicholas" }] },
    { id: "f2", title: "Due", due: "2026-11-05", items: [{ id: "c", text: "c", who: "Luis", due: "2026-11-04" }, { id: "d", text: "d" }] },
    { id: "dec", title: "Decisione", kind: "decision", due: "2026-11-04", items: [{ id: "e", text: "e" }] },
  ],
}).plan;
const ev = evaluatePlan(plan, { a: { done: { at: 1, by: "Luis" } } }, {}, T);
eq(ev.progress, { done: 1, total: 5, late: 1, pct: 20 }, "avanzamento: b in ritardo (senza data sua scade con la fase)");
ok(ev.phases[0].overdue && !ev.phases[1].overdue, "fase scaduta e non completa");
eq(currentPhase(ev).id, "f1", "fase di adesso = prima non completa");
eq(openItemsFor(ev, "Luis Rossi").map((x) => x.id), ["c", "d"], "di Luis: le sue + quelle senza nome, mai le condizioni");
eq(openItemsFor(ev, "luis.aguilar@houseofcreators.com").map((x) => x.id), ["c", "d"], "nome = email: si riconosce lo stesso");
eq(openItemsFor(ev, "Nicholas").map((x) => x.id), ["b", "d"], "di Nicholas");
eq(openItemsFor(ev, "Ilaria").map((x) => x.id), ["b", "c", "d"], "chi non è nel piano vede tutto il lavoro aperto");
eq(openItemsFor(ev, "Luis")[0].due, "2026-11-04", "la data della voce prima di quella della fase");
const late = evaluatePlan(plan, {}, {}, "2026-11-05");
eq(openItemsFor(late, "Luis").map((x) => [x.id, x.status.late]), [["a", true], ["c", true], ["d", false]], "le voci in ritardo per prime");

// etichette
eq([dueLabel("2026-11-02", T), dueLabel("2026-11-03", T), dueLabel("2026-11-01", T), dueLabel("2026-10-30", T), dueLabel("2026-11-04", T)],
  ["oggi", "domani", "in ritardo di 1 giorno", "in ritardo di 3 giorni", "entro mer 4/11"], "scadenze");
eq(shortDay("2026-11-03"), "mar 3/11", "giorno corto");
eq(coveredDays(["2026-11-02", "2026-11-03", "2026-11-05"], T), 2, "giorni consecutivi coperti (il buco ferma il conto)");
eq(coveredDays([], T), 0, "niente calendario");

// editor: spostare o riscrivere una voce non sposta la spunta
const base = { id: "e", title: "E", phases: [{ id: "f", title: "F", items: [{ id: "x1", text: "uno" }, { id: "x2", text: "due" }] }] };
const st = { x1: { done: { at: 1, by: "L" } } };
const moved = normalizePlan({ ...base, phases: [{ ...base.phases[0], items: [{ id: "x2", text: "due" }, { id: "x1", text: "uno, riscritta" }] }] }).plan;
const evm = evaluatePlan(moved, st, {}, T);
eq(evm.phases[0].items.map((i) => [i.id, i.status.done]), [["x2", false], ["x1", true]], "spunta segue la voce spostata e riscritta");
const a1 = newId(), a2 = newId();
ok(a1 !== a2 && /^v-/.test(a1), "id nuovi diversi");
eq(normalizePlan({ ...base, phases: [{ id: "f", title: "F", items: [{ id: a1, text: "nuova" }] }] }).plan.phases[0].items[0].id, a1, "id dell'editor conservato");
eq(normalizePlan({ ...base, phases: [{ id: "f", title: "F", items: [{ id: "z", text: "auto", auto: { type: "radar_profiles", country: "", min: "3" } }] }] }).plan.phases[0].items[0].auto, { type: "radar_profiles", country: "", min: "3" }, "parametri dell'editor passano");
ok(Object.keys(AUTO_TYPES).every((k) => Array.isArray(AUTO_FIELDS[k])), "ogni controllo automatico ha i suoi campi nell'editor");
eq(normalizePlan({ ...base, archived: true }).plan.archived, true, "archiviazione");

// il piano Social vero è valido
const soc = normalizePlan(SOCIAL_PLAN);
ok(soc.ok, "piano Social valido: " + (soc.errors || []).join(", "));
ok(soc.plan.phases.some((p) => p.kind === "decision" && p.due === "2026-11-04"), "decisione del 4/11");
ok(soc.plan.phases.flatMap((p) => p.items).some((i) => i.auto?.type === "radar_profiles"), "voce automatica sul Radar");

console.log(`piani: ${n} verifiche ok`);
