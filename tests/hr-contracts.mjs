// Unit test — contratti Dropbox Sign ↔ Centro HR (hr-contracts-core). Esegui: node tests/hr-contracts.mjs
import assert from "node:assert/strict";
import {
  classifyContract, classifyTitle, roleToMansione, requestToContract, signatureState, matchContracts,
  contractStatus, desiredContractField, statusSentence, KIND, nameTokens,
} from "../src/lib/hr-contracts-core.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const pad = (s) => s + " lorem ipsum ".repeat(30); // i testi veri sono lunghi: sotto 200 caratteri vale il titolo

// ── Lettura del contratto (frasi prese dai contratti veri) ──────────────────
t("autore = operatore anche se il titolo dice Collaboratore", () => {
  const c = classifyContract({ title: "Contratto H.O.C.  Collaboratore Roberta Favuzza", text: pad("Art. 1 - OGGETTO DEL CONTRATTO 1.1. Conferimento di incarico per lo svolgimento di attività autonome di carattere autorale. Art. 2") });
  assert.equal(c.kind, KIND.operatore); assert.equal(c.mansione, "Chatter"); assert.equal(c.readFrom, "testo");
});
t("autore in PDF senza spazi", () => {
  assert.equal(classifyContract({ title: "x", text: pad("OGGETTODELCONTRATTO1.1.Conferimentodiincaricoperlosvolgimentodiattivitàautonomedicarattereautorale.") }).kind, KIND.operatore);
});
t("autore in inglese", () => {
  assert.equal(classifyContract({ title: "Contract H.O.C. Collaborator X", text: pad("ART. 1- OBJECTOFTHECONTRACT1.1.Assignmenttocarryoutindependentauthorialactivities.") }).mansione, "Chatter");
});
t("staff: Sales Manager in inglese", () => {
  const c = classifyContract({ title: "Contract", text: pad("1.2. The Consultant role will be that of Sales Manager. Doc ID") });
  assert.equal(c.kind, KIND.staff); assert.equal(c.role, "Sales Manager"); assert.equal(c.mansione, "Sales Manager");
});
t("staff: HR Senior con frase lunga dopo", () => {
  const c = classifyContract({ title: "Contratto Claudia", text: pad("1.2. L’opera del Prestatore consisterà in quella di HR Senior. 1.3. Ed in particolare") });
  assert.equal(c.role, "HR Senior"); assert.equal(c.mansione, "HR");
});
t("staff senza spazi: AccountManager → Account Manager, nessuna voce CRM", () => {
  const c = classifyContract({ title: "x", text: pad("1.2.Inparticolare,l’operadelPrestatoreconsisteràinquelladiAccountManager,ovveroservizioprofessionale") });
  assert.equal(c.role, "Account Manager"); assert.equal(c.mansione, null);
});
t("social media management e consulenza", () => {
  assert.equal(classifyContract({ title: "x", text: pad("1.1. Conferimento di incarico per lo svolgimento di attività autonome di social media management.") }).mansione, "Social Media Manager");
  assert.equal(classifyContract({ title: "x", text: pad("a) incarichi professionali di consulenza organizzativa e attività connesse") }).kind, KIND.consulente);
});
t("creator, modulo conto, NDA, risoluzione non sono contratti del personale", () => {
  assert.equal(classifyContract({ title: "Contratto H.O.C. Pamela", text: pad("1.1. Le Parti intendono avviare un rapporto di collaborazione stabile finalizzato alla gestione, sviluppo e ottimizzazione del profilo del/della Creator sulla piattaforma OnlyFans") }).kind, KIND.creator);
  assert.equal(classifyContract({ title: "Contract H.O.C. Emily", text: pad("User Application PAGE 1 In order to complete your User Application") }).kind, KIND.modulo);
  assert.equal(classifyContract({ title: "H.O.C. NDA MEET", text: pad("MEETING TRANSLATOR NON-DISCLOSURE AGREEMENT") }).kind, KIND.nda);
  assert.equal(classifyContract({ title: "Risoluzione contratto Elisa Esposito", text: pad("x") }).kind, KIND.risoluzione);
});
t("PDF assente o vuoto → titolo", () => {
  const c = classifyContract({ title: "Contratto H.O.C. Chatter Francesco Paolone", text: "" });
  assert.equal(c.kind, KIND.operatore); assert.equal(c.readFrom, "titolo");
  assert.equal(classifyTitle("Contratto Sales Manager H.O.C. Michael Levato").role, "Sales Manager");
  assert.equal(classifyTitle("Contratto H.O.C. Collaboratore X").kind, KIND.sconosciuto); // "Collaboratore" non dice la mansione
});
t("roleToMansione", () => {
  assert.equal(roleToMansione("Social Media Manager Junior"), "Social Media Manager");
  assert.equal(roleToMansione("International PH People Operations Lead"), "HR");
  assert.equal(roleToMansione("Production designer"), null);
});

// ── Richiesta Dropbox Sign ───────────────────────────────────────────────────
const req = (o = {}) => ({
  signature_request_id: "abc", title: "Contratto H.O.C. Chatter Mario Rossi", created_at: 1_750_000_000, is_complete: true, is_declined: false, expires_at: null,
  signatures: [
    { signer_email_address: "contact@houseofcreators.com", signer_name: "HOC", signed_at: 1_750_000_100, status_code: "signed" },
    { signer_email_address: "Mario.Rossi@Gmail.com ", signer_name: "Mario Rossi", signed_at: 1_750_000_500, status_code: "signed" },
  ], ...o,
});
t("requestToContract: chi firma è l'altro, email minuscola, date in ms", () => {
  const c = requestToContract(req());
  assert.equal(c.signerEmail, "mario.rossi@gmail.com"); assert.equal(c.signerName, "Mario Rossi");
  assert.equal(c.state, "firmato"); assert.equal(c.signedAt, 1_750_000_500_000); assert.equal(c.createdAt, 1_750_000_000_000);
});
t("signatureState", () => {
  assert.equal(signatureState(req({ is_complete: false })), "in_firma");
  assert.equal(signatureState(req({ is_complete: false, expires_at: 1 }), Date.now()), "scaduto");
  assert.equal(signatureState(req({ is_complete: false, is_declined: true })), "rifiutato");
});

// ── Abbinamento ──────────────────────────────────────────────────────────────
const people = [
  { id: "p1", firstName: "Mario", surname: "Rossi", emails: ["mario.rossi@gmail.com"] },
  { id: "p2", firstName: "Giulia", surname: "Arisci", emails: [] },
  { id: "p3", firstName: "Elisa", surname: "Esposito", emails: [] },
  { id: "p4", firstName: "Davide", surname: "Gentile", emails: [] },
  { id: "p5", firstName: "Luca", surname: "Bianchi", emails: [] },
  { id: "p6", firstName: "Luca", surname: "Bianchi", emails: [] }, // omonimo
];
t("email prima del nome", () => {
  const m = matchContracts([{ id: "c1", title: "Contratto altro nome", signerEmail: "mario.rossi@gmail.com", signerName: "Mr X", kind: KIND.operatore }], people);
  assert.deepEqual(m.byContract.c1, { personId: "p1", how: "email" });
});
t("nome dal titolo, maiuscole e accenti indifferenti", () => {
  const m = matchContracts([{ id: "c2", title: "Contratto Giulia Arìsci", signerEmail: "x@y.it", signerName: "", kind: KIND.staff }], people);
  assert.equal(m.byContract.c2.personId, "p2");
});
t("titolo con due persone: vince chi firma", () => {
  const m = matchContracts([{ id: "c3", title: "Contratto H.O.C. Talent Manager Davide Gentile - Elisa Esposito", signerName: "Davide Gentile", signerEmail: "", kind: KIND.staff }], people);
  assert.equal(m.byContract.c3.personId, "p4");
});
t("omonimi: nessun abbinamento automatico", () => {
  const m = matchContracts([{ id: "c4", title: "Contratto Luca Bianchi", signerName: "Luca Bianchi", signerEmail: "", kind: KIND.operatore }], people);
  assert.equal(m.byContract.c4, undefined); assert.deepEqual(m.ambiguous.c4.sort(), ["p5", "p6"]);
});
t("scelta a mano vince; 'none' esclude; creator mai abbinato da solo", () => {
  const cs = [
    { id: "c5", title: "Contratto Luca Bianchi", signerName: "Luca Bianchi", kind: KIND.operatore },
    { id: "c6", title: "Contratto H.O.C. Chatter Mario Rossi", signerName: "Mario Rossi", kind: KIND.operatore },
    { id: "c7", title: "Contratto H.O.C. Elisa Esposito", signerName: "Elisa Esposito", kind: KIND.creator },
  ];
  const m = matchContracts(cs, people, { c5: "p6", c6: "none" });
  assert.deepEqual(m.byContract.c5, { personId: "p6", how: "a mano" });
  assert.equal(m.byContract.c6, undefined);
  assert.equal(m.byContract.c7, undefined);
});
t("un nome solo non basta (servono almeno 2 parole)", () => {
  const m = matchContracts([{ id: "c8", title: "Contratto Mario", signerName: "Mario", kind: KIND.operatore }], [{ id: "x", firstName: "Mario", surname: "", emails: [] }]);
  assert.equal(m.byContract.c8, undefined);
  assert.equal(nameTokens("Contratto H.O.C. Chatter Mario Rossi").has("chatter"), false);
});

// ── Stato per persona ────────────────────────────────────────────────────────
const C = (id, o) => ({ id, createdAt: 0, state: "firmato", kind: KIND.operatore, mansione: "Chatter", role: "Operatore (chat)", ...o });
t("firmato e coerente", () => {
  const s = contractStatus(["Chatter"], [C("a", { createdAt: 1 })]);
  assert.equal(s.flag, "ok"); assert.equal(desiredContractField(s, ""), "Firmato"); assert.equal(desiredContractField(s, "Firmato"), null);
});
t("promosso a Sales Manager con contratto da operatore → cambiata, Da preparare", () => {
  const s = contractStatus(["Sales Manager"], [C("a", { createdAt: 1 })]);
  assert.equal(s.flag, "cambiata"); assert.deepEqual(s.uncovered, ["Sales Manager"]);
  assert.equal(desiredContractField(s, "Firmato"), "Da preparare");
  assert.equal(desiredContractField(s, "Bozza condivisa"), null, "non scavalca una bozza in corso");
  assert.match(statusSentence(s, { a: C("a", { createdAt: 1, signedAt: Date.UTC(2026, 1, 23) }) }), /Sales Manager.*operatore|Serve un contratto nuovo/i);
});
t("cambiata con il contratto nuovo già in firma", () => {
  const s = contractStatus(["Sales Manager"], [C("a", { createdAt: 1 }), C("b", { createdAt: 2, state: "in_firma", kind: KIND.staff, mansione: "Sales Manager" })]);
  assert.equal(s.flag, "cambiata_in_firma"); assert.equal(desiredContractField(s, "Da preparare"), "Firma richiesta");
});
t("due mansioni, due contratti → ok; una in più senza contratto → cambiata", () => {
  const two = [C("a", { createdAt: 1 }), C("b", { createdAt: 2, kind: KIND.staff, mansione: "Editor" })];
  assert.equal(contractStatus(["Chatter", "Editor"], two).flag, "ok");
  assert.equal(contractStatus(["Chatter", "Editor", "PO"], two).flag, "cambiata");
});
t("Board/Formatore non richiedono contratto", () => {
  assert.equal(contractStatus(["Board"], []).flag, "non_richiesto");
  assert.equal(contractStatus(["Formatore", "Sales Manager"], [C("a", { kind: KIND.staff, mansione: "Sales Manager" })]).flag, "ok");
});
t("mancante, in firma, scaduto non conta", () => {
  assert.equal(contractStatus(["Chatter"], []).flag, "mancante");
  assert.equal(contractStatus(["Chatter"], [C("a", { state: "in_firma" })]).flag, "in_firma");
  assert.equal(contractStatus(["Chatter"], [C("a", { state: "scaduto" })]).flag, "mancante");
  assert.equal(desiredContractField({ flag: "mancante" }, "Bozza condivisa"), null);
});
t("risoluzione dopo il contratto → risolto; contratto nuovo dopo la risoluzione → ok", () => {
  const term = C("r", { createdAt: 5, kind: KIND.risoluzione, mansione: null });
  assert.equal(contractStatus(["Chatter"], [C("a", { createdAt: 1 }), term]).flag, "risolto");
  assert.equal(contractStatus(["Chatter"], [C("a", { createdAt: 1 }), term, C("b", { createdAt: 9 })]).flag, "ok");
});
t("da verificare: CRM senza mansione, o contratto illeggibile", () => {
  const s1 = contractStatus([], [C("a")]);
  assert.equal(s1.flag, "da_verificare"); assert.equal(s1.why, "crm_vuoto"); assert.equal(desiredContractField(s1, ""), "Firmato");
  const s2 = contractStatus(["Chatter"], [C("a", { kind: KIND.sconosciuto, mansione: null })]);
  assert.equal(s2.flag, "da_verificare"); assert.equal(s2.why, "contratto_illeggibile");
});
t("contratti creator/NDA non contano per lo stato", () => {
  assert.equal(contractStatus(["Chatter"], [C("a", { kind: KIND.creator, mansione: null })]).flag, "mancante");
});
t("Account Manager (senza voce CRM) contro Sales Manager → cambiata", () => {
  assert.equal(contractStatus(["Sales Manager"], [C("a", { kind: KIND.staff, role: "Account Manager", mansione: null }), C("b", { createdAt: 1 })]).flag, "cambiata");
});

t("le richieste di prova non contano mai per lo stato", () => {
  assert.equal(contractStatus(["Chatter"], [C("a", { test: true })]).flag, "mancante");
  assert.equal(requestToContract(req({ test_mode: true })).test, true);
});

console.log(`hr-contracts: ${n} test ok`);
