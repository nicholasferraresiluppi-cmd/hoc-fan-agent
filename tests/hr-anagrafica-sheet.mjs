// node tests/hr-anagrafica-sheet.mjs — foglio «Anagrafica Operatori» ← CRM (logica pura)
import assert from "node:assert/strict";
import { planSheetAppend, personToRow, sheetText, isoDate, itDate, itTimestamp, findInSheet, rowKeys, headerMismatch, SHEET_COLUMNS } from "../src/lib/hr-anagrafica-sheet-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const row = (o) => SHEET_COLUMNS.map((c) => o[c] ?? "");
const person = (id, f, extra = {}) => ({ id, createdAt: Date.UTC(2026, 10, 10, 9, 5, 0), fields: f, clickupUrl: `https://app.clickup.com/t/${id}`, ...extra });

// date
eq(isoDate("2003-12-04"), "2003-12-04", "iso");
eq(isoDate("4/12/2003"), "2003-12-04", "it corta");
eq(itDate("2003-12-04"), "04/12/2003", "it");
eq(itDate(""), "", "vuota");
eq(itTimestamp(Date.UTC(2026, 10, 10, 9, 5, 0)), "10/11/2026 10:05:00", "ora di Roma (inverno +1)");

// valori sicuri
eq(sheetText("=IMPORTXML(\"x\")"), "'=IMPORTXML(\"x\")", "formula neutralizzata");
eq(sheetText("+39 333"), "'+39 333", "telefono non diventa numero");
eq(sheetText("420687545"), "'420687545", "numero documento con gli zeri al sicuro");
eq(sheetText("RSSMRA80A01H501U"), "RSSMRA80A01H501U", "CF italiano invariato");
eq(sheetText("Via Roma 1"), "Via Roma 1", "testo normale invariato");

// riga
const fadda = person("p_1", {
  firstName: "Federico", surname: "Fadda", dateOfBirth: "2003-12-04", personalEmail: "f@x.it",
  birthPlace: { abroad: false, name: "Nuoro", prov: "NU" }, residenceComune: { name: "Siniscola", prov: "NU" },
  location: { address: "Via Abruzzo 36" },
});
const r = personToRow(fadda, { cf: "FDDFRC03T04F979P", idDoc: { number: "CA73225PH", issuer: "comune di Siniscola", expiry: "2034-01-01" } });
eq(r.length, 17, "17 colonne A…Q");
eq(r.slice(1, 11), ["Federico", "Fadda", "Nuoro", "NU", "Italia", "04/12/2003", "Siniscola", "NU", "Italia", "Via Abruzzo 36"], "anagrafica e luoghi");
eq(r.slice(11, 16), ["FDDFRC03T04F979P", "CA73225PH", "comune di Siniscola", "01/01/2034", "f@x.it"], "CF, documento, email");
ok(r[16].includes("clickup.com"), "link alla scheda ClickUp con il documento");
const estero = personToRow(person("p_2", { firstName: "Danie Ann", surname: "Castro", birthPlace: { abroad: true, country: "Filippine" }, residenceComune: { abroad: true, city: "Cebu City", country: "Filippine" } }));
eq([estero[3], estero[4], estero[5], estero[7], estero[8], estero[9]], ["", "", "Filippine", "Cebu City", "", "Filippine"], "estero: paese, niente provincia");
eq([estero[11], estero[12]], ["", ""], "senza CF né documento: vuoti");

// già nel foglio
const sheet = [
  row({ Nome: "Jose Christian", Cognome: "Pasquin", "Data di nascita": "18/09/1994" }),
  row({ Nome: "Karol", Cognome: "Gualniera" }),
  row({ Nome: "Mario", Cognome: "Rossi", "Codice fiscale": "rssmra80a01h501u" }),
  row({ Nome: "Anna", Cognome: "Bianchi", Email: "Anna@X.it" }),
  row({ Nome: "Secondino", Cognome: "Laquintana" }),
];
const keys = sheet.map(rowKeys);
eq(findInSheet(person("a", { firstName: "Jc", surname: "Pasquin", dateOfBirth: "1994-09-18" }), null, keys), "cognome e data di nascita", "nome abbreviato: lo trova la data");
eq(findInSheet(person("b", { firstName: "Karol Emmanuel", surname: "Gualniera" }), null, keys), "nome e cognome", "secondo nome in più");
eq(findInSheet(person("c", { firstName: "M.", surname: "R." }), "RSSMRA80A01H501U", keys), "codice fiscale", "CF senza badare alle maiuscole");
eq(findInSheet(person("d", { firstName: "Annina", surname: "Bianco", personalEmail: "anna@x.it" }), null, keys), "email", "email");
eq(findInSheet(person("e", { firstName: "Mariadele", surname: "Laquintana" }), null, keys), null, "stesso cognome, persona diversa: va aggiunta");
eq(findInSheet(person("f", { firstName: "Marvin", surname: "Aninon" }), null, [rowKeys(row({ Nome: "Marvin", Cognome: "Aniñon" }))]), "nome e cognome", "accenti e ñ");

// piano
const people = [
  person("p_new", { firstName: "Gaia", surname: "Esposito" }),
  person("p_arch", { firstName: "Asia", surname: "Doppione" }, { archived: true }),
  person("p_prova", { firstName: "Prova", surname: "Claude" }),
  person("p_noname", { firstName: "Solo nome", surname: "" }),
  person("p_written", { firstName: "Cancellata", surname: "Apposta" }),
  person("p_karol", { firstName: "Karol Emmanuel", surname: "Gualniera" }),
  person("p_dup1", { firstName: "Danie Ann", surname: "Castro", dateOfBirth: "1999-10-04" }),
  person("p_dup2", { firstName: "Danie", surname: "Castro", dateOfBirth: "1999-10-04" }),
];
const plan = planSheetAppend({ people, sheetRows: sheet, alreadyWritten: new Set(["p_written"]) });
eq(plan.add.map((p) => p.id), ["p_new", "p_dup1"], "aggiunge i nuovi, una volta sola per persona doppia");
eq(plan.skipped.map((x) => x.why).sort(), ["archiviata", "scheda di prova", "senza nome o cognome"], "esclusi");
ok(plan.present.some((x) => x.id === "p_written" && x.by.includes("già aggiunta")), "una riga cancellata a mano non torna");
ok(plan.present.some((x) => x.id === "p_dup2"), "il doppione nello stesso giro trova il primo");
const only = planSheetAppend({ people, sheetRows: sheet, onlyIds: ["p_new"] });
eq([only.add.length, only.present.length, only.skipped.length], [1, 0, 0], "onlyIds: solo quella scheda");

// 24/11: chi è in «Uscita» non entra
const gone = planSheetAppend({ people: [person("p_gone", { firstName: "Mattia", surname: "Tripodi", collaborationStatus: "Uscita" })], sheetRows: [] });
eq([gone.add.length, gone.skipped[0]?.why], [0, "uscita"], "fase Uscita esclusa");

// 24/11: intestazione del foglio vero (con gli esempi tra parentesi) = ok; colonne cambiate = stop
const realHeader = ["Timestamp", "Nome", "Cognome", "Città di nascita (Es. Roma)", "Provincia di nascita (Es.  RM )", "Nazione di nascita (Es. Italia)", "Data di nascita", "Città di residenza (Es. Milano)", "Provincia di residenza (Es. MI)", "Nazione di residenza (Es. Italia)", "Via e numero civico residenza", "Codice fiscale", "Numero documento (Carta d'identità / Passaporto)", "Rilasciato da Comune di", "Valida sino al (inserire data validità)", "Email", "foto documento identita"];
eq(headerMismatch(realHeader), null, "intestazione vera accettata");
ok(headerMismatch([...realHeader.slice(0, 3), "Telefono", ...realHeader.slice(3)])?.includes("colonna D"), "colonna inserita in mezzo = stop");
ok(headerMismatch([...realHeader, "Note"])?.includes("colonne in più"), "colonna aggiunta in fondo = stop");
ok(headerMismatch([]) !== null, "foglio vuoto = stop");

console.log(`ok — ${n} asserzioni`);
