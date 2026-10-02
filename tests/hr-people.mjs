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
  eq(normalizePersonInput({ referent: [{ id: 1 }] }).values, {}, "campo sola lettura ignorato");
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
  eq(m.fields.collaborationStatus, "Active", "dropdown nel task (option id)");
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
  ok2(Object.keys(sm).length === 1 && sm["OF Messaging"] === "Esperto", "skill map pulita");
  console.log("hr-comuni/competenze: OK");
}
