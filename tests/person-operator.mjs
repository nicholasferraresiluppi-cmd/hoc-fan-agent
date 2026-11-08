// Unit test — person-operator-core (collegamento scheda CRM → operatore). Esegui: node tests/person-operator.mjs
import assert from "node:assert/strict";
import { operatorCandidates, findCandidate, validateOperatorLink, suggestOperator, cpMembersFor, suggestionKind, expectsCpShifts, bulkSuggestions } from "../src/lib/person-operator-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── elenco dei nomi: roster ufficiale + chi ha venduto di recente, un nome per persona ──
const cands = operatorCandidates(
  [{ employeeId: 11, employeeName: "Sara Rossi" }, { employeeId: "12", employeeName: "Marco Bianchi" }, { employeeName: "" }],
  ["sara rossi", "Luca Neri", "  "],
);
eq(cands, [{ name: "Luca Neri", employeeId: null }, { name: "Marco Bianchi", employeeId: "12" }, { name: "Sara Rossi", employeeId: "11" }], "roster prima (con id), poi i nomi KPI non doppi");
eq(findCandidate(cands, "SARA  rossì")?.name, "Sara Rossi", "stesso nome a meno di maiuscole, accenti e spazi");
eq(findCandidate(cands, "Sara"), null, "mai un nome a metà");

// ── salvataggio: nome dell'elenco, una sola scheda per nome ──
eq(validateOperatorLink({ personId: "p1", inflowwName: "", candidates: cands }).error, "Scegli il nome dell'operatore su Infloww");
ok(/non è tra gli operatori/.test(validateOperatorLink({ personId: "p1", inflowwName: "Pinco", candidates: cands }).error), "nome inventato rifiutato");
eq(validateOperatorLink({ personId: "p1", inflowwName: "marco bianchi", candidates: cands }).value, { inflowwName: "Marco Bianchi", employeeId: "12" }, "si salva il nome com'è su Infloww, con l'id");
const taken = validateOperatorLink({ personId: "p1", inflowwName: "Marco Bianchi", candidates: cands, links: { p2: { inflowwName: "Marco Bianchi" } }, names: { p2: "Marco B." } });
ok(/già collegato alla scheda di Marco B\./.test(taken.error), taken.error);
ok(validateOperatorLink({ personId: "p2", inflowwName: "Marco Bianchi", candidates: cands, links: { p2: { inflowwName: "Marco Bianchi" } } }).value, "ricollegare la stessa scheda va bene");

// ── suggerimento: solo se univoco e libero ──
eq(suggestOperator("Sara Rossi", cands)?.name, "Sara Rossi", "nome e cognome uguali");
eq(suggestOperator("Rossi Sara", cands)?.name, "Sara Rossi", "ordine invertito");
eq(suggestOperator("Sara Rossi", cands, { p9: { inflowwName: "Sara Rossi" } }), null, "già presa da un'altra scheda: niente");
eq(suggestOperator("Sara", cands), null, "un nome solo non basta");
const twins = operatorCandidates([], ["Anna Russo", "Anna Russo ES"]);
eq(twins.length, 2, "«Anna Russo» e «Anna Russo ES» sono due account Infloww: si sceglie quale");
eq(suggestOperator("Anna Russo", twins), null, "due account possibili: nessun suggerimento, sceglie l'HR");
eq(suggestOperator("Giulia Ferri", operatorCandidates([], ["Giulia Ferri Bassi", "Giulia Ferri Conti"])), null, "due possibili: non si sceglie a caso");

// ── CreatorsPro: membri abbinati a quel nome Infloww ──
const members = { a: { firstName: "Sara", lastName: "Rossi" }, b: { firstName: "Sara", lastName: "R." }, c: { firstName: "Luca", lastName: "Neri" } };
eq(cpMembersFor("Sara Rossi", { b: "Sara Rossi" }, members), { mapped: ["Sara R."], sameName: [] }, "abbinato a mano");
eq(cpMembersFor("Luca Neri", { b: "Sara Rossi" }, members), { mapped: [], sameName: ["Luca Neri"] }, "non abbinato ma con lo stesso nome su CP");
eq(cpMembersFor("Marco Bianchi", {}, members), { mapped: [], sameName: [] }, "nessun membro");
eq(cpMembersFor("", {}, members), { mapped: [], sameName: [] }, "nome vuoto");

// ── quanto è sicuro un suggerimento ──
eq(suggestionKind("Kevin Giuseppe corradino", "Kevin Giuseppe Corradino"), "esatto", "maiuscole non contano");
eq(suggestionKind("Rossi Sara", "Sara Rossi"), "esatto", "ordine invertito = stesse parole");
eq(suggestionKind("Niccolò Ferri", "Niccolo Ferri"), "esatto", "accenti non contano");
eq(suggestionKind("Felice Alessandro Izzo", "Alessandro Izzo"), "simile", "secondo nome in più: da guardare");
eq(suggestionKind("Pierriccardo Lampasona", "Pierricardo Lampasona"), "simile", "refuso: da guardare");

// ── in blocco: mai lo stesso nome su due schede, salta chi è già collegato ──
{
  const c = operatorCandidates([{ employeeId: "1", employeeName: "Sara Rossi" }, { employeeId: "2", employeeName: "Luca Neri" }], []);
  const people = [{ id: "p2", name: "Rossi Sara", phase: "Attiva" }, { id: "p1", name: "Sara Rossi" }, { id: "p3", name: "Luca Neri" }, { id: "p4", name: "Mario Bo" }];
  const rows = bulkSuggestions(people, c, { p3: { inflowwName: "Luca Neri" } });
  eq(rows.map((r) => [r.personId, r.suggestion.name, r.kind]), [["p2", "Sara Rossi", "esatto"]], "doppione: il nome va alla prima scheda, mai a due; p3 già collegata; p4 senza suggerimento");
}

// ── CreatorsPro: l'avviso «nessun membro» solo per chi fa turni di vendita ──
eq(expectsCpShifts(["Chatter"]), true, "chatter: i turni si leggono da CP");
eq(expectsCpShifts(["Social Media Manager", "Sales Manager"]), true, "più mansioni, una vende");
eq(expectsCpShifts(["chatter"]), true, "maiuscole non contano");
eq(expectsCpShifts(["Social Media Manager"]), false, "SMM: non è nell'elenco venditori di CP");
eq(expectsCpShifts(["PO"]), false, "PO");
eq(expectsCpShifts(["Board"]), false, "voce fuori elenco (da ClickUp)");
eq(expectsCpShifts([]), true, "mansione vuota: non sappiamo, l'avviso resta");
eq(expectsCpShifts(undefined), true, "campo assente");

console.log(`person-operator: ${n} verifiche ok`);
