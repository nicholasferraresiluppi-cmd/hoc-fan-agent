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
  te(S.clickupSkillLabels({ tech_automation: "Base", ads_meta: "Esperto", of_chat: "Base", soc_seo: "Base" }), ["Automations", "OF Messaging", "SEO / SEM"], "solo voci con etichetta (Google/Meta Ads no)");
  t(!S.clickupSkillLabels({ ads_google: "Esperto" }).length, "Google Ads non diventa SEO / SEM");

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
  te(r.values.skills, ["OF Messaging", "Automations"], "Skills ClickUp = solo le voci con etichetta");
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
