// Unit test — Centro HR: hr-people-core + hr-clickup-map + hr-crypto. Esegui: node tests/hr-people.mjs
import assert from "node:assert/strict";

process.env.HR_ENCRYPTION_KEY = "ab".repeat(32); // 64 char hex, solo per test

import {
  validateCodiceFiscale, cfControlChar, maskCf, normalizePersonInput, applyChanges, resolveFieldConflicts,
  filterEchoes, recordEcho, isOwnEcho, detectDuplicates, isJunk, computeCleanup, signClickupBody,
  verifyClickupSignature, formTokenState, sniffFileType, valuesEqual, FORM_UPLOAD_GRACE_MS, ECHO_WINDOW_MS,
  valueHash, dropUnchangedSinceBase,
} from "../src/lib/hr-people-core.js";
import {
  decodeDropdown, decodeLabels, decodeCustomField, msToIsoDate, isoDateToMs, taskToPerson, personToClickup,
  createTaskPayload, statusForCollaboration, parseHocBlock, withHocBlock, stripHocBlock, HOC_BLOCK_START,
  encodeFieldValue, incomingTimestamps,
} from "../src/lib/hr-clickup-map.js";
import { encryptHr, decryptHr, hrCryptoConfigured } from "../src/lib/hr-crypto.js";

// Modulo: dal 04/10/2026 i campi principali sono obbligatori. Le prove di invio partono
// da risposte complete (email/telefono diversi a ogni chiamata, per non creare doppioni).
let REQ_N = 0;
const req = () => {
  REQ_N += 1;
  return {
    surname: "Prova", dateOfBirth: "1995-01-01", gender: "Female", nationality: "Italy",
    birthPlace: { abroad: false, name: "Roma", prov: "RM", code: "H501" },
    residenceComune: { abroad: true, country: "Spagna" }, location: "Calle Mayor 1", residenceCap: "28013",
    personalEmail: `req${REQ_N}@example.com`, personalPhone: `+39 333 000 ${String(1000 + REQ_N)}`,
    partitaIva: false, spokenLanguages: ["Italiano"],
    skillLevels: { of_chat: "Base" }, source: "Altro",
  };
};

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── Codice fiscale ──────────────────────────────────────────────────────────
ok(validateCodiceFiscale("RSSMRA85T10A562S").ok, "CF noto valido");
eq(validateCodiceFiscale(" rssmra85t10a562s ").value, "RSSMRA85T10A562S", "minuscolo e spazi normalizzati");
ok(!validateCodiceFiscale("RSSMRA85T10A562T").ok, "carattere di controllo sbagliato");
ok(/controllo/.test(validateCodiceFiscale("RSSMRA85T10A562T").error), "errore parla del controllo");
ok(!validateCodiceFiscale("RSSMRA85T10A562").ok, "15 caratteri → invalido");
ok(!validateCodiceFiscale("RSSMRA85Z10A562S").ok, "mese Z inesistente → formato invalido");
ok(!validateCodiceFiscale("").ok, "vuoto → invalido");
{
  // omocodia: cifre sostituite da lettere (0→L, 2→N) con controllo ricalcolato
  const base = "RSSMRA85T10A56N";
  const cf = base + cfControlChar(base);
  ok(validateCodiceFiscale(cf).ok, "CF omocodico valido");
}
eq(maskCf("RSSMRA85T10A562S"), "RSS••••••••••••S", "maschera: prime 3 + ultima");

// ── Validazione input ───────────────────────────────────────────────────────
{
  const r = normalizePersonInput({ firstName: " Anna ", personalEmail: "ANNA@Example.com", personalPhone: "+39 333 123 4567", dateOfBirth: "1999-02-30", codiceFiscale: "RSSMRA85T10A562S", spokenLanguages: "Italiano, Inglese" });
  eq(r.values.firstName, "Anna", "trim nome");
  eq(r.values.personalEmail, "anna@example.com", "email minuscola");
  eq(r.values.personalPhone, "+393331234567", "telefono normalizzato");
  ok(r.errors.some((e) => e.startsWith("Data di nascita")), "30 febbraio → errore");
  eq(r.cf, "RSSMRA85T10A562S", "CF esce a parte");
  ok(!("codiceFiscale" in r.values), "CF mai nei values in chiaro");
  eq(r.values.spokenLanguages, ["Italiano", "Inglese"], "labels da stringa");
  ok(normalizePersonInput({ gender: "Altro" }).errors.length === 1, "genere fuori elenco → errore");
  ok(normalizePersonInput({ codiceFiscale: "XXX" }).errors.length === 1, "CF invalido → errore");
  eq(normalizePersonInput({ cvFiles: [{ id: 1 }] }).values, {}, "campo sola lettura ignorato");
  eq(normalizePersonInput({ codiceFiscale: "RSSMRA85T10A562S" }, ["firstName"]).cf, undefined, "chiavi non ammesse ignorate (modulo)");
}

// ── Mapping ClickUp → app ───────────────────────────────────────────────────
const genderField = { id: "f-g", name: "Gender", type: "drop_down", type_config: { options: [
  { id: "opt-f", name: "Female", orderindex: 0 }, { id: "opt-m", name: "Male", orderindex: 1 }, { id: "opt-nb", name: "Non-Binary", orderindex: 2 },
] } };
eq(decodeDropdown(genderField, 1), "Male", "dropdown per orderindex numerico");
eq(decodeDropdown(genderField, "2"), "Non-Binary", "dropdown per orderindex stringa");
eq(decodeDropdown(genderField, "opt-f"), "Female", "dropdown per option id");
eq(decodeDropdown(genderField, 9), null, "orderindex inesistente → null");
eq(decodeDropdown(genderField, null), null, "vuoto → null");
const langField = { id: "f-l", name: "Spoken Languages", type: "labels", type_config: { options: [
  { id: "l-it", label: "Italiano" }, { id: "l-en", label: "Inglese" }, { id: "l-es", label: "Spagnolo" },
] } };
eq(decodeLabels(langField, ["l-it", "l-es"]), ["Italiano", "Spagnolo"], "labels per id");
eq(decodeLabels(langField, [{ id: "l-en", label: "Inglese" }]), ["Inglese"], "labels come oggetti");
eq(decodeLabels(langField, ["l-xx"]), [], "label sconosciuta ignorata");
eq(msToIsoDate(String(Date.parse("1990-05-17T22:30:00Z"))), "1990-05-18", "data in fuso Roma (23:30 UTC+1 = giorno dopo)");
eq(msToIsoDate(isoDateToMs("2026-09-29")), "2026-09-29", "andata e ritorno data");
eq(decodeCustomField({ type: "location", value: { location: { lat: 45.46, lng: 9.19 }, formatted_address: "Milano, Italia" } }, "location"), { address: "Milano, Italia", lat: 45.46, lng: 9.19 }, "location");
eq(decodeCustomField({ type: "users", value: [{ id: 7, username: "Giulia", email: "G@x.it" }] }, "users"), [{ id: "7", name: "Giulia", email: "g@x.it" }], "users");
eq(decodeCustomField({ type: "number", value: "2" }, "number"), 2, "number");
eq(decodeCustomField({ type: "checkbox", value: "true" }, "bool"), true, "checkbox → bool");
eq(decodeCustomField({ type: "drop_down", value: 0, type_config: { options: [{ id: "y", name: "Sì", orderindex: 0 }, { id: "n", name: "No", orderindex: 1 }] } }, "bool"), true, "dropdown Sì/No → bool");

const task = {
  id: "86abc", name: "Anna Bianchi", url: "https://app.clickup.com/t/86abc", date_updated: "1790000000000",
  status: { status: "active" }, list: { id: "999" },
  description: `Note libere.\n\n${HOC_BLOCK_START}\nID HOC Pro: p_0123456789abcdef\nMansione attuale: Chatter senior\nPartita IVA: sì\nCodice fiscale: RSS•••S (completo in HOC Pro)`,
  custom_fields: [
    { ...genderField, value: 0 },
    { ...langField, value: ["l-it", "l-en"] },
    { id: "f-s", name: "Surname", type: "short_text", value: "Bianchi" },
    { id: "f-pe", name: "Personal Email", type: "email", value: "anna@x.it" },
    { id: "f-dob", name: "Date Of Birth", type: "date", value: String(isoDateToMs("1998-03-04")) },
    { id: "f-cs", name: "Collaboration Status", type: "drop_down", value: "cs-a", type_config: { options: [{ id: "cs-o", name: "Onboarding", orderindex: 0 }, { id: "cs-a", name: "Active", orderindex: 1 }] } },
    { id: "f-yw", name: "Yellow Warnings", type: "number" },
    { id: "f-cv", name: "CV", type: "attachment", value: [{ id: "att1", title: "cv.pdf", date: "1790000000000" }] },
  ],
};
{
  const m = taskToPerson(task);
  eq(m.fields.firstName, "Anna", "nome del task senza cognome");
  ok(m.nameIncludesSurname, "ricorda che il task aveva nome+cognome");
  eq(m.fields.gender, "Female", "dropdown nel task (orderindex 0)");
  eq(m.fields.collaborationStatus, "Attiva", "dropdown nel task (option id), tradotto in italiano");
  eq(m.statusPhase, "Attiva", "stato del task «active» (vecchio nome inglese) letto come fase");
  eq(m.fields.spokenLanguages, ["Italiano", "Inglese"], "labels nel task");
  eq(m.fields.dateOfBirth, "1998-03-04", "data nel task");
  eq(m.fields.yellowWarnings, null, "number vuoto → null");
  eq(m.fields.currentJob, "Chatter senior", "mansione dal blocco descrizione");
  eq(m.fields.partitaIva, true, "partita IVA dal blocco descrizione");
  ok(!("codiceFiscale" in m.fields), "CF mascherato nel blocco NON viene letto");
  ok(!("companyEmail" in m.fields), "campo assente sulla lista → chiave assente (non null)");
  eq(m.hocPersonId, "p_0123456789abcdef", "id HOC dal blocco (anti-doppione su taskCreated)");
  eq(m.fields.cvFiles, [{ id: "att1", title: "cv.pdf", date: 1790000000000 }], "allegati come riferimenti");
}

// ── Mapping app → ClickUp ───────────────────────────────────────────────────
const meta = task.custom_fields.map(({ value, ...f }) => f);
{
  const person = { id: "p_0123456789abcdef", clickup: { nameIncludesSurname: true }, cfEnc: "x", fields: {
    firstName: "Anna", surname: "Bianchi", gender: "Male", spokenLanguages: ["Inglese", "Tedesco"], dateOfBirth: "1998-03-04",
    personalEmail: null, collaborationStatus: "Onboarding", currentJob: "Team lead", partitaIva: false,
    location: { address: "Roma", lat: null, lng: null },
  } };
  const plan = personToClickup(person, meta, { cfPlain: "RSSMRA85T10A562S", statuses: [{ status: "onboarding" }, { status: "active" }], currentDescription: "Note libere.\n\n" + HOC_BLOCK_START + "\nvecchio" });
  const op = (k) => plan.fieldOps.find((o) => o.key === k);
  eq(plan.name, "Anna Bianchi", "nome del task mantiene il formato nome+cognome");
  eq(op("gender").body, { value: "opt-m" }, "dropdown → option id");
  eq(op("spokenLanguages").body, { value: ["l-en"] }, "labels → id, sconosciute scartate");
  ok(plan.skipped.some((x) => x.key === "spokenLanguages" && /Tedesco/.test(x.reason)), "label sconosciuta segnalata");
  eq(op("dateOfBirth").body, { value: isoDateToMs("1998-03-04"), value_options: { time: false } }, "data → ms");
  ok(op("personalEmail").remove, "campo svuotato → rimozione");
  eq(plan.status, "onboarding", "status allineato allo stato di collaborazione");
  ok(!op("location"), "location senza coordinate non si scrive");
  ok(plan.description.startsWith("Note libere."), "testo sopra il blocco preservato");
  ok(!plan.description.includes("vecchio"), "vecchio blocco sostituito");
  ok(plan.description.includes("Mansione attuale: Team lead"), "mansione nel blocco (nessun campo omonimo)");
  ok(plan.description.includes("Partita IVA: no"), "P.IVA nel blocco");
  ok(plan.description.includes("RSS••••••••••••S") && !plan.description.includes("RSSMRA85T10A562S"), "CF nel blocco solo mascherato");
  ok(plan.description.includes("Dove vive (testo): Roma"), "location senza coordinate nel blocco");
  ok(plan.description.includes("ID HOC Pro: p_0123456789abcdef"), "id HOC nel blocco");
  const payload = createTaskPayload(plan);
  ok(payload.custom_fields.every((c) => c.id && "value" in c), "payload di creazione senza rimozioni");
  // campo dedicato "Codice fiscale" sulla lista → valore pieno lì, non nel blocco
  const meta2 = [...meta, { id: "f-cf", name: "Codice fiscale", type: "short_text" }];
  const plan2 = personToClickup(person, meta2, { cfPlain: "RSSMRA85T10A562S" });
  eq(plan2.fieldOps.find((o) => o.key === "codiceFiscale").body, { value: "RSSMRA85T10A562S" }, "CF sul campo dedicato");
  ok(!plan2.description.includes("Codice fiscale"), "con campo dedicato il CF non va nel blocco");
  const plan3 = personToClickup(person, meta2, { cfPlain: undefined });
  ok(plan3.skipped.some((x) => x.key === "codiceFiscale"), "senza chiave il CF non si spinge (e non si cancella)");
  // solo le chiavi cambiate
  const plan4 = personToClickup(person, meta, { keys: ["gender"] });
  eq(plan4.fieldOps.map((o) => o.key), ["gender"], "push solo dei campi cambiati");
}
eq(encodeFieldValue(genderField, "option", "Alieno").skip.includes("non è tra le opzioni"), true, "opzione dropdown inesistente → skip");
eq(encodeFieldValue({ type: "location" }, "location", { address: "Milano", lat: 45, lng: 9 }).body, { value: { location: { lat: 45, lng: 9 }, formatted_address: "Milano" } }, "location con coordinate");
eq(statusForCollaboration([{ status: "to do" }], "Active"), null, "nessuno status omonimo → status invariato");
eq(parseHocBlock("niente blocco"), null, "descrizione senza blocco");
eq(stripHocBlock(withHocBlock("A", ["x: 1"])), "A", "blocco rimovibile");

// ── 03/10: fasi della persona e stato del contratto (tabella unica, due lingue) ──
{
  const F = await import("../src/lib/hr-fields.js");
  const { historyItemKey } = await import("../src/lib/hr-clickup-map.js");
  eq(F.PHASE_LABELS, ["In ingresso", "Attiva", "In riassegnazione", "In uscita", "Uscita"], "le 5 fasi, in ordine (Needs Review non è una fase)");
  const pairs = [["In ingresso", "Onboarding"], ["Attiva", "Active"], ["In riassegnazione", "Reassigning"], ["In uscita", "Outboarding"], ["Uscita", "Decommissioned"]];
  for (const [it, en] of pairs) {
    eq(F.choiceLabel(F.PERSON_PHASES, en), it, `fase: ${en} → ${it}`);
    eq(F.choiceLabel(F.PERSON_PHASES, it), it, `fase: ${it} resta ${it}`);
    eq(F.choiceLabel(F.PERSON_PHASES, en.toUpperCase()), it, `fase: maiuscole indifferenti (${en.toUpperCase()})`);
    eq(F.choiceLabel(F.PERSON_PHASES, ` ${it.toLowerCase()} `), it, `fase: italiano minuscolo con spazi (${it})`);
  }
  eq(F.choiceLabel(F.PERSON_PHASES, "Needs Review"), "Da verificare", "Needs Review → Da verificare");
  eq(F.findChoice(F.PERSON_PHASES, "needs review").selectable, false, "Da verificare non selezionabile");
  eq(F.choiceLabel(F.PERSON_PHASES, "Qualcosa di nuovo"), "Qualcosa di nuovo", "opzione sconosciuta: si mostra com'è, nessun crash");
  eq(F.choiceLabel(F.PERSON_PHASES, null), null, "vuoto → null");
  const cpairs = [["Da preparare", "To Do"], ["Bozza condivisa", "Drafted Shared"], ["Firma richiesta", "Signature Requested"], ["Firmato", "Signed"]];
  for (const [it, en] of cpairs) {
    eq(F.choiceLabel(F.CONTRACT_STATUSES, en.toLowerCase()), it, `contratto: ${en} → ${it}`);
    eq(F.choiceLabel(F.CONTRACT_STATUSES, it), it, `contratto: ${it}`);
  }
  // stato del task → fase
  eq(F.phaseFromTaskStatus("In uscita"), "In uscita", "stato italiano → fase");
  eq(F.phaseFromTaskStatus("USCITA"), "Uscita", "stato in maiuscolo → fase");
  eq(F.phaseFromTaskStatus("outboarding"), "In uscita", "stato col nome inglese → fase");
  eq(F.phaseFromTaskStatus("to do"), null, "stato estraneo (to do) → nessuna fase");
  eq(F.phaseFromTaskStatus("needs review"), null, "Needs Review non è uno stato di fase");
  eq(F.phaseFromTaskStatus(""), null, "stato vuoto → nessuna fase");
  // normalizzazione delle schede vecchie (forma, mai significato)
  eq(F.normalizeChoiceFields({ collaborationStatus: "Onboarding", hvContractStatus: "Signed", x: 1 }), { collaborationStatus: "In ingresso", hvContractStatus: "Firmato", x: 1 }, "schede vecchie: opzioni ClickUp → italiano");
  const same = { collaborationStatus: "Attiva" };
  ok(F.normalizeChoiceFields(same) === same, "già in italiano: stesso oggetto");
  // input dalla scheda o dalle API
  eq(normalizePersonInput({ collaborationStatus: "active", hvContractStatus: "Signature Requested" }).values, { collaborationStatus: "Attiva", hvContractStatus: "Firma richiesta" }, "input: nomi inglesi accettati, salvato l'italiano");
  ok(normalizePersonInput({ collaborationStatus: "Needs Review" }).errors.length === 1, "input: Da verificare non si sceglie");
  ok(normalizePersonInput({ collaborationStatus: "Boh" }).errors.length === 1, "input: fase inesistente rifiutata");
  eq(normalizePersonInput({ collaborationStatus: "" }).values.collaborationStatus, null, "input: fase svuotata");
  ok(!F.FORM_KEYS.includes("hvContractStatus") && !F.FORM_KEYS.includes("collaborationStatus"), "contratto e fase NON sono nel modulo pubblico");
  ok(!F.FORM_KEYS.includes("timeSlots"), "fasce orarie fuori dal modulo (04/10)");
  {
    const R = await import("../src/lib/hr-readiness.js");
    const full = { idDocument: { at: 1 }, hvContractStatus: "Firmato", referent: [{ id: "1" }], project: ["Model - Eva"], currentJob: "Chatter" };
    ok(R.readiness(full).done === 5 && R.readiness({}).missing.length === 5, "pronta: 5 su 5 / niente");
    ok(R.readiness({ ...full, hvContractStatus: "Bozza condivisa" }).missing.map((x) => x.key).join() === "contract", "pronta: contratto non firmato = manca");
    ok(R.initials("Salvatore Marco Bove") === "SB" && R.avatarColor("a") === R.avatarColor("a"), "avatar: iniziali e colore stabile");
  }
  ok(!F.FORM_KEYS.includes("currentJob") && !F.FIELD_BY_KEY.referent.readOnly, "mansione fuori dal modulo; referente modificabile in app");
  {
    const C5 = await import("../src/lib/hr-people-core.js");
    const M5 = await import("../src/lib/hr-clickup-map.js");
    const r = C5.normalizePersonInput({ referent: [{ id: "123", name: "Antonio", email: "A@x.it" }, { id: "123", name: "doppio" }, { id: "abc", name: "non valido" }] });
    ok(r.values.referent.length === 1 && r.values.referent[0].email === "a@x.it", "referente: id numerici, niente doppioni");
    const meta = [{ id: "ref", name: "Referent", type: "users" }];
    const person = { id: "p", fields: { firstName: "X", referent: [{ id: "2", name: "B" }, { id: "3", name: "C" }] } };
    const task = { id: "t", custom_fields: [{ id: "ref", name: "Referent", type: "users", value: [{ id: 1, username: "A" }, { id: 2, username: "B" }] }] };
    const op = M5.personToClickup(person, meta, { currentTask: task }).fieldOps.find((o) => o.key === "referent");
    ok(op && JSON.stringify(op.body.value) === JSON.stringify({ add: [3], rem: [1] }), "referente verso ClickUp: aggiunge chi manca e toglie chi non c'è più");
    ok(!M5.personToClickup({ ...person, fields: { ...person.fields, referent: [{ id: "1" }, { id: "2" }] } }, meta, { currentTask: task }).fieldOps.some((o) => o.key === "referent"), "referente già uguale: nessuna scrittura");
    ok(M5.clickupDrift(person, { ...task, name: "X" }, meta).includes("referent") && !M5.clickupDrift({ ...person, fields: { firstName: "X", referent: [{ id: "1" }, { id: "2" }] } }, { ...task, name: "X" }, meta).includes("referent"), "parità: anche il referente");
  }
  {
    const C4 = await import("../src/lib/hr-people-core.js");
    const M4 = await import("../src/lib/hr-clickup-map.js");
    ok(C4.normPhone("333 123 4567") === "+393331234567" && C4.normPhone("06 1234567") === "+39061234567", "telefono italiano senza prefisso → +39");
    ok(C4.normPhone("+44 7700 900123") === "+447700900123" && C4.normPhone("0044 7700 900123") === "+447700900123", "prefisso estero rispettato");
    ok(C4.toE164("12345") === null, "numero non valido → null");
    ok(M4.encodeFieldValue({ type: "phone" }, "phone", "3331234567").body.value === "+393331234567", "ClickUp: numero vecchio senza prefisso corretto all'invio");
    ok(Boolean(M4.encodeFieldValue({ type: "phone" }, "phone", "12345").skip), "ClickUp: numero non accettabile = solo il campo saltato, la scheda parte");
    const lines = M4.hocBlockLines({ id: "p1", fields: { source: "Me l'ha consigliato qualcuno", referredBy: "Marta Rossi" } }, new Map());
    ok(lines.includes("Come ci ha conosciuto: Me l'ha consigliato qualcuno") && lines.includes("Segnalato da: Marta Rossi"), "provenienza e reference nel blocco se la lista non ha i campi");
    // controllo di parità app ↔ ClickUp
    const meta = [
      { id: "s1", name: "Surname", type: "short_text" },
      { id: "p1", name: "Personal Phone Number", type: "phone" },
      { id: "l1", name: "Spoken Languages", type: "labels", type_config: { options: [{ id: "o1", label: "ITA - Native" }, { id: "o2", label: "ENG - Advanced" }] } },
    ];
    const task = (phone, langs, name = "Clizia") => ({ id: "t1", name, custom_fields: [
      { ...meta[0], value: "Rossi" }, { ...meta[1], value: phone }, { ...meta[2], value: langs },
    ] });
    const person = { id: "p", fields: { firstName: "Clizia", surname: "Rossi", personalPhone: "+39 333 1234567", spokenLanguages: ["ITA - Native", "ENG - Advanced"] } };
    ok(M4.clickupDrift(person, task("+393331234567", ["o2", "o1"]), meta).length === 0, "parità: uguale (telefono con spazi, etichette in altro ordine)");
    ok(M4.clickupDrift(person, task(null, ["o1", "o2"]), meta).join() === "personalPhone", "parità: telefono mancante su ClickUp");
    ok(M4.clickupDrift(person, task("+393331234567", ["o1"]), meta).join() === "spokenLanguages", "parità: una lingua in meno su ClickUp");
    ok(M4.clickupDrift(person, task("+393331234567", ["o1", "o2"], "Clizia R."), meta).join() === "firstName", "parità: nome del task diverso");
    ok(M4.clickupDrift({ ...person, fields: { ...person.fields, source: "Altro" } }, task("+393331234567", ["o1", "o2"]), meta).length === 0, "parità: campi che la lista non ha non contano (vanno nel blocco)");
  }
  ok(F.langsUnanswered(["ITA - Native", "ENG - No"]).join() === "SPA,TED,FR", "lingue: si sa a quali non ha ancora risposto");
  ok(F.langsUnanswered(["ITA - Native", "ENG - B2", "SPA - No", "TED - No", "FR - No"]).length === 0, "lingue: tutte risposte (anche con No)");
  {
    const C3 = await import("../src/lib/hr-people-core.js");
    ok(C3.normalizePersonInput({ spokenLanguages: ["ITA - Native", "ENG - No", "SPA - Basic"] }).values.spokenLanguages.join() === "ITA - Native,SPA - Basic", "i «No» non si salvano come lingue");
    const X3 = await import("../src/lib/hr-form-experience.js");
    ok(/ogni lingua/.test(X3.fieldErrors({ spokenLanguages: ["ITA - Native"] }, ["spokenLanguages"]).spokenLanguages || ""), "modulo: errore se manca una risposta per lingua");
    ok(X3.missingRequired({ spokenLanguages: ["ITA - No", "ENG - No"] }).includes("spokenLanguages"), "solo «No»: nessuna lingua parlata, resta obbligatorio");
    const W3 = await import("../src/lib/hr-welcome-card.js");
    ok(W3.tesseraRows({ spokenLanguages: ["ENG - No", "SPA - Basic"] }).every((r) => r.label !== "ENG"), "tessera: niente righe per le lingue col «No»");
  }
  ok(F.FORM_KEYS.includes("source") && F.FORM_KEYS.includes("referredBy"), "provenienza e reference sono nel modulo");
  ok(F.SOURCES[0] === F.SOURCE_REFERRAL && F.FIELD_BY_KEY.source.cu === "Provenienza" && F.FIELD_BY_KEY.referredBy.cu === "Segnalato da", "provenienza: prima voce = reference, campi ClickUp per nome");
  {
    const C2 = await import("../src/lib/hr-people-core.js");
    const r1 = C2.normalizePersonInput({ source: F.SOURCE_REFERRAL, referredBy: " Marta Rossi " });
    ok(r1.values.source === F.SOURCE_REFERRAL && r1.values.referredBy === "Marta Rossi" && !r1.errors.length, "reference: si tiene chi ha segnalato");
    const r2 = C2.normalizePersonInput({ source: "Ho visto un annuncio", referredBy: "Marta Rossi" });
    ok(r2.values.referredBy === null, "annuncio: il nome di chi segnala si scarta");
    const r3 = C2.normalizePersonInput({ source: "Passaparola" });
    ok(r3.errors.length === 1, "provenienza fuori elenco: rifiutata");
  }
  // ClickUp → app, tendina in inglese e (domani) in italiano
  const csEn = { id: "f-cs", name: "Collaboration Status", type: "drop_down", type_config: { options: [{ id: "en-o", name: "Onboarding", orderindex: 0 }, { id: "en-a", name: "Active", orderindex: 1 }, { id: "en-d", name: "Decommissioned", orderindex: 2 }, { id: "en-nr", name: "Needs Review", orderindex: 3 }] } };
  const csIt = { id: "f-cs", name: "Collaboration Status", type: "drop_down", type_config: { options: [{ id: "it-i", name: "In ingresso", orderindex: 0 }, { id: "it-a", name: "Attiva", orderindex: 1 }, { id: "it-u", name: "Uscita", orderindex: 2 }] } };
  const hv = { id: "f-hv", name: "HV Contract Status", type: "drop_down", type_config: { options: [{ id: "c-td", name: "To Do", orderindex: 0 }, { id: "c-sr", name: "Signature Requested", orderindex: 1 }, { id: "c-s", name: "Signed", orderindex: 2 }] } };
  const tk = (cs, csVal, status, hvVal) => ({ id: "t1", name: "Ada", status: { status }, custom_fields: [{ ...cs, value: csVal }, { ...hv, value: hvVal }] });
  eq(taskToPerson(tk(csEn, "en-d", "to do", "c-s")).fields.collaborationStatus, "Uscita", "tendina inglese Decommissioned → Uscita");
  eq(taskToPerson(tk(csIt, 1, "to do", null)).fields.collaborationStatus, "Attiva", "tendina già tradotta (Attiva) → Attiva");
  eq(taskToPerson(tk(csEn, "en-nr", "to do", null)).fields.collaborationStatus, "Da verificare", "Needs Review da ClickUp → Da verificare (nessun crash)");
  eq(taskToPerson(tk(csEn, "en-d", "to do", "c-s")).fields.hvContractStatus, "Firmato", "contratto Signed → Firmato");
  eq(taskToPerson(tk(csEn, null, "In riassegnazione", null)).statusPhase, "In riassegnazione", "stato del task → statusPhase");
  eq(taskToPerson(tk(csEn, null, "to do", null)).statusPhase, null, "stato estraneo → statusPhase null");
  // app → ClickUp: opzione per nome inglese O italiano, stato del task per nome italiano O inglese
  const itStatuses = [{ status: "In ingresso" }, { status: "Attiva" }, { status: "In riassegnazione" }, { status: "In uscita" }, { status: "Uscita" }];
  const person = { id: "p_00000000000000aa", fields: { firstName: "Ada", collaborationStatus: "Uscita", hvContractStatus: "Firma richiesta" } };
  const planEn = personToClickup(person, [csEn, hv], { statuses: itStatuses });
  eq(planEn.fieldOps.find((o) => o.key === "collaborationStatus").body, { value: "en-d" }, "fase Uscita → opzione inglese Decommissioned");
  eq(planEn.fieldOps.find((o) => o.key === "hvContractStatus").body, { value: "c-sr" }, "contratto Firma richiesta → Signature Requested");
  eq(planEn.status, "Uscita", "fase Uscita → stato del task Uscita");
  const planIt = personToClickup(person, [csIt, hv], { statuses: [{ status: "uscita" }] });
  eq(planIt.fieldOps.find((o) => o.key === "collaborationStatus").body, { value: "it-u" }, "tendina tradotta: fase → opzione italiana");
  eq(planIt.status, "uscita", "stato del task cercato senza badare alle maiuscole");
  eq(statusForCollaboration([{ status: "decommissioned" }], "Uscita"), "decommissioned", "stato col vecchio nome inglese ancora riconosciuto");
  eq(statusForCollaboration(itStatuses, "Da verificare"), null, "Da verificare non ha uno stato del task");
  eq(statusForCollaboration([{ status: "to do" }], "Attiva"), null, "lista senza stati di fase → stato invariato");
  eq(historyItemKey({ field: "status" }), "_status", "history item di stato → _status");
}

// ── Doppioni e spazzatura ───────────────────────────────────────────────────
{
  const people = [
    { id: "a", fields: { firstName: "Luca", surname: "Rossi", personalEmail: "luca@x.it" } },
    { id: "b", fields: { firstName: "luca", surname: "Rossì", personalEmail: "altro@x.it" } }, // stesso nome+cognome
    { id: "c", fields: { firstName: "Marco", personalPhone: "+39 333 1234567" } },
    { id: "d", fields: { firstName: "M.", personalPhone: "3331234567" } }, // stesso telefono
    { id: "e", fields: { firstName: "Sara", personalEmail: "LUCA@x.it " } }, // stessa email di a
    { id: "f", fields: { firstName: "x" } }, // spazzatura
    { id: "g", fields: { firstName: "Al", personalEmail: "al@x.it" } }, // corto ma con email → non spazzatura
    { id: "h", fields: { firstName: "Paolo" } }, // senza cognome: il nome da solo non fa doppione
    { id: "i", fields: { firstName: "Paolo" } },
  ];
  const d = detectDuplicates(people);
  eq(d.find((g) => g.ids.includes("a")), { ids: ["a", "b", "e"], reasons: ["email", "nome"] }, "email + nome uniscono 3 schede");
  eq(d.find((g) => g.ids.includes("c")), { ids: ["c", "d"], reasons: ["telefono"] }, "telefono con e senza prefisso");
  ok(!d.some((g) => g.ids.includes("h")), "solo nome uguale non basta");
  ok(isJunk(people[5]), "nome di 1 carattere e niente email → spazzatura");
  ok(!isJunk(people[6]), "nome corto ma email presente → tenuta");
  const c = computeCleanup(people);
  eq(c.byId.f, ["spazzatura"], "vista da ripulire: spazzatura");
  eq(c.byId.a, ["doppione"], "vista da ripulire: doppione");
}

// ── Conflitti per campo ─────────────────────────────────────────────────────
{
  const current = { fields: { surname: "Rossi", nationality: "IT", seniority: "Junior" }, fieldUpdatedAt: { surname: 1000, nationality: 5000 } };
  const r = resolveFieldConflicts(current, { surname: "Russo", nationality: "FR", seniority: "Junior", role: undefined }, { surname: 2000, nationality: 3000 });
  eq(r.apply, { surname: "Russo" }, "ClickUp più recente vince sul campo");
  eq(r.keepApp, ["nationality"], "app più recente vince (va rimandata a ClickUp)");
  eq(r.same, ["seniority"], "valori uguali → niente");
  const r2 = resolveFieldConflicts({ fields: {}, fieldUpdatedAt: {} }, { skills: ["A"] }, 0);
  eq(r2.apply, { skills: ["A"] }, "campo mai toccato in app → vince ClickUp anche a pari tempo");
  ok(valuesEqual(["b", "a"], ["a", "b"]), "labels confrontate come insiemi");
  ok(valuesEqual("", null) && valuesEqual([], null), "vuoti equivalenti");
}

// ── Storico ─────────────────────────────────────────────────────────────────
{
  const r = applyChanges({ id: "p", fields: { surname: "A" }, fieldUpdatedAt: {} }, { surname: "B", nationality: "IT" }, { at: 42, by: "u1", source: "app" });
  eq(r.changed, ["surname", "nationality"], "campi cambiati");
  eq(r.log[0], { at: 42, by: "u1", source: "app", action: "update", field: "surname", from: "A", to: "B" }, "riga di storico chi/cosa/quando/da dove");
  eq(r.person.fieldUpdatedAt.surname, 42, "updatedAt per campo");
}

// ── Anti-loop ───────────────────────────────────────────────────────────────
{
  const now = 1_000_000;
  const echo = recordEcho({}, { surname: "Verdi", skills: ["B", "A"] }, now);
  ok(isOwnEcho(echo, "surname", "Verdi", now + 5000), "stesso valore entro la finestra → eco");
  ok(isOwnEcho(echo, "skills", ["A", "B"], now + 1000), "eco anche con labels in altro ordine");
  ok(!isOwnEcho(echo, "surname", "Verdi", now + ECHO_WINDOW_MS + 1), "fuori finestra → non è eco");
  ok(!isOwnEcho(echo, "surname", "Neri", now + 1000), "valore diverso → modifica vera");
  // l'app ha già cambiato surname in "Gialli" dopo aver scritto "Verdi": l'eco di "Verdi" va ignorata
  const f = filterEchoes({ surname: "Gialli", nationality: "IT" }, { surname: "Verdi", nationality: "IT", seniority: "Senior" }, echo, now + 2000);
  eq(f.incoming, { seniority: "Senior" }, "restano solo le modifiche vere");
  eq(f.echoes, ["surname"], "eco riconosciuta");
}

// ── Base "ultimo valore noto su ClickUp" (merge a 3 vie) ─────────────────────
{
  // l'app ha ["Italiano","Tedesco"], ClickUp sa tenere solo ["Italiano"]: la base è ["Italiano"]
  const base = { spokenLanguages: valueHash(["Italiano"]), nationality: valueHash("IT") };
  const r = dropUnchangedSinceBase({ spokenLanguages: ["Italiano"], nationality: "FR", surname: "Rossi" }, base);
  eq(r.incoming, { nationality: "FR", surname: "Rossi" }, "campo uguale alla base = non cambiato su ClickUp → non tocca l'app");
  eq(r.unchanged, ["spokenLanguages"], "valore che ClickUp non sa tenere non torna indietro");
  ok(!valueHash("RSSMRA85T10A562S").includes("RSSMRA"), "impronta: mai il valore in chiaro");
  ok(valueHash(["b", "a"]) === valueHash(["a", "b"]), "impronta stabile sulle etichette");
}

// ── Firma webhook ───────────────────────────────────────────────────────────
{
  const body = JSON.stringify({ event: "taskUpdated", task_id: "86abc", webhook_id: "wh1" });
  const sig = signClickupBody(body, "segreto");
  ok(/^[a-f0-9]{64}$/.test(sig), "firma hex sha256");
  ok(verifyClickupSignature(body, sig, "segreto"), "firma valida");
  ok(verifyClickupSignature(body, sig.toUpperCase(), "segreto"), "firma valida anche maiuscola");
  ok(!verifyClickupSignature(body + " ", sig, "segreto"), "corpo alterato → rifiuto");
  ok(!verifyClickupSignature(body, sig, "altro"), "secret sbagliato → rifiuto");
  ok(!verifyClickupSignature(body, "", "segreto"), "firma assente → rifiuto");
  ok(!verifyClickupSignature(body, sig, ""), "secret assente → rifiuto");
}

// ── Webhook: timestamp per campo dagli history_items ─────────────────────────
{
  const ts = incomingTimestamps([
    { field: "custom_field", custom_field: { id: "f-s", name: "Surname" }, date: "2000" },
    { field: "name", date: "3000" },
    { field: "content", date: "4000" },
    { field: "assignee", date: "5000" },
  ], meta, 1);
  eq([ts.surname, ts.firstName, ts.currentJob, ts.partitaIva, ts._default], [2000, 3000, 4000, 4000, 1], "timestamp per campo");
}

// ── Token del modulo e file ─────────────────────────────────────────────────
eq(formTokenState(null, 0), "invalid", "token inesistente");
eq(formTokenState({ expiresAt: 100 }, 50), "open", "token aperto");
eq(formTokenState({ expiresAt: 100 }, 150), "expired", "token scaduto");
eq(formTokenState({ expiresAt: 100, submittedAt: 10 }, 20), "submitted", "inviato: finestra upload");
eq(formTokenState({ expiresAt: 1e15, submittedAt: 10 }, 10 + FORM_UPLOAD_GRACE_MS + 1), "closed", "monouso: poi chiuso");
eq(sniffFileType(Buffer.from("%PDF-1.7"))?.ext, "pdf", "PDF dai byte");
eq(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg", "JPG dai byte");
eq(sniffFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))?.ext, "png", "PNG dai byte");
eq(sniffFileType(Buffer.from("MZ\x90\x00")), null, "eseguibile rifiutato");

// ── Cifratura CF ────────────────────────────────────────────────────────────
ok(hrCryptoConfigured(), "chiave di test valida");
{
  const c = encryptHr("RSSMRA85T10A562S");
  ok(!c.includes("RSSMRA"), "cifrato non contiene il chiaro");
  eq(decryptHr(c), "RSSMRA85T10A562S", "andata e ritorno");
  ok(encryptHr("RSSMRA85T10A562S") !== c, "IV casuale: due cifrature diverse");
  const saved = process.env.HR_ENCRYPTION_KEY;
  process.env.HR_ENCRYPTION_KEY = "";
  ok(!hrCryptoConfigured(), "senza chiave: non configurata (non lancia)");
  process.env.HR_ENCRYPTION_KEY = saved;
}

console.log(`hr-people: ${n} asserzioni OK`);

// ── 02/10: comuni ISTAT, coerenza codice fiscale, competenze ──────────────────
{
  const { decodeCf, cfCoherence, searchComuni } = await import("../src/lib/hr-comuni.js");
  const { normalizeSkillMap } = await import("../src/lib/hr-skills.js");
  const { readFileSync } = await import("node:fs");
  const list = JSON.parse(readFileSync(new URL("../public/data/comuni-istat.json", import.meta.url)));
  const ok2 = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } };
  // RSSMRA85T10A562S = Mario Rossi, 10/12/1985, M, San Giuliano Terme (A562) — esempio classico
  const d = decodeCf("RSSMRA85T10A562S");
  ok2(d && d.yy === 85 && d.mm === 12 && d.dd === 10 && !d.female && d.place === "A562", "decodeCf base");
  ok2(cfCoherence("RSSMRA85T10A562S", { dob: "1985-12-10", gender: "Male", birth: { abroad: false, code: "A562" } }).length === 0, "coerente");
  ok2(cfCoherence("RSSMRA85T10A562S", { dob: "1985-12-11" }).length === 1, "data diversa");
  ok2(cfCoherence("RSSMRA85T10A562S", { gender: "Female" }).length === 1, "genere diverso");
  ok2(cfCoherence("RSSMRA85T10A562S", { birth: { abroad: false, code: "H501" } }).length === 1, "comune diverso");
  ok2(cfCoherence("RSSMRA85T10A562S", { birth: { abroad: true, country: "Romania" } }).length === 1, "estero ma CF italiano");
  ok2(decodeCf("RSSMRA85T50A562S").female === true, "donna +40");
  ok2(list.length > 7800, "elenco ISTAT caricato");
  const roma = searchComuni(list, "roma");
  ok2(roma[0] && roma[0].name === "Roma" && roma[0].code === "H501" && roma[0].prov === "RM", "Roma H501 RM");
  ok2(searchComuni(list, "s.giuliano").length >= 0 && searchComuni(list, "x").length === 0, "ricerca corta vuota");
  const sm = normalizeSkillMap({ "OF Messaging": "Esperto", "Inventata": "Base", "Copywriting": "Mago" });
  // dal 03/10 le chiavi vecchie (etichette ClickUp) si traducono nelle chiavi nuove
  ok2(Object.keys(sm).length === 1 && sm.of_chat === "Esperto", "skill map pulita (chiave vecchia tradotta)");
  console.log("hr-comuni/competenze: OK");
}

// ── 03/10: catalogo competenze v2, ruoli passati, "altro", blocco ClickUp ──────
{
  const S = await import("../src/lib/hr-skills.js");
  const { hocBlockLines, parseHocBlock, withHocBlock, fieldsByName } = await import("../src/lib/hr-clickup-map.js");
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };
  const te = (a, b, msg) => { assert.deepEqual(a, b, msg); m++; };

  // catalogo: 7 aree, chiavi uniche, etichette ClickUp uniche tra le voci
  t(S.SKILL_AREAS.length === 7, "7 aree");
  te(S.SKILL_AREAS.map((a) => a.key), ["of", "ads", "social", "content", "ai", "tech", "mgmt"], "ordine delle aree");
  const keys = S.SKILLS.map((x) => x.key);
  t(new Set(keys).size === keys.length, "chiavi uniche");
  const labels = S.SKILLS.flatMap((x) => x.cu.map((l) => l.trim().toLowerCase()));
  t(new Set(labels).size === labels.length, "ogni etichetta ClickUp appartiene a una sola voce");
  t(S.SKILL_LEVELS.every((l) => S.SKILL_LEVEL_HINT[l]), "ogni livello ha la sua descrizione");
  t(S.SKILL_LEVEL_HINT.Esperto === "lo fai da più di un anno con risultati", "descrizione Esperto");

  // tutte le 50 etichette del catalogo v1 trovano una voce nuova
  const V1 = ["OF Messaging", "OF Management", "Planning OF ", "Social Media Strategy", "Content Planning ", "Copywriting", "Sorytelling", "Community Management", "Trent Analizer ", "Social ADS", "Paid Media Strategy", "Influencer Mareketing", "Funnel Marketing ", "Affiliate Marketing ", "SEO / SEM", "Video Editing ", "Production (Reels, Shorts, TikTok)", "Fotografia", "Graphic Design (PS, AI, Figma, Canva)", "Motion Graphic", "Creative Direction", "Branding Visivo (mood & brand identity)", "Podcasting / Editing Audio", "AI", "Automations", "Zapier", "Make", "API Integration", "Frontend Development", "Backend Development", "Full-Stack Development", "Database Management SQL/NoSQL", "Data Engineering ", "Data Analytics", "Cybersecurity", "ClickUp", "Leadership", "Gestione Management", "Project Management", "Priority Management", "Effective Communication", "Problem Solving", "Analytical Thinking", "Creativity", "Process Documentation", "Risk Management", "Agile Methodologies", "Scrum ", "Kanban", "Trello"];
  t(V1.length === 50, "50 etichette v1");
  t(V1.every((l) => S.resolveSkillKey(l)), "ogni etichetta v1 ha una voce nuova");
  t(S.resolveSkillKey("Planning OF") === "of_content_plan" && S.resolveSkillKey("planning of ") === "of_content_plan", "spazi e maiuscole ignorati");
  t(S.resolveSkillKey("ads_meta") === "ads_meta", "chiave nuova resta com'è");
  t(S.resolveSkillKey("Inventata") === null && S.resolveSkillKey(null) === null, "sconosciuta → null");
  t(S.skillName("Video Editing ") === "Montaggio video", "nome da chiave vecchia");

  // normalizeSkillMap: compatibilità + fusione al livello più alto
  te(S.normalizeSkillMap({ Zapier: "Base", Make: "Esperto", Automations: "Autonomo" }), { tech_automation: "Esperto" }, "tre etichette → una voce, livello più alto");
  te(S.normalizeSkillMap({ "OF Messaging": "Autonomo", ads_meta: "Posso insegnarla", soc_x: "Mago" }), { of_chat: "Autonomo", ads_meta: "Posso insegnarla" }, "vecchie e nuove insieme, livello non valido scartato");
  te(S.normalizeSkillMap(["OF Messaging"]), {}, "array → vuoto");

  // etichette ClickUp da scrivere: solo voci con equivalente, una per voce
  te(S.clickupSkillLabels({ tech_automation: "Base", ads_meta: "Esperto", of_chat: "Base", soc_seo: "Base" }), ["Automations", "Meta Ads (Facebook e Instagram)", "OF Messaging", "SEO / SEM"], "voci senza etichetta storica: il nome italiano (03/10)");
  te(S.clickupSkillLabels({ ads_google: "Esperto" }), ["Google Ads"], "Google Ads non diventa SEO / SEM: ha la sua etichetta");
  t(S.resolveSkillKey("Google Ads") === "ads_google", "etichetta italiana letta indietro da ClickUp");

  // aree e filtro "almeno livello"
  te(S.areasOfSkillMap({ "OF Messaging": "Base", ai_coding: "Base" }), ["of", "ai"], "aree dalle competenze");
  t(S.hasSkillAtLeast({ "OF Messaging": "Esperto" }, "of_chat", "Autonomo"), "Esperto ≥ Autonomo");
  t(!S.hasSkillAtLeast({ of_chat: "Base" }, "of_chat", "Autonomo"), "Base < Autonomo");
  t(S.hasSkillAtLeast({ of_chat: "Base" }, "of_chat", ""), "livello minimo vuoto = qualunque");
  t(!S.hasSkillAtLeast({}, "of_chat", ""), "senza competenza → no");

  // vorrei imparare: max 2, tradotto
  te(S.normalizeLearnList(["Copywriting", "ai_coding", "ads_meta"]), ["soc_copy", "ai_coding"], "max 2, chiave vecchia tradotta");
  te(S.normalizeLearnList(["Zapier", "Make"]), ["tech_automation"], "due vecchie sulla stessa voce → una");

  // ruoli passati
  te(S.normalizePastRoles([{ role: "media_buyer", duration: "1to3" }, { role: "media_buyer", duration: "gt5" }, { role: "astronauta", duration: "lt1" }, { role: "sales", duration: "boh" }, { role: "other", duration: "lt1", other: "  fotografo\nmatrimoni  " }]),
    [{ role: "media_buyer", duration: "1to3" }, { role: "sales", duration: null }, { role: "other", duration: "lt1", other: "fotografo matrimoni" }], "ruoli puliti: uno per tipo, durata valida o null, altro su una riga");
  t(S.pastRoleText({ role: "media_buyer", duration: "1to3" }) === "Media buyer (1-3 anni)", "testo ruolo");
  t(S.pastRoleText({ role: "other", duration: "gt5", other: "barista" }) === "Altro: barista (oltre 5 anni)", "testo ruolo altro");
  t(S.PAST_ROLES.length === 11 && S.ROLE_DURATIONS.length === 4, "11 ruoli, 4 durate");

  // normalizePersonInput: skillLevels → skills ClickUp; learnWish max 2; pastRoles; otherSkills max 500
  const r = normalizePersonInput({ skillLevels: { "OF Messaging": "Esperto", ads_meta: "Base", Zapier: "Autonomo" }, learnWish: ["Copywriting", "ai_coding", "ads_meta"], pastRoles: [{ role: "team_lead", duration: "3to5" }], otherSkills: "x".repeat(800) });
  te(r.values.skillLevels, { of_chat: "Esperto", ads_meta: "Base", tech_automation: "Autonomo" }, "skillLevels nel formato nuovo");
  te(r.values.skills, ["OF Messaging", "Meta Ads (Facebook e Instagram)", "Automations"], "Skills ClickUp = tutte le voci, nome italiano se senza etichetta storica");
  te(r.values.learnWish, ["soc_copy", "ai_coding"], "learnWish max 2");
  te(r.values.pastRoles, [{ role: "team_lead", duration: "3to5" }], "pastRoles");
  t(r.values.otherSkills.length === 500, "otherSkills tagliato a 500");
  t(!r.errors.length, "nessun errore");

  // il confronto vede il cambio di durata (oggetti senza id)
  t(!valuesEqual([{ role: "sales", duration: "lt1" }], [{ role: "sales", duration: "gt5" }]), "durata diversa = valore diverso");
  t(valuesEqual([{ role: "sales", duration: "lt1" }, { role: "founder", duration: null }], [{ role: "founder", duration: null }, { role: "sales", duration: "lt1" }]), "stesso insieme in altro ordine = uguale");
  const ap = applyChanges({ id: "p", fields: { pastRoles: [{ role: "sales", duration: "lt1" }] } }, { pastRoles: [{ role: "sales", duration: "gt5" }] }, { at: 1, by: "u", source: "app" });
  te(ap.changed, ["pastRoles"], "cambio di durata registrato");
  t(ap.log[0].to === "Venditore (oltre 5 anni)", "storico leggibile per i ruoli");
  const ap2 = applyChanges({ id: "p", fields: {} }, { skillLevels: { of_chat: "Base" } }, { at: 1, by: "u", source: "app" });
  t(ap2.log[0].to === "Chat e vendita (Base)", "storico leggibile per le competenze");

  // blocco "— Dati HOC Pro —"
  const person = { id: "hr_1", fields: {
    skillLevels: { "OF Messaging": "Esperto", ads_meta: "Base", ai_coding: "Posso insegnarla" },
    pastRoles: [{ role: "media_buyer", duration: "1to3" }, { role: "other", duration: null, other: "barista" }],
    otherSkills: "So montare i mobili\nPartita IVA: sì",
    learnWish: ["Copywriting"],
  } };
  const lines = hocBlockLines(person, fieldsByName([]));
  t(lines.includes("Competenze · OnlyFans: Chat e vendita (Esperto)"), "riga competenze OnlyFans");
  t(lines.includes("Competenze · Media buying e pubblicità: Meta Ads (Facebook e Instagram) (Base)"), "voce senza etichetta ClickUp nel blocco");
  t(lines.includes("Competenze · Intelligenza artificiale: Programmare con l'AI (Posso insegnarla)"), "riga AI");
  t(lines.includes("Ruoli già ricoperti: Media buyer (1-3 anni), Altro: barista"), "riga ruoli");
  t(lines.includes("Altro che sa fare: So montare i mobili Partita IVA: sì"), "testo libero su una riga");
  t(lines.includes("Vorrebbe imparare: Copywriting (scrivere testi)"), "riga vorrebbe imparare");
  const desc = withHocBlock("", lines);
  t(parseHocBlock(desc).partitaIva === null, "il testo libero non inietta la Partita IVA nel blocco");
  t(!lines.some((l) => l.startsWith("Livelli competenze")), "riga vecchia sparita");

  n += m;
  console.log(`competenze v2: ${m} asserzioni OK`);
}

// ── campi specchio su ClickUp (03/10) ────────────────────────────────────────
{
  const { mirrorText } = await import("../src/lib/hr-clickup-map.js");
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };
  const person = { id: "p_x", fields: {
    firstName: "Giulia", birthPlace: { name: "Roma", prov: "RM", code: "H501" },
    residenceComune: { abroad: true, country: "Spagna", city: "Madrid\nPartita IVA: sì" }, residenceCap: "28001",
    skillLevels: { of_chat: "Esperto" }, otherSkills: "riga1\nriga2",
  } };
  const metaAll = ["Luogo di nascita", "Comune di residenza", "CAP", "Competenze e livello", "Ruoli già ricoperti", "Vorrebbe imparare", "Altro che sa fare"]
    .map((name, i) => ({ id: `m${i}`, name, type: name === "Competenze e livello" ? "text" : "short_text" }));
  const plan = personToClickup(person, metaAll, {});
  const byKey = Object.fromEntries(plan.fieldOps.map((o) => [o.key, o]));
  t(byKey.birthPlace?.body?.value === "Roma (RM)", "luogo di nascita nel campo dedicato");
  t(byKey.residenceComune?.body?.value === "Madrid Partita IVA: sì, Spagna", "città estera su una riga");
  t(byKey.residenceCap?.body?.value === "28001", "CAP nel campo dedicato");
  t(byKey.pastRoles?.remove === true, "campo vuoto → rimosso su ClickUp");
  t(!/\n/.test(byKey.otherSkills?.body?.value || "x\n"), "altro che sa fare su una riga");
  t(!plan.description.includes("Luogo di nascita:") && !plan.description.includes("Altro che sa fare:"), "niente doppione nel blocco");
  const planNo = personToClickup(person, [], {});
  t(planNo.description.includes("Luogo di nascita: Roma (RM)"), "senza campo dedicato resta nel blocco");
  t(!planNo.fieldOps.some((o) => o.key === "birthPlace"), "senza campo dedicato nessuna scrittura");
  const planKeys = personToClickup(person, metaAll, { keys: ["residenceComune"] });
  t(planKeys.fieldOps.some((o) => o.key === "residenceCap"), "cambio comune riscrive anche il CAP");
  t(mirrorText("learnWish", {}) === "", "vuoto = stringa vuota");
  n += m;
  console.log(`campi specchio: ${m} asserzioni OK`);
}

// ── 03/10: link UNICO del modulo (condiviso) + carta di benvenuto ─────────────
// hr-people.js parla col KV: qui @vercel/kv è sostituito da un KV in memoria
// (hook di risoluzione dei moduli). Nessuna chiamata di rete, nessun dato reale.
{
  const { registerHooks } = await import("node:module");
  const store = new Map();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  globalThis.__hrFakeKv = {
    async get(k) { return store.has(k) ? clone(store.get(k)) : null; },
    async set(k, v, o = {}) { if (o?.nx && store.has(k)) return null; store.set(k, clone(v)); return "OK"; },
    async del(...ks) { let c = 0; for (const k of ks.flat()) if (store.delete(k)) c++; return c; },
    async hset(k, obj) { const h = { ...(store.get(k) || {}) }; Object.assign(h, clone(obj)); store.set(k, h); return Object.keys(obj).length; },
    async hget(k, f) { const h = store.get(k) || {}; return f in h ? clone(h[f]) : null; },
    async hgetall(k) { const h = store.get(k); return h && Object.keys(h).length ? clone(h) : null; },
    async hdel(k, ...fs) { const h = { ...(store.get(k) || {}) }; let c = 0; fs.forEach((f) => { if (f in h) { delete h[f]; c++; } }); store.set(k, h); return c; },
    async mget(...ks) { return ks.map((k) => (store.has(k) ? clone(store.get(k)) : null)); },
    async sadd(k, ...mm) { const s = new Set(store.get(k) || []); mm.forEach((x) => s.add(x)); store.set(k, [...s]); return mm.length; },
    async smembers(k) { return [...(store.get(k) || [])]; },
    async srem(k, ...mm) { const s = new Set(store.get(k) || []); let c = 0; mm.forEach((x) => { if (s.delete(x)) c++; }); store.set(k, [...s]); return c; },
    async lpush(k, ...v) { store.set(k, [...v.reverse(), ...(store.get(k) || [])]); return store.get(k).length; },
    async ltrim(k, a, b) { store.set(k, (store.get(k) || []).slice(a, b + 1)); return "OK"; },
    async lrange(k, a, b) { return (store.get(k) || []).slice(a, b + 1); },
    async incr(k) { const v = Number(store.get(k) || 0) + 1; store.set(k, v); return v; },
    async expire() { return 1; },
  };
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "@vercel/kv") return { url: "data:text/javascript,export const kv = globalThis.__hrFakeKv;", shortCircuit: true };
      return next(specifier, context);
    },
  });
  delete process.env.HR_CLICKUP_LIST_ID; // sync spenta: nessuna chiamata a ClickUp
  const H = await import("../src/lib/hr-people.js");
  const fake = globalThis.__hrFakeKv;
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };

  // una persona già in CRM (come da import ClickUp), con CF
  const existing = await H.savePerson({ input: { firstName: "Giulia", surname: "Rossi", personalEmail: "giulia@example.com", codiceFiscale: "RSSMRA85T10A562S" }, actor: "test", sync: false });
  t(existing.ok, "persona esistente creata");

  // creazione del link condiviso
  t((await H.getSharedFormLink()) === null, "all'inizio nessun link condiviso");
  const a = await H.regenerateSharedFormLink({ actor: "admin" });
  t(a.ok && /^\/hr\/modulo\/[A-Za-z0-9_-]{20,64}$/.test(a.path) && !a.replaced, "link condiviso creato");
  t((await H.getSharedFormLink())?.token === a.token, "il link attivo è quello appena creato");
  t(await H.isSharedFormToken(a.token), "riconosciuto come condiviso");

  // mai dati precompilati, anche se la scheda esiste
  const ctx = await H.getFormContext(a.token);
  t(ctx.ok && ctx.shared === true && ctx.state === "open" && !ctx.done, "contesto del link condiviso aperto");
  t(Object.keys(ctx.prefill).length === 0, "nessun prefill col link condiviso");
  t(ctx.cfPresent === false, "cfPresent sempre false col link condiviso");
  t(ctx.expiresAt === null, "nessuna scadenza");
  t(!JSON.stringify(ctx).includes("giulia@example.com") && !JSON.stringify(ctx).includes(existing.person.id), "nessun dato di persone nel contesto");

  // ogni invio crea una scheda NUOVA (anche con la stessa email di una scheda esistente)
  const before = (await H.listPeople()).length;
  const s1 = await H.submitForm(a.token, { consent: true, data: { ...req(), firstName: "Giulia", surname: "Rossi", personalEmail: "giulia@example.com", gender: "Female" } });
  t(s1.ok && typeof s1.uploadToken === "string" && s1.uploadToken !== a.token, "invio ok, token figlio restituito");
  const s2 = await H.submitForm(a.token, { consent: true, data: { ...req(), firstName: "Marco" } });
  t(s2.ok && s2.uploadToken !== s1.uploadToken, "secondo invio ok, token figlio diverso");
  t((await H.listPeople()).length === before + 2, "due invii = due schede nuove");
  const unchanged = await H.getPerson(existing.person.id);
  t(unchanged.fields.firstName === "Giulia" && !unchanged.consent && !unchanged.formLink, "la scheda esistente NON è stata toccata");
  const child1 = await fake.get(`hr:form:${s1.uploadToken}`);
  const created1 = await H.getPerson(child1.personId);
  t(created1 && created1.id !== existing.person.id && created1.source === "modulo" && created1.consent?.version, "il figlio punta alla scheda nuova, con consenso");
  t(child1.child === true && child1.submittedAt && child1.expiresAt - child1.submittedAt === 3600 * 1000, "figlio: già inviato, 1 ora");
  t(created1.fields.collaborationStatus === "In ingresso", "modulo (link condiviso): persona nuova in fase «In ingresso»");
  t(!unchanged.fields.collaborationStatus, "la scheda esistente non riceve una fase");
  t((await H.getFormContext(a.token)).state === "open", "il link condiviso resta aperto dopo l'invio");
  t(!(await H.submitForm(a.token, { data: { ...req(), firstName: "X" } })).ok, "senza consenso: rifiutato");

  // token figlio: solo file, mai dati
  const cctx = await H.getFormContext(s1.uploadToken);
  t(cctx.ok && cctx.done === true && !cctx.prefill, "il token figlio non restituisce dati della scheda");
  t((await H.submitForm(s1.uploadToken, { consent: true, data: { ...req(), firstName: "Y" } })).status === 409, "il token figlio non accetta un secondo invio");

  // upload rifiutato sul token condiviso (prima di qualunque altro controllo)
  const U = await import("../src/lib/hr-uploads.js");
  const up = await U.requestUploadSlot(a.token, { kind: "document", contentType: "application/pdf", size: 1000 });
  t(!up.ok && up.status === 403, "upload sul token condiviso rifiutato");
  const upChild = await U.requestUploadSlot(s1.uploadToken, { kind: "document", contentType: "application/pdf", size: 1000 });
  t(!upChild.ok && upChild.status === 503, "sul figlio si arriva fino al controllo sync (spenta in test)");

  // tetto giornaliero di invii
  const bucket = Math.floor(Math.floor(Date.now() / 1000) / 86400);
  await fake.set(`rl:hr_form_shared_submit:86400:${a.token.slice(0, 64)}:${bucket}`, 2000);
  const capped = await H.submitForm(a.token, { consent: true, data: { ...req(), firstName: "Luca" } });
  t(!capped.ok && capped.status === 429, "oltre 2000 invii al giorno: rifiutato");
  t((await H.listPeople()).length === before + 2, "l'invio oltre il tetto non crea schede");

  // rigenerazione: il vecchio smette di funzionare
  const b = await H.regenerateSharedFormLink({ actor: "admin" });
  t(b.replaced && b.token !== a.token, "link rigenerato");
  const oldCtx = await H.getFormContext(a.token);
  t(!oldCtx.ok && oldCtx.status === 410, "il vecchio link non è più valido");
  t((await H.submitForm(a.token, { consent: true, data: { ...req(), firstName: "Z" } })).status === 410, "il vecchio link non accetta invii");
  t(!(await H.isSharedFormToken(a.token)) && (await H.isSharedFormToken(b.token)), "solo il nuovo è il condiviso");
  t((await H.getFormContext(b.token)).ok, "il nuovo funziona");
  // record vecchio ancora "attivo" ma non più puntato (rigenerazione interrotta a metà) → comunque spento
  await fake.set(`hr:form:${a.token}`, { token: a.token, shared: true, createdAt: 1 });
  t(!(await H.getFormContext(a.token)).ok, "un condiviso non puntato da hr:form:shared non funziona");

  // disattivazione
  await H.disableSharedFormLink({ actor: "admin" });
  t((await H.getSharedFormLink()) === null && !(await H.getFormContext(b.token)).ok, "disattivato: nessun link attivo");

  // i link personali già mandati continuano a funzionare
  const p = await H.createFormLink({ personId: existing.person.id, actor: "admin" });
  const pctx = await H.getFormContext(p.token);
  t(pctx.ok && pctx.prefill.firstName === "Giulia" && pctx.cfPresent === true && !pctx.shared, "link personale: prefill come prima");
  const ps = await H.submitForm(p.token, { consent: true, data: { ...req(), firstName: "Giulia", surname: "Rossi" } });
  t(ps.ok && ps.uploadToken === p.token, "link personale: i file restano sul suo token");
  t(!(await H.getPerson(existing.person.id)).fields.collaborationStatus, "link personale su scheda esistente: la fase non si tocca");
  const pNew = await H.createFormLink({ actor: "admin" });
  const psNew = await H.submitForm(pNew.token, { consent: true, data: { ...req(), firstName: "Nuova" } });
  const recNew = await fake.get(`hr:form:${pNew.token}`);
  t(psNew.ok && (await H.getPerson(recNew.personId)).fields.collaborationStatus === "In ingresso", "link personale senza scheda: persona nuova «In ingresso»");
  const pIndicated = await H.savePerson({ input: { firstName: "Con fase", collaborationStatus: "Attiva" }, allowed: ["firstName", "collaborationStatus"], actor: "modulo", source: "modulo", sync: false });
  t(pIndicated.person.fields.collaborationStatus === "Attiva", "fase indicata: il default non la sovrascrive");

  // carta di benvenuto
  const W = await import("../src/lib/hr-welcome-card.js");
  t(W.welcomeTitle({ firstName: "Giulia", gender: "Female" }) === "Benvenuta in House of Creators, Giulia.", "titolo femminile");
  t(W.welcomeTitle({ firstName: "Marco", gender: "Male" }) === "Benvenuto in House of Creators, Marco.", "titolo maschile");
  t(W.welcomeTitle({ firstName: "Andrea", gender: "Non-Binary" }) === "Ti diamo il benvenuto in House of Creators, Andrea.", "altra opzione: neutro");
  t(W.welcomeTitle({ firstName: "Giulia" }) === "Ti diamo il benvenuto in House of Creators, Giulia.", "genere non indicato: neutro (mai dedotto dal nome)");
  t(W.welcomeTitle({ gender: "I prefer not to declare it" }) === "Ti diamo il benvenuto in House of Creators.", "senza nome: niente nome");
  t(W.welcomeTitle({ gender: "Female" }) === "Benvenuta in House of Creators.", "senza nome, genere indicato");
  t(W.cardInitials({ firstName: "giulia", surname: "rossi" }) === "GR" && W.cardInitials({ firstName: "Marco" }) === "M", "iniziali");
  t(W.roleAbbr("Chatter") === "CHAT" && W.roleAbbr("Media buyer") === "MEDIA" && W.roleAbbr("") === "", "ruolo abbreviato");
  t(W.cardName({ firstName: "Giulia", surname: "rossi" }) === "Giulia R.", "nome nella banda");
  const st = W.cardStats({
    skillLevels: { of_chat: "Esperto", of_account: "Base", ai_coding: "Autonomo", soc_instagram: "Base" },
    spokenLanguages: ["ITA - Native", "ENG - B2"],
    residenceComune: { name: "Milano", prov: "MI" },
  });
  t(st.map((s) => `${s.label} · ${s.value}`).join(" | ") === "ONLY · ESP | AI · AUT | SOCIAL · BASE | ENG · B2 | ITA · MADRE", "statistiche: aree più forti, lingue (niente città)");
  t(W.cardStats({}).length === 0, "senza dati: nessuna riga finta");
  t(W.cardStats({ skillLevels: { of_chat: "Base" } }).length === 1, "pochi dati: poche righe");
  t(W.memberSince(new Date(2026, 9, 3).getTime()) === "House of Creators", "intestazione del retro: solo la Casa, niente data né numero di membro");

  n += m;
  console.log(`link condiviso + carta: ${m} asserzioni OK`);
}

// ── 03/10 sera: esperienza del modulo (bozza, avanzamento, errori) + tessera D1 ──
{
  let m = 0; const t = (c, msg) => { assert.ok(c, msg); m++; };
  const X = await import("../src/lib/hr-form-experience.js");
  const W = await import("../src/lib/hr-welcome-card.js");
  const fs = await import("node:fs");

  // avanzamento a parole
  t(X.progressWords(4, 7) === "Ancora 3 capitoli", "5 di 7 → ancora 3 (compreso questo)");
  t(X.progressWords(5, 7) === "Ancora 2 capitoli", "penultimo");
  t(X.progressWords(6, 7) === "Ultimo capitolo", "ultimo");
  t(X.progressWords(0, 7) === "Ancora 7 capitoli", "primo");
  t(X.timeEstimateText() === "Ci vogliono tra 6 e 10 minuti.", "stima in intervallo, non un numero tondo");
  t(X.timeEstimateText([[2, 2]]) === "Ci vogliono circa 2 minuti.", "stima unica");

  // errori per campo, gentili
  const e0 = X.fieldErrors({}, ["firstName", "surname"]);
  t(Object.keys(e0).sort().join() === "firstName,surname" && /nome/.test(e0.firstName) && /Ci serve/.test(e0.surname), "nome e cognome mancanti → errore sotto ciascuno");
  t(!X.fieldErrors({}, ["linkedin", "personalInterests", "currentJob", "otherSkills"]).linkedin, "i facoltativi restano facoltativi");
  t(X.missingRequired({ residenceComune: { abroad: true, country: "Spagna" } }).includes("codiceFiscale") === false, "chi vive all'estero: CF non obbligatorio");
  t(X.missingRequired({ residenceComune: { name: "Milano" } }).includes("codiceFiscale"), "chi vive in Italia: CF obbligatorio");
  t(!X.missingRequired({}, { cfEnabled: false }).includes("codiceFiscale"), "CF spento: non si pretende");
  t(X.missingRequired({ source: "Me l'ha consigliato qualcuno" }).includes("referredBy") && !X.missingRequired({ source: "Altro" }).includes("referredBy"), "chi ti ha segnalato: solo per le reference");
  t(!X.missingRequired({ partitaIva: false }).includes("partitaIva"), "partita IVA «no» è una risposta");
  t(X.isBlank({ abroad: false, name: "" }) && !X.isBlank({ abroad: false, name: "Roma" }) && X.isBlank([]) && X.isBlank({}), "vuoto: oggetti e liste");
  t(!X.fieldErrors({ firstName: "Giulia" }, ["firstName"]).firstName, "nome presente → niente errore");
  t(/codice fiscale/i.test(X.fieldErrors({ firstName: "G", codiceFiscale: "RSSMRA85T10A562T" }, ["firstName", "codiceFiscale"]).codiceFiscale || ""), "CF sbagliato → errore sotto il CF");
  t(!X.fieldErrors({ codiceFiscale: "RSSMRA85T10A562S" }, ["codiceFiscale"]).codiceFiscale, "CF giusto → niente errore");
  t(!X.fieldErrors({ codiceFiscale: "XX" }, ["codiceFiscale"], { cfEnabled: false }).codiceFiscale, "CF spento → non si controlla");
  t(X.fieldErrors({ personalEmail: "giulia@" }, ["personalEmail"]).personalEmail, "email incompleta");
  t(!X.fieldErrors({ personalEmail: "giulia@ex.it" }, ["personalEmail"]).personalEmail, "email giusta");
  t(X.fieldErrors({ personalPhone: "+39 12" }, ["personalPhone"]).personalPhone && !X.fieldErrors({ personalPhone: "+39 333 1234567" }, ["personalPhone"]).personalPhone, "telefono troppo corto");
  t(!X.fieldErrors({}, ["personalEmail"]).firstName, "solo i campi del capitolo");
  const srv = X.fieldErrorsFromServer("Email personale: indirizzo non valido. Telefono personale: numero troppo corto. Altro problema.");
  t(srv.errors.personalEmail && srv.errors.personalPhone && srv.rest === "Altro problema.", "errori del server → sotto i campi, il resto in generale");
  t(X.fieldErrorsFromServer("Nome: obbligatorio.").errors.firstName === "Ci serve questo dato: scrivilo qui.", "obbligatorio → frase gentile");
  t(X.firstStepWithError([{ keys: ["firstName"] }, { keys: ["personalEmail"] }], { personalEmail: "x" }) === 1, "si torna al capitolo del primo errore");

  // bozza nel browser: mai il codice fiscale
  const raw = X.serializeDraft({ data: { firstName: "Giulia", codiceFiscale: "RSSMRA85T10A562S", hacker: 1 }, step: 3 }, 1000);
  t(!raw.includes("RSSMRA") && !raw.includes("codiceFiscale"), "il codice fiscale NON si salva nel browser");
  t(!raw.includes("hacker"), "solo i campi del modulo");
  const back = X.parseDraft(raw, { steps: 7, now: 2000 });
  t(back && back.step === 3 && back.data.firstName === "Giulia" && !("codiceFiscale" in back.data), "bozza ripresa: capitolo e risposte");
  t(X.parseDraft(raw, { steps: 7, now: 1000 + X.DRAFT_MAX_AGE_MS + 1 }) === null, "bozza troppo vecchia → ignorata");
  t(X.parseDraft(raw, { steps: 3, now: 2000 }) === null, "capitolo fuori dai capitoli → ignorata");
  t(X.parseDraft("{rotto", { steps: 7 }) === null && X.parseDraft(null) === null, "bozza rotta o assente → null");
  t(X.parseDraft(JSON.stringify({ v: 1, savedAt: 1000, stage: "form", step: 0, data: { codiceFiscale: "RSSMRA85T10A562S" } }), { steps: 7, now: 2000 }).data.codiceFiscale === undefined, "CF scritto a mano nella bozza → scartato in lettura");
  t(!X.draftWorthSaving({ data: {}, step: 0 }) && X.draftWorthSaving({ data: { firstName: "G" }, step: 0 }) && X.draftWorthSaving({ data: {}, step: 2 }), "si salva solo se c'è qualcosa");
  t(!X.draftWorthSaving({ data: { codiceFiscale: "X" }, step: 0 }), "solo il CF non vale una bozza");
  t(X.draftKey("abc") === "hoc:hr-modulo:abc", "chiave legata al token");
  // localStorage che lancia (navigazione privata): il modulo va avanti
  const boom = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); }, removeItem() { throw new Error("x"); } };
  t(X.safeGet("k", boom) === null && X.safeSet("k", "v", boom) === false, "storage che lancia → nessun errore");
  X.safeRemove("k", boom);
  const mem = new Map();
  const ok = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  t(X.safeSet("k", "v", ok) === true && X.safeGet("k", ok) === "v", "storage normale");
  X.safeRemove("k", ok);
  t(X.safeGet("k", ok) === null, "rimozione dopo l'invio");
  t(X.safeGet("k", null) === null && X.safeSet("k", "v", null) === false, "nessuno storage (server)");
  t(/House of Creators/.test(X.HOUSE_LETTER.text) && X.HOUSE_LETTER.signature === "House of Creators", "messaggio della Casa in una costante");

  // tessera D1: fronte e retro
  t(W.tesseraName({ firstName: "giulia", surname: "de rossi" }) === "Giulia De Rossi" && W.tesseraName({ firstName: "Anna Maria" }) === "Anna Maria", "nome completo sulla tessera");
  t(W.roleLabel("Chatter (operatore di chat)") === "Chatter" && W.roleLabel("") === "", "ruolo chatter");
  t(W.roleLabel("responsabile della comunicazione digitale") === "Responsabile della…", "mansione lunga abbreviata a parola intera");
  t(W.tesseraLine({ currentJob: "Chatter (operatore di chat)", residenceComune: { name: "Milano", prov: "MI" } }, new Date(2026, 9, 3).getTime()) === "", "fronte: niente ruolo, niente «membro da», niente città (04/10)");
  const rows = W.tesseraRows({ gender: "Female", skillLevels: { of_chat: "Esperto", ai_coding: "Autonomo" }, spokenLanguages: ["ITA - Native", "ENG - B2"], residenceComune: { abroad: true, country: "Spagna", city: "Madrid" }, timeSlots: ["17:00 - 22:00", "22:00 - 03:00"] });
  t(rows.map((r) => `${r.label} · ${r.value}`).join(" | ") === "OnlyFans · Esperta | Intelligenza artificiale · Autonoma | Inglese · B2 | Italiano · Madrelingua | Disponibilità · Sera · Notte", "retro: righe pulite, genere dichiarato, disponibilità, niente città");
  t(W.tesseraRows({ skillLevels: { of_chat: "Esperto" } })[0].value === "Livello esperto", "genere non indicato: forma neutra");
  t(W.tesseraRows({ gender: "Male", skillLevels: { of_chat: "Posso insegnarla" } })[0].value === "Può insegnarla", "posso insegnarla");
  t(W.tesseraRows({}).length === 0, "retro senza dati: nessuna riga finta");
  t(W.tesseraMilestones({ firstName: "G", residenceComune: { name: "Roma" }, timeSlots: ["7:00 - 12:00"] }).join() === "name,slots", "pezzi comparsi per il riflesso (niente città)");

  // testi visibili: "tessera", mai "card"
  const page = fs.readFileSync(new URL("../src/app/hr/modulo/[token]/page.js", import.meta.url), "utf8");
  const reveal = fs.readFileSync(new URL("../src/components/HrWelcomeCard.js", import.meta.url), "utf8");
  t(page.includes("e sblocca la tua tessera.") && page.includes("Questa è una tessera d&apos;esempio") && page.includes("Questa è la tua tessera."), "testi del modulo con «tessera»");
  t(!/(sblocca la tua|una|la tua|Questa è la tua) card\b/i.test(page + reveal), "nessuna «card» nei testi visibili");
  t(reveal.includes("Salva la tua tessera") && reveal.includes("Rivedi"), "finale: salva e rivedi");
  const png = fs.readFileSync(new URL("../src/lib/hr-tessera-png.js", import.meta.url), "utf8");
  t(!/personalEmail|personalPhone|codiceFiscale/.test(png.replace(/\/\*[\s\S]*?\*\//g, "")), "il PNG non legge email, telefono o CF");

  n += m;
  console.log(`esperienza modulo + tessera D1: ${m} asserzioni OK`);
}

// ── 03/10: campi specchio a DUE VIE — lettura del testo ClickUp ────────────────
{
  const { readFileSync } = await import("node:fs");
  const { parseMirror, mirrorText, mirrorPrint, splitTop } = await import("../src/lib/hr-mirror.js");
  const comuni = JSON.parse(readFileSync(new URL("../public/data/comuni-istat.json", import.meta.url), "utf8"));
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };
  const same = (a, b, msg) => { assert.deepEqual(a, b, msg); m++; };
  const P = (k, text) => parseMirror(k, text, { comuni });

  // competenze
  same(P("skillLevels", "OnlyFans: Chat e vendita (Esperto), Gestione account (Base)").value, { of_chat: "Esperto", of_account: "Base" }, "competenze: formato standard");
  same(P("skillLevels", "  onlyfans :  chat E VENDITA ( esperto ) ;gestione account").value, { of_chat: "Esperto", of_account: "Base" }, "competenze: maiuscole, spazi, ; e voce senza livello = Base");
  same(P("skillLevels", "Instagram (Autonomo)\nOF Messaging (posso insegnarla)").value, { soc_instagram: "Autonomo", of_chat: "Posso insegnarla" }, "competenze: senza area, a capo, vecchia etichetta ClickUp");
  same(P("skillLevels", "Contenuti: Reels, Shorts e TikTok (Esperto), Grafica (Photoshop, Illustrator, Figma, Canva) (Base)").value, { cnt_short: "Esperto", cnt_graphic: "Base" }, "competenze: virgole dentro i nomi");
  same(P("skillLevels", "Social: Instagram (Base)").value, { soc_instagram: "Base" }, "competenze: area abbreviata accettata");
  same(P("skillLevels", "Instagram (Base), Instagram (Esperto)").value, { soc_instagram: "Esperto" }, "competenze: doppione → livello più alto");
  t(!P("skillLevels", "Instagram (Base), Astrofisica (Esperto)").ok, "competenze: voce sconosciuta → non riconosciuto (niente perdite)");
  t(P("skillLevels", "Instagram (Base), Astrofisica (Esperto)").unknown.includes("Astrofisica (Esperto)"), "competenze: la voce sconosciuta è nominata");
  t(!P("skillLevels", "Instagram (bravissimo)").ok, "competenze: livello sconosciuto → non riconosciuto");
  t(!P("skillLevels", "Cose varie: Instagram (Base)").ok, "competenze: intestazione che non è un'area → non riconosciuto");
  same(P("skillLevels", "").value, {}, "competenze: testo vuoto = svuotate");
  t(P("skillLevels", " — \n , ").ok, "competenze: sola punteggiatura = ignorabile");
  // ruoli
  same(P("pastRoles", "Media buyer (1-3 anni), venditore; Altro: fotografo, videomaker (meno di 1 anno)").value,
    [{ role: "media_buyer", duration: "1to3" }, { role: "sales", duration: null }, { role: "other", duration: "lt1", other: "fotografo, videomaker" }], "ruoli: durate, durata assente = null, Altro con virgola");
  same(P("pastRoles", "PRODUCT MANAGER (oltre 5 anni)").value, [{ role: "product_manager", duration: "gt5" }], "ruoli: maiuscole");
  t(!P("pastRoles", "Astronauta (1-3 anni)").ok, "ruoli: ruolo sconosciuto → non riconosciuto");
  t(!P("pastRoles", "Media buyer (2 anni)").ok, "ruoli: durata sconosciuta → non riconosciuto");
  same(P("pastRoles", "").value, [], "ruoli: vuoto");
  // vorrebbe imparare
  same(P("learnWish", "instagram, Reels, Shorts e TikTok").value, ["soc_instagram", "cnt_short"], "imparare: nomi, virgola nel nome");
  same(P("learnWish", "Google Ads").value, ["ads_google"], "imparare: una voce");
  t(!P("learnWish", "Instagram, TikTok, SEO").ok, "imparare: più di 2 → non riconosciuto (non si tagliano dati)");
  t(!P("learnWish", "Instagram, Volare").ok, "imparare: voce sconosciuta");
  same(P("learnWish", "").value, [], "imparare: vuoto");
  // luoghi
  same(P("birthPlace", "Roma (RM)").value, { abroad: false, name: "Roma", prov: "RM", code: "H501" }, "nascita: comune con sigla");
  same(P("birthPlace", "roma, rm").value, { abroad: false, name: "Roma", prov: "RM", code: "H501" }, "nascita: minuscolo con virgola e sigla");
  same(P("birthPlace", "Roma").value?.code, "H501", "nascita: solo il nome");
  same(P("birthPlace", "Spagna").value, { abroad: true, country: "Spagna" }, "nascita: paese estero");
  same(P("birthPlace", "Madrid, Spagna").value, { abroad: true, country: "Spagna" }, "nascita: città, paese → paese");
  t(!P("birthPlace", "Rmoa").ok, "nascita: refuso → non riconosciuto");
  same(P("birthPlace", "").value, null, "nascita: vuoto");
  t(!P("residenceComune", "Castro").ok && /sigla/.test(P("residenceComune", "Castro").reason), "comune ambiguo senza sigla → non riconosciuto, chiede la sigla");
  same(P("residenceComune", "Castro (LE)").value?.prov, "LE", "comune ambiguo con sigla → la sigla decide");
  same(P("residenceComune", "castro, bg").value?.prov, "BG", "comune ambiguo con ', sigla'");
  t(!P("residenceComune", "Roma (MI)").ok, "comune con sigla sbagliata → non riconosciuto");
  same(P("residenceComune", "Madrid, Spagna").value, { abroad: true, country: "Spagna", city: "Madrid" }, "residenza estera: città, paese");
  same(P("residenceComune", "Lione, Borgogna, Francia").value, { abroad: true, country: "Francia", city: "Lione, Borgogna" }, "residenza estera: ultimo pezzo = paese, il resto = città");
  same(P("residenceComune", "Bolzano").value?.code, "A952", "nome bilingue (Bolzano/Bozen) riconosciuto");
  t(!parseMirror("residenceComune", "Roma", { comuni: null }).ok, "senza elenco comuni: non riconosciuto (mai indovinare)");
  // testo semplice
  same(P("residenceCap", " 00185 ").value, "00185", "CAP: spazi tolti");
  same(P("residenceCap", "").value, null, "CAP vuoto = svuotato");
  same(P("otherSkills", "x".repeat(800)).value.length, 500, "altro: stesso limite dell'app (500)");

  // giro completo app → testo → app = stesso valore
  const app = {
    birthPlace: { abroad: false, name: "Napoli", prov: "NA", code: "F839" },
    residenceComune: { name: "Castro", prov: "LE", code: "M261", region: "Puglia" },
    residenceCap: "73030",
    skillLevels: { of_chat: "Esperto", cnt_short: "Autonomo", cnt_graphic: "Base", ai_coding: "Posso insegnarla" },
    pastRoles: [{ role: "media_buyer", duration: "1to3" }, { role: "other", duration: null, other: "fotografo, videomaker" }],
    learnWish: ["ads_google", "cnt_short"],
    otherSkills: "Suono il pianoforte",
  };
  for (const k of Object.keys(app)) {
    const r = P(k, mirrorText(k, app));
    t(r.ok && valuesEqual(r.value, app[k]), `giro completo ${k}: ${mirrorText(k, app)}`);
  }
  const abroad = { birthPlace: { abroad: true, country: "Romania" }, residenceComune: { abroad: true, country: "Spagna", city: "Madrid" } };
  for (const k of Object.keys(abroad)) t(valuesEqual(P(k, mirrorText(k, abroad)).value, abroad[k]), `giro completo estero ${k}`);
  t(mirrorPrint("Roma (RM)") === mirrorPrint("  roma   (rm) \n"), "impronta del testo: spazi e maiuscole non contano");
  t(mirrorPrint("Roma (RM)") !== mirrorPrint("Milano (MI)"), "impronta del testo: testi diversi");
  same(splitTop("a (b, c), d"), ["a (b, c)", "d"], "split fuori dalle parentesi");

  // mapping: taskToPerson legge i campi specchio, historyItemKey li riconosce per nome
  const { historyItemKey: hik } = await import("../src/lib/hr-clickup-map.js");
  const task = { id: "t1", name: "Giulia", custom_fields: [
    { id: "m-bp", name: "Luogo di nascita", type: "short_text", value: "Roma (RM)" },
    { id: "m-sk", name: "Competenze e livello", type: "text", value: "Astrofisica (Esperto)" },
    { id: "m-cap", name: "CAP", type: "short_text" },
  ] };
  const tp = taskToPerson(task, { comuni });
  t(tp.fields.birthPlace?.code === "H501" && tp.mirrors.birthPlace.ok, "taskToPerson: luogo letto");
  t(!("skillLevels" in tp.fields) && tp.mirrors.skillLevels.ok === false, "taskToPerson: testo illeggibile NON entra nei campi");
  t(tp.fields.residenceCap === null && tp.mirrors.residenceCap.text === "", "taskToPerson: campo vuoto = valore vuoto");
  t(hik({ field: "custom_field", custom_field: { id: "m-bp", name: "Luogo di nascita" } }) === "birthPlace", "historyItemKey: campo specchio per nome");
  t(hik({ field: "custom_field", custom_field_id: "m-cap" }, [{ id: "m-cap", name: "CAP" }]) === "residenceCap", "historyItemKey: campo specchio per id via metadati");
  t(incomingTimestamps([{ field: "custom_field", custom_field: { name: "Vorrebbe imparare" }, date: "123" }], []).learnWish === 123, "incomingTimestamps: data per il campo specchio");
  // base/eco sul testo
  const prints = { birthPlace: mirrorPrint("Roma (RM)") };
  t(dropUnchangedSinceBase({ birthPlace: { name: "x" } }, { birthPlace: mirrorPrint("roma (rm)") }, prints).unchanged.includes("birthPlace"), "base: confronto sul testo, non sull'oggetto");
  t(isOwnEcho({ birthPlace: { h: mirrorPrint("Roma (RM)"), at: 1000 } }, "birthPlace", { anything: 1 }, 2000, undefined, prints.birthPlace), "eco: confronto sul testo");

  n += m;
  console.log(`campi specchio a due vie: ${m} asserzioni OK`);
}

// ── 03/10: giro completo con KV finto + ClickUp FINTO (fetch sostituito) ───────
// Specchio a due vie (eco = nessun cambiamento, modifica vera, testo illeggibile,
// testo vuoto) e archivio come rete di sicurezza (taskDeleted, nessun task ricreato,
// nessuna pulizia, Ripristina; dal 03/10 niente "Elimina"). Nessuna chiamata di rete vera.
{
  const fake = globalThis.__hrFakeKv;
  const H = await import("../src/lib/hr-people.js");
  const { mirrorText } = await import("../src/lib/hr-mirror.js");
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };

  // ClickUp finto: una lista, i campi per nome, task in memoria
  const LIST = "lista-prova";
  const FIELDS_META = [
    { id: "f-sur", name: "Surname", type: "short_text" },
    { id: "f-skills", name: "Skills", type: "labels", type_config: { options: [{ id: "o-ofm", label: "OF Messaging" }, { id: "o-ig", label: "Instagram" }] } },
    ...["Luogo di nascita", "Comune di residenza", "CAP", "Competenze e livello", "Ruoli già ricoperti", "Vorrebbe imparare", "Altro che sa fare"]
      .map((name, i) => ({ id: `f-m${i}`, name, type: name === "Competenze e livello" ? "text" : "short_text" })),
  ];
  const byFieldName = (n) => FIELDS_META.find((f) => f.name === n);
  const cu = { tasks: new Map(), seq: 0, deleteDown: false, calls: [] };
  const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body) });
  const notFound = () => json(404, { err: "Task not found", ECODE: "ITEM_015" });
  const taskView = (tk) => ({
    ...tk, list: { id: LIST }, status: { status: "to do" },
    custom_fields: FIELDS_META.map((f) => ({ ...f, value: tk.values[f.id] })),
  });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/api\/v2/, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    cu.calls.push(`${method} ${p}`);
    let mm;
    if (method === "GET" && p === `/list/${LIST}/field`) return json(200, { fields: FIELDS_META });
    if (method === "GET" && p === `/list/${LIST}`) return json(200, { id: LIST, name: "Prova HR", statuses: [] });
    if (method === "GET" && p === `/list/${LIST}/task`) return json(200, { tasks: [...cu.tasks.values()].map(taskView), last_page: true });
    if (method === "POST" && p === `/list/${LIST}/task`) {
      const id = `t${++cu.seq}`;
      const values = {};
      for (const cf of body.custom_fields || []) values[cf.id] = cf.value;
      cu.tasks.set(id, { id, name: body.name, description: body.description, values, date_updated: String(Date.now()) });
      return json(200, { id, url: `https://app.clickup.com/t/${id}` });
    }
    if ((mm = /^\/task\/([^/]+)\/field\/([^/]+)$/.exec(p))) {
      const tk = cu.tasks.get(mm[1]);
      if (!tk) return notFound();
      if (method === "POST") tk.values[mm[2]] = body.value; else delete tk.values[mm[2]];
      return json(200, {});
    }
    if ((mm = /^\/task\/([^/]+)$/.exec(p))) {
      const tk = cu.tasks.get(mm[1]);
      if (method === "DELETE") {
        if (cu.deleteDown) return json(503, { err: "giù" });
        if (!tk) return notFound();
        cu.tasks.delete(mm[1]);
        return json(200, {});
      }
      if (!tk) return notFound();
      if (method === "PUT") { Object.assign(tk, body); return json(200, {}); }
      return json(200, taskView(tk));
    }
    return json(500, { err: `rotta non prevista nel finto: ${method} ${p}` });
  };
  process.env.HR_CLICKUP_LIST_ID = LIST;
  process.env.CLICKUP_API_TOKEN = "pk_test_finto";
  // sul ClickUp finto: un utente cambia il testo di un campo specchio (e la data del task)
  const editOnClickup = (taskId, fieldName, value) => {
    const tk = cu.tasks.get(taskId);
    const f = byFieldName(fieldName);
    if (value == null) delete tk.values[f.id]; else tk.values[f.id] = value;
    tk.date_updated = String(Date.now() + 1000);
    return f;
  };
  const webhook = (taskId, fieldNames) => H.handleWebhookEvent({
    event: "taskUpdated", task_id: taskId,
    history_items: fieldNames.map((n) => ({ field: "custom_field", custom_field: { id: byFieldName(n).id, name: n }, date: String(Date.now() + 1000), user: { username: "hr-clickup" } })),
  });
  const logOf = async (id) => H.getLog(id, 500);

  // 1) creazione in app → task su ClickUp coi testi specchio
  const created = await H.savePerson({ input: {
    firstName: "Sara", surname: "Bianchi",
    birthPlace: { abroad: false, name: "Napoli", prov: "NA", code: "F839" },
    residenceComune: { name: "Castro", prov: "LE", code: "M261", region: "Puglia" }, residenceCap: "73030",
    skillLevels: { of_chat: "Esperto" }, pastRoles: [{ role: "media_buyer", duration: "1to3" }], learnWish: ["ads_google"], otherSkills: "Pianoforte",
  }, actor: "admin", source: "app" });
  t(created.ok && created.sync?.status === "ok", "scheda creata e portata su ClickUp");
  const sara = await H.getPerson(created.person.id);
  const taskId = sara.clickupTaskId;
  const tk = cu.tasks.get(taskId);
  t(tk.values[byFieldName("Luogo di nascita").id] === "Napoli (NA)" && tk.values[byFieldName("Comune di residenza").id] === "Castro (LE)", "testi specchio scritti su ClickUp");
  t(tk.values[byFieldName("Competenze e livello").id] === "OnlyFans: Chat e vendita (Esperto)", "competenze scritte una riga per area");

  // 2) eco: il webhook rimanda indietro i NOSTRI testi → nessun cambiamento
  const logBefore = (await logOf(sara.id)).length;
  const echoRes = await webhook(taskId, ["Luogo di nascita", "Comune di residenza", "Competenze e livello", "Ruoli già ricoperti", "Vorrebbe imparare", "Altro che sa fare", "CAP"]);
  const afterEcho = await H.getPerson(sara.id);
  t(echoRes.kind === "unchanged", "eco dei campi specchio = nessun cambiamento");
  t(valuesEqual(afterEcho.fields.residenceComune, sara.fields.residenceComune) && afterEcho.fields.residenceComune.region === "Puglia", "eco: il comune resta quello dell'app (con regione)");
  t(!(await logOf(sara.id)).slice(0, (await logOf(sara.id)).length - logBefore).some((e) => e.action === "update" || e.action === "mirror_unrecognized"), "eco: nessuna modifica né avviso nello storico");
  // anche la riconciliazione notturna non vede cambiamenti
  const rec0 = await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(rec0.ok && rec0.updated === 0 && rec0.created === 0, "riconciliazione senza modifiche: niente da aggiornare");

  // 2b) incidente 04/10: un campo creato DOPO su ClickUp (vuoto) non deve svuotare l'app,
  //     e il controllo di parità lo riempie con il valore dell'app
  await H.savePerson({ id: sara.id, input: { source: "Altro" }, actor: "admin", source: "app" });
  FIELDS_META.push({ id: "f-prov", name: "Provenienza", type: "drop_down", type_config: { options: [{ id: "o-ref", name: "Me l'ha consigliato qualcuno", orderindex: 0 }, { id: "o-alt", name: "Altro", orderindex: 3 }] } });
  const recNew = await H.importFromClickup({ mode: "import", by: "test" });
  const sNew = await H.getPerson(sara.id);
  t(sNew.fields.source === "Altro", "campo nuovo e vuoto su ClickUp: il valore dell'app resta");
  t(recNew.parityChecked >= 1 && recNew.drift.length === 0 && cu.tasks.get(taskId).values["f-prov"] === "o-alt", "parità: il campo nuovo su ClickUp viene riempito dall'app");
  FIELDS_META.pop();

  // 3) modifica vera su ClickUp → l'app si aggiorna (anche le etichette Skills seguono)
  editOnClickup(taskId, "Luogo di nascita", "milano, mi");
  editOnClickup(taskId, "Competenze e livello", "OnlyFans: Chat e vendita (Esperto)\nSocial organico: Instagram (Autonomo)");
  const r3 = await webhook(taskId, ["Luogo di nascita", "Competenze e livello"]);
  const s3 = await H.getPerson(sara.id);
  t(r3.kind === "updated" && s3.fields.birthPlace?.name === "Milano" && s3.fields.birthPlace?.prov === "MI", "modifica su ClickUp: luogo di nascita aggiornato in app");
  t(s3.fields.skillLevels.soc_instagram === "Autonomo" && s3.fields.skillLevels.of_chat === "Esperto", "modifica su ClickUp: competenze aggiornate in app");
  t(s3.fields.skills.includes("Instagram") && cu.tasks.get(taskId).values["f-skills"]?.includes("o-ig"), "le etichette Skills seguono le competenze (anche su ClickUp)");
  t((await logOf(sara.id)).some((e) => e.action === "update" && e.field === "birthPlace" && e.source === "clickup"), "storico: modifica da ClickUp");

  // 3b) due campi cambiati INSIEME su ClickUp, due webhook separati (caso reale 03/10):
  // il primo non deve "consumare" il secondo
  editOnClickup(taskId, "CAP", "73031");
  editOnClickup(taskId, "Vorrebbe imparare", "TikTok Ads");
  await webhook(taskId, ["CAP"]);
  const r3b = await webhook(taskId, ["Vorrebbe imparare"]);
  const s3b = await H.getPerson(sara.id);
  t(s3b.fields.residenceCap === "73031", "due modifiche insieme: la prima arriva");
  t(r3b.kind === "updated" && valuesEqual(s3b.fields.learnWish, ["ads_tiktok"]), "due modifiche insieme: anche la seconda arriva");

  // 4) testo illeggibile → si tiene l'app, avviso nello storico, al push successivo si riscrive
  editOnClickup(taskId, "Ruoli già ricoperti", "Astronauta (1-3 anni)");
  await webhook(taskId, ["Ruoli già ricoperti"]);
  const s4 = await H.getPerson(sara.id);
  t(valuesEqual(s4.fields.pastRoles, [{ role: "media_buyer", duration: "1to3" }]), "testo illeggibile: tenuto il valore di HOC Pro");
  const warn = (await logOf(sara.id)).find((e) => e.action === "mirror_unrecognized" && e.field === "pastRoles");
  t(warn && /«Astronauta \(1-3 anni\)» non è stato riconosciuto/.test(warn.to) && /tenuto il valore di HOC Pro/.test(warn.to), "storico: avviso leggibile");
  t(s4.mirrorStale?.includes("pastRoles"), "segnato da riscrivere");
  // stesso testo di nuovo (riconciliazione): nessun avviso ripetuto
  const nWarn = (await logOf(sara.id)).filter((e) => e.action === "mirror_unrecognized").length;
  await H.importFromClickup({ mode: "reconcile", by: "test" });
  t((await logOf(sara.id)).filter((e) => e.action === "mirror_unrecognized").length === nWarn, "nessun avviso ripetuto ogni notte");
  t(cu.tasks.get(taskId).values[byFieldName("Ruoli già ricoperti").id] === "Media buyer (1-3 anni)", "la riconciliazione ha riscritto il testo dell'app su ClickUp");
  t(!(await H.getPerson(sara.id)).mirrorStale?.length, "niente più da riscrivere");

  // 5) testo vuoto su ClickUp = campo svuotato in app
  editOnClickup(taskId, "Altro che sa fare", null);
  await webhook(taskId, ["Altro che sa fare"]);
  t((await H.getPerson(sara.id)).fields.otherSkills === null, "testo vuoto su ClickUp: campo svuotato in app");

  // 6) modifica in app → testo nuovo su ClickUp, e la sua eco non cambia niente
  await H.savePerson({ id: sara.id, input: { residenceComune: { abroad: true, country: "Spagna", city: "Madrid" } }, actor: "admin", source: "app" });
  t(cu.tasks.get(taskId).values[byFieldName("Comune di residenza").id] === "Madrid, Spagna", "modifica in app: testo aggiornato su ClickUp");
  const r6 = await webhook(taskId, ["Comune di residenza"]);
  t(r6.kind === "unchanged", "la sua eco non cambia niente");

  // 6b) base vecchia (impronta dell'oggetto, prima del 03/10) e testo uguale a quello che l'app scriverebbe:
  // nessun cambiamento, anche se il task è più recente (gli a capo dell'app non si perdono)
  await H.savePerson({ id: sara.id, input: { otherSkills: "riga uno\nriga due" }, actor: "admin", source: "app" });
  const s6 = await H.getPerson(sara.id);
  await fake.set(`hr:person:${sara.id}`, { ...s6, cuBase: { ...s6.cuBase, otherSkills: valueHash(s6.fields.otherSkills) } });
  cu.tasks.get(taskId).date_updated = String(Date.now() + 60_000);
  await H.importFromClickup({ mode: "reconcile", by: "test" });
  t((await H.getPerson(sara.id)).fields.otherSkills === "riga uno\nriga due", "base vecchia + testo identico: il valore dell'app non cambia");

  // 7) archivio da taskDeleted: niente task ricreato
  const del = await H.handleWebhookEvent({ event: "taskDeleted", task_id: taskId, history_items: [{ user: { username: "hr-clickup" } }] });
  cu.tasks.delete(taskId);
  const s7 = await H.getPerson(sara.id);
  t(del.archived && s7.archived?.source === "clickup" && !s7.clickupTaskId, "taskDeleted: scheda archiviata");
  t(!(await H.listPeople()).some((p) => p.id === sara.id) && (await H.listPeople({ archived: "only" })).some((p) => p.id === sara.id), "archiviata fuori dall'elenco normale, dentro le Archiviate");
  const tasksBefore = cu.tasks.size;
  const push7 = await H.pushPersonSafe(s7, null);
  t(push7.status === "archived" && cu.tasks.size === tasksBefore, "push di un'archiviata: nessun task ricreato");
  t((await H.savePerson({ id: sara.id, input: { surname: "X" }, actor: "admin", source: "app" })).status === 409, "un'archiviata non si modifica dalla scheda");
  await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(cu.tasks.size === tasksBefore, "la riconciliazione non ricrea il task di un'archiviata");
  t((await logOf(sara.id)).some((e) => e.action === "archived" && e.source === "clickup"), "storico: archiviata, da ClickUp");

  // 8) un task che sparisce senza webhook → archiviato dalla riconciliazione (404 vero)
  const luca = (await H.savePerson({ input: { firstName: "Luca", surname: "Verdi" }, actor: "admin" })).person;
  cu.tasks.delete(luca.clickupTaskId);
  const rec8 = await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(rec8.archived >= 1 && (await H.getPerson(luca.id)).archived?.reason === "Il task collegato non esiste più su ClickUp", "riconciliazione: task inesistente → archiviata");

  // 9) niente più cancellazioni (03/10/2026): nessuna funzione per eliminare o ripulire
  t(H.archivePerson === undefined && H.purgePerson === undefined && H.purgeExpiredArchived === undefined, "nessuna funzione di eliminazione o di pulizia");
  // un'archiviata vecchia di 60 giorni NON sparisce: la riconciliazione notturna la lascia dov'è
  const old = await H.getPerson(luca.id);
  await fake.set(`hr:person:${luca.id}`, { ...old, archived: { ...old.archived, at: Date.now() - 60 * 24 * 3600 * 1000 } });
  await H.importFromClickup({ mode: "reconcile", by: "test" });
  const luca9 = await H.getPerson(luca.id);
  t(luca9?.archived && (await H.listPeople({ archived: "only" })).some((p) => p.id === luca.id), "archiviata da 60 giorni: ancora lì, nessuna pulizia");
  t((await logOf(luca.id)).length > 0, "il suo storico resta");
  t(!/si cancella/.test((await logOf(luca.id)).find((e) => e.action === "archived")?.to || ""), "lo storico non promette più una cancellazione");
  // il webhook del task di un'archiviata è ignorato e non crea schede nuove
  const peopleCount = (await H.listPeople({ archived: "include" })).length;
  const w9 = await H.handleWebhookEvent({ event: "taskDeleted", task_id: luca.clickupTaskId || "t-nessuno", history_items: [] });
  t(w9.ignored && (await H.listPeople({ archived: "include" })).length === peopleCount, "taskDeleted su un task già sparito: nessun effetto");

  // 10) esclusioni: le archiviate non contano nei doppioni
  const dupe = (await H.savePerson({ input: { firstName: "Luca", surname: "Verdi" }, actor: "admin" })).person;
  const cl = H.computeCleanup(await H.listPeople({ archived: "include" }));
  t(!cl.byId[dupe.id] && !cl.byId[luca.id], "un'archiviata non fa doppione con una scheda attiva");

  // 11) Ripristina → torna attiva e crea un task NUOVO (anche quella vecchia di 60 giorni)
  const r11 = await H.restorePerson(sara.id, "admin-2");
  const s11 = await H.getPerson(sara.id);
  t(r11.ok && !s11.archived && s11.clickupTaskId && s11.clickupTaskId !== taskId && cu.tasks.has(s11.clickupTaskId), "Ripristina: attiva, task nuovo su ClickUp");
  t(cu.tasks.get(s11.clickupTaskId).values[byFieldName("Luogo di nascita").id] === "Milano (MI)", "il task nuovo ha i dati dell'app");
  t((await logOf(sara.id)).some((e) => e.action === "restored" && e.by === "admin-2"), "storico: ripristinata");
  const r11b = await H.restorePerson(luca.id, "admin-2");
  t(r11b.ok && !(await H.getPerson(luca.id)).archived, "anche l'archiviata da 60 giorni si ripristina");
  t(H.computeCleanup(await H.listPeople()).byId[dupe.id]?.includes("doppione"), "ripristinata: torna a contare nei doppioni");

  // 12) in tutto il giro HOC Pro non ha mai cancellato un task su ClickUp
  t(!cu.calls.some((c) => /^DELETE \/task\/[^/]+$/.test(c)), "nessuna DELETE di task verso ClickUp");
  t(mirrorText("birthPlace", s11.fields) === "Milano (MI)", "sanity");

  delete process.env.HR_CLICKUP_LIST_ID;
  n += m;
  console.log(`archivio + specchio con ClickUp finto: ${m} asserzioni OK`);
}

// ── 03/10: fasi della persona e contratto con ClickUp FINTO ──────────────────
// Lista con gli stati del task in italiano (come quella di prova rinominata a mano)
// + "to do" (stato estraneo), tendine "Collaboration Status" e "HV Contract Status"
// con le opzioni in inglese. Nessuna chiamata di rete vera, nessun KV vero.
{
  const fake = globalThis.__hrFakeKv;
  const H = await import("../src/lib/hr-people.js");
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };

  const LIST = "lista-fasi";
  const opt = (pairs) => ({ options: pairs.map(([id, name], i) => ({ id, name, orderindex: i })) });
  const FIELDS_META = [
    { id: "f-sur", name: "Surname", type: "short_text" },
    { id: "f-cs", name: "Collaboration Status", type: "drop_down", type_config: opt([["o-on", "Onboarding"], ["o-ac", "Active"], ["o-re", "Reassigning"], ["o-ou", "Outboarding"], ["o-de", "Decommissioned"], ["o-nr", "Needs Review"]]) },
    { id: "f-hv", name: "HV Contract Status", type: "drop_down", type_config: opt([["c-td", "To Do"], ["c-ds", "Drafted Shared"], ["c-sr", "Signature Requested"], ["c-si", "Signed"]]) },
    { id: "f-end", name: "End of Collaboration", type: "date" },
  ];
  const STATUSES = ["to do", "In ingresso", "Attiva", "In riassegnazione", "In uscita", "Uscita"].map((status, i) => ({ status, type: status === "Uscita" ? "closed" : "custom", orderindex: i }));
  const cu = { tasks: new Map(), seq: 0, calls: [] };
  const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body) });
  const taskView = (tk) => ({ ...tk, list: { id: LIST }, status: { status: tk.status }, custom_fields: FIELDS_META.map((f) => ({ ...f, value: tk.values[f.id] })) });
  globalThis.fetch = async (url, init = {}) => {
    const p = new URL(url).pathname.replace(/^\/api\/v2/, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    cu.calls.push(`${method} ${p}`);
    let mm;
    if (method === "GET" && p === `/list/${LIST}/field`) return json(200, { fields: FIELDS_META });
    if (method === "GET" && p === `/list/${LIST}`) return json(200, { id: LIST, name: "Prova fasi", statuses: STATUSES });
    if (method === "GET" && p === `/list/${LIST}/task`) return json(200, { tasks: [...cu.tasks.values()].map(taskView), last_page: true });
    if (method === "POST" && p === `/list/${LIST}/task`) {
      const id = `f${++cu.seq}`;
      const values = {};
      for (const c of body.custom_fields || []) values[c.id] = c.value;
      cu.tasks.set(id, { id, name: body.name, description: body.description, values, status: body.status || "to do", date_updated: String(Date.now()) });
      return json(200, { id, url: `https://app.clickup.com/t/${id}` });
    }
    if ((mm = /^\/task\/([^/]+)\/field\/([^/]+)$/.exec(p))) {
      const tk = cu.tasks.get(mm[1]);
      if (method === "POST") tk.values[mm[2]] = body.value; else delete tk.values[mm[2]];
      return json(200, {});
    }
    if ((mm = /^\/task\/([^/]+)$/.exec(p))) {
      const tk = cu.tasks.get(mm[1]);
      if (!tk) return json(404, { err: "Task not found", ECODE: "ITEM_015" });
      if (method === "PUT") { Object.assign(tk, body); return json(200, {}); }
      return json(200, taskView(tk));
    }
    return json(500, { err: `rotta non prevista nel finto: ${method} ${p}` });
  };
  process.env.HR_CLICKUP_LIST_ID = LIST;
  process.env.CLICKUP_API_TOKEN = "pk_test_finto";
  const later = () => String(Date.now() + 1000);
  const setStatusOnClickup = (taskId, status) => { const tk = cu.tasks.get(taskId); tk.status = status; tk.date_updated = later(); };
  const setDropdownOnClickup = (taskId, fieldId, optionId) => { const tk = cu.tasks.get(taskId); tk.values[fieldId] = optionId; tk.date_updated = later(); };
  const statusWebhook = (taskId, after) => H.handleWebhookEvent({ event: "taskStatusUpdated", task_id: taskId, history_items: [{ field: "status", after: { status: after }, date: later(), user: { username: "hr-clickup" } }] });
  const fieldWebhook = (taskId, fieldId, name) => H.handleWebhookEvent({ event: "taskUpdated", task_id: taskId, history_items: [{ field: "custom_field", custom_field: { id: fieldId, name }, date: later(), user: { username: "hr-clickup" } }] });
  const phaseOf = async (id) => (await H.getPerson(id)).fields.collaborationStatus;

  // a) fase scelta in app → tendina (opzione inglese) + stato del task (italiano)
  const ada = (await H.savePerson({ input: { firstName: "Ada", surname: "Lovelace", collaborationStatus: "In ingresso", hvContractStatus: "Da preparare" }, actor: "admin", source: "app" })).person;
  const adaTask = ada.clickupTaskId;
  t(cu.tasks.get(adaTask).status === "In ingresso" && cu.tasks.get(adaTask).values["f-cs"] === "o-on", "creazione: stato del task «In ingresso» e tendina Onboarding");
  t(cu.tasks.get(adaTask).values["f-hv"] === "c-td", "creazione: contratto Da preparare → To Do");
  const r1 = await H.savePerson({ id: ada.id, input: { collaborationStatus: "Attiva" }, actor: "admin", source: "app" });
  t(r1.sync?.status === "ok" && cu.tasks.get(adaTask).status === "Attiva" && cu.tasks.get(adaTask).values["f-cs"] === "o-ac", "fase cambiata in app: tendina Active + stato del task «Attiva»");
  // le eco (stato e tendina) non cambiano niente
  const e1 = await statusWebhook(adaTask, "Attiva");
  const e2 = await fieldWebhook(adaTask, "f-cs", "Collaboration Status");
  t(e1.kind === "unchanged" && e2.kind === "unchanged" && (await phaseOf(ada.id)) === "Attiva", "eco di stato e tendina: nessun cambiamento");
  // una modifica di un altro campo NON riporta indietro lo stato del task
  setStatusOnClickup(adaTask, "In uscita"); // cambio su ClickUp il cui webhook non è ancora arrivato
  await H.savePerson({ id: ada.id, input: { surname: "King" }, actor: "admin", source: "app" });
  t(cu.tasks.get(adaTask).status === "In uscita", "push di altri campi: lo stato appena cambiato su ClickUp non viene riportato indietro");

  // b) stato del task cambiato su ClickUp (webhook taskStatusUpdated) → fase in app + tendina
  setStatusOnClickup(adaTask, "In riassegnazione");
  const b1 = await statusWebhook(adaTask, "In riassegnazione");
  t(b1.kind === "updated" && (await phaseOf(ada.id)) === "In riassegnazione", "stato del task da ClickUp → fase in app");
  t(cu.tasks.get(adaTask).values["f-cs"] === "o-re", "…e la tendina segue (Reassigning)");
  t((await H.getLog(ada.id, 50)).some((e) => e.action === "update" && e.field === "collaborationStatus" && e.source === "clickup" && e.to === "In riassegnazione"), "storico: cambio di fase da ClickUp");
  // la sua eco (scrittura della tendina) non cambia niente
  t((await fieldWebhook(adaTask, "f-cs", "Collaboration Status")).kind === "unchanged", "eco della tendina riscritta: nessun cambiamento");

  // c) stato cambiato su ClickUp senza webhook → lo riprende la riconciliazione notturna
  setStatusOnClickup(adaTask, "In uscita");
  const rc = await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(rc.ok && (await phaseOf(ada.id)) === "In uscita" && cu.tasks.get(adaTask).values["f-cs"] === "o-ou", "riconciliazione: stato del task → fase + tendina (Outboarding)");
  const rc2 = await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(rc2.updated === 0, "riconciliazione successiva: niente da aggiornare");

  // d) tendina cambiata su ClickUp → fase in app + stato del task
  setDropdownOnClickup(adaTask, "f-cs", "o-ac");
  const d1 = await fieldWebhook(adaTask, "f-cs", "Collaboration Status");
  t(d1.kind === "updated" && (await phaseOf(ada.id)) === "Attiva" && cu.tasks.get(adaTask).status === "Attiva", "tendina da ClickUp → fase in app + stato del task «Attiva»");
  t((await statusWebhook(adaTask, "Attiva")).kind === "unchanged", "eco del nostro cambio di stato: ignorata");

  // e) stato estraneo alle 5 fasi ("to do") → la fase NON si tocca, né via webhook né di notte
  setStatusOnClickup(adaTask, "to do");
  const e3 = await statusWebhook(adaTask, "to do");
  t(e3.kind === "unchanged" && (await phaseOf(ada.id)) === "Attiva", "stato «to do»: fase invariata");
  await H.importFromClickup({ mode: "reconcile", by: "test" });
  t((await phaseOf(ada.id)) === "Attiva" && cu.tasks.get(adaTask).status === "to do", "stato «to do» di notte: fase invariata, stato non forzato");
  // dallo stato estraneo si torna a una fase: è un cambio vero
  setStatusOnClickup(adaTask, "In riassegnazione");
  await statusWebhook(adaTask, "In riassegnazione");
  t((await phaseOf(ada.id)) === "In riassegnazione", "da «to do» a una fase: la fase cambia");

  // f) "Needs Review" dalla tendina → "Da verificare", nessun crash, lo stato non si tocca
  setDropdownOnClickup(adaTask, "f-cs", "o-nr");
  const f1 = await fieldWebhook(adaTask, "f-cs", "Collaboration Status");
  t(f1.ok && (await phaseOf(ada.id)) === "Da verificare" && cu.tasks.get(adaTask).status === "In riassegnazione", "Needs Review → «Da verificare» in sola lettura, stato del task invariato");
  t((await H.savePerson({ id: ada.id, input: { collaborationStatus: "Needs Review" }, actor: "admin", source: "app" })).status === 400, "«Da verificare» non si sceglie dall'app");

  // g) "Segna come uscita": fase Uscita + fine collaborazione = oggi se vuota
  const x1 = await H.markPersonExited(ada.id, { actor: "admin" });
  const adaX = await H.getPerson(ada.id);
  t(x1.ok && adaX.fields.collaborationStatus === "Uscita" && adaX.fields.endDate === H.todayRome(), "Segna come uscita: fase Uscita, fine = oggi");
  t(cu.tasks.get(adaTask).status === "Uscita" && cu.tasks.get(adaTask).values["f-cs"] === "o-de" && cu.tasks.get(adaTask).values["f-end"] === Date.parse(`${H.todayRome()}T12:00:00Z`), "su ClickUp: stato Uscita (chiuso), Decommissioned, data di fine");
  t(!adaX.archived && (await H.listPeople()).some((p) => p.id === ada.id), "la scheda resta (non archiviata, non eliminata)");
  // con la data scelta nella conferma
  const bob = (await H.savePerson({ input: { firstName: "Bob", collaborationStatus: "Attiva" }, actor: "admin" })).person;
  await H.markPersonExited(bob.id, { endDate: "2026-09-30", actor: "admin" });
  t((await H.getPerson(bob.id)).fields.endDate === "2026-09-30", "Segna come uscita con la data scelta");
  // data già in scheda e nessuna data passata: resta quella
  const cleo = (await H.savePerson({ input: { firstName: "Cleo", collaborationStatus: "In uscita", endDate: "2026-10-15" }, actor: "admin" })).person;
  await H.markPersonExited(cleo.id, { actor: "admin" });
  t((await H.getPerson(cleo.id)).fields.endDate === "2026-10-15", "fine già indicata: non si sovrascrive con oggi");
  t((await H.markPersonExited(cleo.id, { endDate: "30/09/2026", actor: "admin" })).status === 400, "data non valida rifiutata");
  // il task chiuso ("Uscita") continua a essere letto: la riconciliazione non lo dà per sparito
  const rx = await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(rx.missingOnClickup === 0 && (await phaseOf(ada.id)) === "Uscita", "riconciliazione: le uscite restano allineate");
  // "Riattiva"
  const ra = await H.reactivatePerson(ada.id, { actor: "admin" });
  t(ra.ok && (await phaseOf(ada.id)) === "Attiva" && cu.tasks.get(adaTask).status === "Attiva" && cu.tasks.get(adaTask).values["f-cs"] === "o-ac", "Riattiva: fase Attiva, anche su ClickUp");

  // h) contratto nei due sensi (etichetta italiana in app, opzione inglese su ClickUp)
  await H.savePerson({ id: ada.id, input: { hvContractStatus: "Firma richiesta" }, actor: "admin", source: "app" });
  t(cu.tasks.get(adaTask).values["f-hv"] === "c-sr", "contratto in app → Signature Requested su ClickUp");
  setDropdownOnClickup(adaTask, "f-hv", "c-si");
  const h1 = await fieldWebhook(adaTask, "f-hv", "HV Contract Status");
  t(h1.kind === "updated" && (await H.getPerson(ada.id)).fields.hvContractStatus === "Firmato", "contratto da ClickUp (Signed) → «Firmato» in app");
  t((await phaseOf(ada.id)) === "Attiva", "il contratto non tocca la fase (assi separati)");

  // i) modulo: persona nuova → "In ingresso", anche su ClickUp
  const link = await H.regenerateSharedFormLink({ actor: "admin" });
  const sub = await H.submitForm(link.token, { consent: true, data: { ...req(), firstName: "Dora", surname: "Nuova" } });
  const child = await fake.get(`hr:form:${sub.uploadToken}`);
  const dora = await H.getPerson(child.personId);
  t(sub.ok && dora.fields.collaborationStatus === "In ingresso", "modulo: persona nuova in fase «In ingresso»");
  t(cu.tasks.get(dora.clickupTaskId)?.status === "In ingresso" && cu.tasks.get(dora.clickupTaskId)?.values["f-cs"] === "o-on", "modulo: su ClickUp stato «In ingresso» e Onboarding");

  // j) task creato su ClickUp con solo lo stato → fase dallo stato, tendina allineata
  cu.tasks.set("f-manuale", { id: "f-manuale", name: "Elio", values: {}, status: "Attiva", date_updated: String(Date.now()) });
  const j1 = await H.handleWebhookEvent({ event: "taskCreated", task_id: "f-manuale", history_items: [] });
  t(j1.kind === "created" && (await phaseOf(j1.personId)) === "Attiva" && cu.tasks.get("f-manuale").values["f-cs"] === "o-ac", "task nuovo da ClickUp: fase dallo stato, tendina scritta");

  // k) scheda salvata prima del 03/10 con l'opzione inglese: letta in italiano, nessuna modifica fantasma
  const old = await fake.get(`hr:person:${bob.id}`);
  await fake.set(`hr:person:${bob.id}`, { ...old, fields: { ...old.fields, collaborationStatus: "Decommissioned" } });
  t((await phaseOf(bob.id)) === "Uscita", "scheda vecchia: «Decommissioned» letto come «Uscita»");
  const logLen = (await H.getLog(bob.id, 500)).length;
  await H.importFromClickup({ mode: "reconcile", by: "test" });
  t(!(await H.getLog(bob.id, 500)).slice(0, (await H.getLog(bob.id, 500)).length - logLen).some((e) => e.field === "collaborationStatus"), "scheda vecchia: nessun cambio di fase nello storico");

  delete process.env.HR_CLICKUP_LIST_ID;
  n += m;
  console.log(`fasi + contratto con ClickUp finto: ${m} asserzioni OK`);
}

// ── 03/10: upload DIRETTO sul Blob privato + coda verso ClickUp (KV, Blob e ClickUp finti) ──
// Nessuna chiamata di rete vera, nessun file vero: Blob = Map in memoria, ClickUp = fetch sostituito.
{
  const fake = globalThis.__hrFakeKv;
  let m = 0;
  const t = (c, msg) => { assert.ok(c, msg); m++; };
  const C = await import("../src/lib/hr-uploads-core.js");
  const { LIMITS } = await import("../src/lib/rate-limit.js");

  // logica pura
  const hex = "a".repeat(32);
  t(C.newUploadPathname(hex, "application/pdf") === `hr-upload/${hex}.pdf` && C.newUploadPathname(hex, "image/gif") === null, "pathname dal server: solo tipi ammessi");
  t(C.isUploadPathname(`hr-upload/${hex}.png`) && !C.isUploadPathname(`hr-upload/Mario-Rossi.pdf`) && !C.isUploadPathname(`altro/${hex}.pdf`), "pathname riconosciuto solo se casuale e nella cartella upload");
  const kinds = { document: {}, cv: {} };
  t(C.checkUploadRequest({ kind: "document", contentType: "image/gif", size: 10 }, kinds)?.status === 415, "tipo sbagliato → 415");
  t(C.checkUploadRequest({ kind: "document", contentType: "application/pdf", size: 50 * 1024 * 1024 + 1 }, kinds)?.status === 413, "oltre 50 MB → 413");
  t(C.checkUploadRequest({ kind: "document", contentType: "application/pdf", size: 50 * 1024 * 1024 }, kinds) === null, "50 MB esatti ammessi");
  t(C.checkUploadRequest({ kind: "foto", contentType: "application/pdf", size: 10 }, kinds)?.status === 400, "tipo di documento sconosciuto → 400");
  t(C.nextAttemptDelayMs(1) === 60_000 && C.nextAttemptDelayMs(4) === 8 * 60_000 && C.nextAttemptDelayMs(30) === 360 * 60_000, "attese crescenti 1, 2, 4… minuti, massimo 6 ore");
  const now0 = Date.now();
  t(C.shouldGiveUp({ attempts: 12, firstAt: now0 }, now0) && C.shouldGiveUp({ attempts: 1, firstAt: now0 - 8 * 86400_000 }, now0) && !C.shouldGiveUp({ attempts: 3, firstAt: now0 }, now0), "si abbandona dopo 12 tentativi o 7 giorni");
  const blobsList = [
    { pathname: `hr-upload/${"1".repeat(32)}.pdf`, uploadedAt: new Date(now0 - 25 * 3600_000) },
    { pathname: `hr-upload/${"2".repeat(32)}.pdf`, uploadedAt: new Date(now0 - 25 * 3600_000) },
    { pathname: `hr-upload/${"3".repeat(32)}.pdf`, uploadedAt: new Date(now0 - 3600_000) },
    { pathname: `altro/${"4".repeat(32)}.pdf`, uploadedAt: new Date(now0 - 99 * 3600_000) },
  ];
  t(JSON.stringify(C.orphanBlobs(blobsList, [blobsList[1].pathname], now0)) === JSON.stringify([blobsList[0].pathname]), "orfani: solo i vecchi >24h, non in coda, nella cartella upload");

  // nuovi tetti
  const lim = (name, w) => LIMITS[name].find((r) => r.window === w)?.max;
  t(lim("hr_form_shared_submit", 86400) === 2000 && lim("hr_form_shared_submit", 60) >= 100, "invii dal link condiviso: 2000 al giorno, freno al minuto ≥100");
  t(lim("hr_form_ip", 60) >= 300 && lim("hr_form_ip", 86400) >= 5000, "per IP: regge un ufficio intero dallo stesso IP");
  t(lim("hr_upload", 3600) >= 30 && lim("hr_form_shared", 60) >= 600, "upload per persona e richieste sul link condiviso larghi abbastanza");

  // Blob finto
  const blobs = new Map();
  globalThis.__hrFakeBlob = {
    async get(p) {
      const b = blobs.get(p);
      if (!b) return null;
      return { statusCode: 200, blob: { size: b.bytes.length }, stream: new Blob([b.bytes]).stream() };
    },
    async del(list) { for (const p of [].concat(list)) blobs.delete(p); },
    async list() { return { blobs: [...blobs.entries()].map(([pathname, b]) => ({ pathname, uploadedAt: b.uploadedAt })), hasMore: false }; },
  };
  const putBlob = (p, bytes, ageMs = 0) => blobs.set(p, { bytes: Buffer.from(bytes), uploadedAt: new Date(Date.now() - ageMs) });

  // ClickUp finto (con interruttore "giù" per gli allegati)
  const LIST = "lista-upload";
  const cu = { tasks: new Map(), seq: 0, down: false, attachments: [] };
  const json = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body) });
  globalThis.fetch = async (url, init = {}) => {
    const p = new URL(url).pathname.replace(/^\/api\/v2/, "");
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    let mm;
    if (method === "GET" && p === `/list/${LIST}/field`) return json(200, { fields: [] });
    if (method === "GET" && p === `/list/${LIST}`) return json(200, { id: LIST, name: "Prova upload", statuses: [] });
    if (method === "POST" && p === `/list/${LIST}/task`) {
      const id = `u${++cu.seq}`;
      cu.tasks.set(id, { id, name: body.name, description: body.description, date_updated: String(Date.now()) });
      return json(200, { id, url: `https://app.clickup.com/t/${id}` });
    }
    if ((mm = /^\/task\/([^/]+)\/attachment$/.exec(p))) {
      if (cu.down) return json(503, { err: "giù" });
      const file = init.body.get("attachment");
      cu.attachments.push({ taskId: mm[1], name: file.name, size: file.size });
      return json(200, { id: `att${cu.attachments.length}` });
    }
    if ((mm = /^\/task\/([^/]+)$/.exec(p))) {
      const tk = cu.tasks.get(mm[1]);
      if (!tk) return json(404, { err: "Task not found", ECODE: "ITEM_015" });
      if (method === "PUT") { Object.assign(tk, body); return json(200, {}); }
      return json(200, { ...tk, list: { id: LIST }, status: { status: "to do" }, custom_fields: [] });
    }
    return json(500, { err: `rotta non prevista: ${method} ${p}` });
  };
  process.env.HR_CLICKUP_LIST_ID = LIST;
  process.env.CLICKUP_API_TOKEN = "pk_test_finto";

  const H = await import("../src/lib/hr-people.js");
  const U = await import("../src/lib/hr-uploads.js");
  const PDF = "%PDF-1.4 documento finto";
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const qItem = async (p) => { const v = await fake.hget("hr:upload:pending", p); return typeof v === "string" ? JSON.parse(v) : v; };
  const makeDue = async (p) => { const it = await qItem(p); await fake.hset("hr:upload:pending", { [p]: JSON.stringify({ ...it, nextAt: 0 }) }); };

  const link = await H.regenerateSharedFormLink({ actor: "admin" });
  const s1 = await H.submitForm(link.token, { consent: true, data: { ...req(), firstName: "Ilaria", surname: "Verdi" } });
  t(s1.ok && s1.uploadsEnabled === true, "con ClickUp e Blob configurati il caricamento è attivo");
  const child1 = await fake.get(`hr:form:${s1.uploadToken}`);
  t(Boolean((await H.getPerson(child1.personId)).clickupTaskId), "invio senza differimento: task creato");

  // generazione del token di upload
  const shared = await U.requestUploadSlot(link.token, { kind: "document", contentType: "application/pdf", size: 1000 });
  t(!shared.ok && shared.status === 403, "slot rifiutato sul link condiviso");
  t((await U.requestUploadSlot(s1.uploadToken, { kind: "document", contentType: "image/gif", size: 1000 })).status === 415, "slot rifiutato: tipo sbagliato");
  t((await U.requestUploadSlot(s1.uploadToken, { kind: "document", contentType: "application/pdf", size: 55 * 1024 * 1024 })).status === 413, "slot rifiutato: file troppo grande");
  const slot = await U.requestUploadSlot(s1.uploadToken, { kind: "document", contentType: "application/pdf", size: PDF.length });
  t(slot.ok && C.isUploadPathname(slot.pathname) && !/ilaria|verdi/i.test(slot.pathname), "slot concesso: pathname casuale, senza dati personali");
  const auth = await U.authorizeBlobUpload(s1.uploadToken, slot.pathname);
  t(auth.options && auth.options.maximumSizeInBytes === 50 * 1024 * 1024 && auth.options.allowedContentTypes.join() === "application/pdf" && auth.options.addRandomSuffix === false && auth.options.allowOverwrite === false, "token di upload: tipo, 50 MB, niente sovrascritture");
  t((await U.authorizeBlobUpload(link.token, slot.pathname)).error?.status === 403, "token di upload rifiutato al link condiviso");
  const s2 = await H.submitForm(link.token, { consent: true, data: { ...req(), firstName: "Altra" } });
  t((await U.authorizeBlobUpload(s2.uploadToken, slot.pathname)).error?.status === 403, "token di upload rifiutato per lo slot di un'altra persona");
  t((await U.authorizeBlobUpload(s1.uploadToken, `hr-upload/${"b".repeat(32)}.pdf`)).error?.status === 403, "token di upload rifiutato per un pathname senza slot");
  // finestra dei file scaduta
  const s3 = await H.submitForm(link.token, { consent: true, data: { ...req(), firstName: "Tarda" } });
  const slot3 = await U.requestUploadSlot(s3.uploadToken, { kind: "cv", contentType: "application/pdf", size: 100 });
  const rec3 = await fake.get(`hr:form:${s3.uploadToken}`);
  await fake.set(`hr:form:${s3.uploadToken}`, { ...rec3, submittedAt: Date.now() - 2 * 3600_000 });
  t((await U.requestUploadSlot(s3.uploadToken, { kind: "cv", contentType: "application/pdf", size: 100 })).status === 410, "slot rifiutato: finestra scaduta");
  t((await U.authorizeBlobUpload(s3.uploadToken, slot3.pathname)).error?.status === 410, "token di upload rifiutato: finestra scaduta");

  // copia riuscita: allegato su ClickUp, blob cancellato, riferimento in scheda
  putBlob(slot.pathname, PDF);
  const r1 = await U.receiveUpload(s1.uploadToken, { kind: "document", pathname: slot.pathname });
  const ilaria = await H.getPerson(child1.personId);
  t(r1.ok && r1.received && !r1.queued, "copia riuscita");
  t(!blobs.has(slot.pathname), "blob cancellato subito dopo la copia");
  t(cu.attachments.length === 1 && cu.attachments[0].taskId === ilaria.clickupTaskId && /Ilaria Verdi\.pdf$/.test(cu.attachments[0].name), "allegato sul task giusto, col nome della persona solo su ClickUp");
  t(ilaria.fields.idDocument?.attachmentId === "att1" && !("bytes" in ilaria.fields.idDocument), "in scheda solo il riferimento");
  t((await U.receiveUpload(s1.uploadToken, { kind: "document", pathname: slot.pathname })).ok && cu.attachments.length === 1, "seconda chiamata uguale: nessun allegato doppio");
  t((await U.receiveUpload(s2.uploadToken, { kind: "document", pathname: slot.pathname })).status === 404, "un altro token non può prendere il file di questo");

  // byte che non sono PDF/JPG/PNG → rifiutato e blob cancellato
  const slotBad = await U.requestUploadSlot(s1.uploadToken, { kind: "cv", contentType: "image/png", size: 5 });
  putBlob(slotBad.pathname, "ciao!");
  t((await U.receiveUpload(s1.uploadToken, { kind: "cv", pathname: slotBad.pathname })).status === 415 && !blobs.has(slotBad.pathname), "byte veri non ammessi: 415 e blob cancellato");

  // ClickUp giù: in coda, blob tenuto, "ricevuto"; poi svuotato al giro dopo
  const slotCv = await U.requestUploadSlot(s1.uploadToken, { kind: "cv", contentType: "image/png", size: PNG.length });
  putBlob(slotCv.pathname, PNG);
  cu.down = true;
  const r2 = await U.receiveUpload(s1.uploadToken, { kind: "cv", pathname: slotCv.pathname });
  t(r2.ok && r2.received && r2.queued, "ClickUp giù: alla persona «ricevuto»");
  t(blobs.has(slotCv.pathname) && (await qItem(slotCv.pathname))?.attempts === 1, "ClickUp giù: blob tenuto, elemento in coda");
  t((await U.pendingUploadsFor(child1.personId)).some((x) => x.key === "cvUpload"), "scheda: file «in arrivo»");
  t((await U.uploadQueueStatus()).pending === 1, "stato sync: 1 documento in arrivo");
  t((await U.drainUploadQueue({ budgetMs: 5000 })).done === 0, "prima dell'attesa non si riprova");
  cu.down = false;
  await makeDue(slotCv.pathname);
  const d1 = await U.drainUploadQueue({ budgetMs: 5000 });
  t(d1.done === 1 && !blobs.has(slotCv.pathname) && !(await qItem(slotCv.pathname)), "giro dopo: arrivato, blob cancellato, coda vuota");
  t((await H.getPerson(child1.personId)).fields.cvUpload?.attachmentId, "riferimento al CV in scheda");

  // task non ancora creato (invio differito): il file aspetta, la ripresa crea il task e poi lo allega
  const s4 = await H.submitForm(link.token, { consent: true, data: { ...req(), firstName: "Bruno", surname: "Neri" } }, { deferSync: true });
  const child4 = await fake.get(`hr:form:${s4.uploadToken}`);
  t(!(await H.getPerson(child4.personId)).clickupTaskId && (await H.listSyncRetry()).includes(child4.personId), "invio differito: scheda salvata, task da creare, in «da riprovare»");
  const slot4 = await U.requestUploadSlot(s4.uploadToken, { kind: "document", contentType: "application/pdf", size: PDF.length });
  putBlob(slot4.pathname, PDF);
  const r4 = await U.receiveUpload(s4.uploadToken, { kind: "document", pathname: slot4.pathname });
  t(r4.queued && blobs.has(slot4.pathname), "task non ancora creato: file in coda, blob tenuto");
  const bg = await U.drainHrBackground({ budgetMs: 8000 });
  const bruno = await H.getPerson(child4.personId);
  t(bg.people?.pushed >= 1 && bruno.clickupTaskId && !(await H.listSyncRetry()).includes(bruno.id), "ripresa: task creato, scheda fuori da «da riprovare»");
  await makeDue(slot4.pathname);
  await U.drainHrBackground({ budgetMs: 8000 });
  t(!blobs.has(slot4.pathname) && (await H.getPerson(bruno.id)).fields.idDocument?.attachmentId, "ripresa successiva: documento allegato, blob cancellato");

  // differito con deferSync: la route copia dopo la risposta
  const slot5 = await U.requestUploadSlot(s4.uploadToken, { kind: "cv", contentType: "application/pdf", size: PDF.length });
  putBlob(slot5.pathname, PDF);
  const r5 = await U.receiveUpload(s4.uploadToken, { kind: "cv", pathname: slot5.pathname }, { defer: true });
  t(r5.deferred && (await qItem(slot5.pathname)), "copia dopo la risposta: prima in coda (nessun file perso se il giro non parte)");
  t((await U.transferDeferred(r5.deferred)) === "done" && !blobs.has(slot5.pathname) && !(await qItem(slot5.pathname)), "copia dopo la risposta: arrivato e tolto dalla coda");

  // abbandono dopo troppi tentativi: storico + avviso, blob cancellato
  const slot6 = await U.requestUploadSlot(s2.uploadToken, { kind: "document", contentType: "application/pdf", size: PDF.length });
  putBlob(slot6.pathname, PDF);
  const child2 = await fake.get(`hr:form:${s2.uploadToken}`);
  await fake.hset("hr:upload:pending", { [slot6.pathname]: JSON.stringify({ pathname: slot6.pathname, personId: child2.personId, kind: "document", ext: "pdf", contentType: "application/pdf", attempts: 12, firstAt: Date.now() - 86400_000, nextAt: 0, lastError: "ClickUp 503" }) });
  const d2 = await U.drainUploadQueue({ budgetMs: 5000 });
  const st = await U.uploadQueueStatus();
  t(d2.failed === 1 && !blobs.has(slot6.pathname) && st.failed.length === 1 && st.failed[0].personId === child2.personId, "abbandonato: avviso in /admin/hr/sync, blob cancellato");
  t((await H.getLog(child2.personId, 50)).some((e) => e.action === "upload_failed"), "abbandonato: segnalato nello storico della scheda");

  // pulizia notturna degli orfani
  const orphan = `hr-upload/${"c".repeat(32)}.pdf`;
  const queuedOld = `hr-upload/${"d".repeat(32)}.pdf`;
  const fresh = `hr-upload/${"e".repeat(32)}.pdf`;
  putBlob(orphan, PDF, 25 * 3600_000);
  putBlob(queuedOld, PDF, 25 * 3600_000);
  putBlob(fresh, PDF, 3600_000);
  await fake.hset("hr:upload:pending", { [queuedOld]: JSON.stringify({ pathname: queuedOld, personId: child2.personId, kind: "cv", attempts: 1, firstAt: Date.now(), nextAt: Date.now() + 3600_000 }) });
  const cl = await U.cleanupOrphanUploads();
  t(cl.deleted === 1 && !blobs.has(orphan) && blobs.has(queuedOld) && blobs.has(fresh), "pulizia: cancellato solo l'orfano >24h; in coda e recente restano");

  // lucchetto per persona: due push insieme non creano due task
  const lone = await H.savePerson({ input: { firstName: "Solo" }, actor: "test", sync: false });
  await fake.set(`hr:push:lock:${lone.person.id}`, 1);
  const tasksBefore = cu.tasks.size;
  const busy = await H.pushPersonSafe(lone.person, null);
  t(busy.status === "busy" && cu.tasks.size === tasksBefore && !(await H.getPerson(lone.person.id)).clickupTaskId && (await H.listSyncRetry()).includes(lone.person.id), "push già in corso: nessun task nuovo, scheda in «da riprovare»");
  await fake.del(`hr:push:lock:${lone.person.id}`);

  delete globalThis.__hrFakeBlob;
  delete process.env.HR_CLICKUP_LIST_ID;
  n += m;
  console.log(`upload diretto + coda: ${m} asserzioni OK`);
}

console.log(`totale: ${n} asserzioni`);

// ── scritture concorrenti: un campo scritto da altri non si perde (03/10, test di carico) ──
{
  const { keepNewerFields } = await import("../src/lib/hr-people.js");
  let m = 0; const t = (c, msg) => { assert.ok(c, msg); m++; };
  const snap = { fields: { firstName: "Luca" }, fieldUpdatedAt: { firstName: 100 }, updatedAt: 100 };
  const cur = { fields: { firstName: "Luca", idDocument: { title: "doc.jpg" } }, fieldUpdatedAt: { firstName: 100, idDocument: 200 }, updatedAt: 200 };
  const next = { fields: { firstName: "Luca", surname: "Rossi" }, fieldUpdatedAt: { firstName: 100, surname: 150 }, updatedAt: 150 };
  const out = keepNewerFields(next, snap, cur);
  t(out.fields.idDocument?.title === "doc.jpg", "il documento scritto nel frattempo resta");
  t(out.fields.surname === "Rossi", "il nostro campo resta");
  t(out.updatedAt === 200, "updatedAt più recente");
  const ours = keepNewerFields({ fields: { idDocument: { title: "nuovo.jpg" } }, fieldUpdatedAt: { idDocument: 300 } }, snap, cur);
  t(ours.fields.idDocument.title === "nuovo.jpg", "se il campo l'abbiamo cambiato noi, vince il nostro");
  n += m; console.log(`scritture concorrenti: ${m} asserzioni OK`);
}
