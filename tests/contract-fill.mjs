// Unit test — compilazione contratti (contract-fill-core + modelli). Esegui: node tests/contract-fill.mjs
import assert from "node:assert/strict";
import { itWords, enWords, amountText, suggestTemplate, suggestLang, contractValues, fillTemplate, crossCheck, TEMPLATE_BY_ID } from "../src/lib/contract-fill-core.js";
import { CONTRACT_TEMPLATES } from "../src/lib/contract-templates.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("numeri in lettere come nei contratti firmati", () => {
  assert.equal(itWords(2000), "duemila");
  assert.equal(itWords(3000), "tremila");
  assert.equal(itWords(1500), "millecinquecento");
  assert.equal(itWords(1823), "milleottocentoventitré");
  assert.equal(itWords(1281), "milleduecentottantuno");
  assert.equal(enWords(1200), "one thousand two hundred");
  assert.equal(enWords(1700), "one thousand seven hundred");
  assert.deepEqual(amountText("2000", "it"), { importo: "2000,00", importo_lettere: "duemila/00" });
  assert.deepEqual(amountText("1200", "en"), { importo: "1.200,00", importo_lettere: "one thousand two hundred" });
  assert.equal(amountText("", "it"), null);
});

t("modelli: nessun dato di persone reali, solo segnaposto noti", () => {
  const known = new Set(["parte", "nome", "NOME", "email", "data", "mansione", "articolo_mansione", "descrizione", "valuta", "importo", "importo_lettere", "minimo_garantito", "dispositivi", "compenso_en"]);
  for (const tpl of CONTRACT_TEMPLATES) {
    const all = tpl.blocks.map((b) => b.x).join("\n");
    for (const m of all.matchAll(/\{\{([A-Za-z_]+)\}\}/g)) assert.ok(known.has(m[1]), `${tpl.id}: segnaposto sconosciuto ${m[1]}`);
    assert.doesNotMatch(all, /[\w.+-]+@(?!houseofcreators\.com)[\w-]+\.\w+/, `${tpl.id}: email rimasta`);
    assert.doesNotMatch(all, /\b\d{2}\/\d{2}\/\d{4}\b/, `${tpl.id}: data rimasta`);
    assert.ok(tpl.blocks.some((b) => b.t === "sign"), `${tpl.id}: manca il blocco firme`);
  }
});

t("scelta del modello", () => {
  assert.equal(suggestTemplate({ mansioni: ["Chatter"], residenceComune: { name: "Modena" } }).templateId, "operatore_it");
  assert.equal(suggestTemplate({ mansioni: ["Chatter"], residenceComune: { abroad: true, country: "Philippines" } }).templateId, "operatore_en");
  assert.equal(suggestTemplate({ mansioni: ["Sales Manager"], residenceComune: { abroad: true, country: "Mexico" } }).templateId, "staff_en");
  assert.equal(suggestTemplate({ mansioni: ["Publisher"] }).templateId, "smm_it");
  const smmEn = suggestTemplate({ mansioni: ["Social Media Manager"], residenceComune: { abroad: true, country: "Spain" } });
  assert.equal(smmEn.templateId, "smm_it"); assert.ok(smmEn.note);
  assert.equal(suggestTemplate({ mansioni: ["Board", "PO"] }).mansione, "PO");
  assert.equal(suggestLang({ nationality: "Italiana" }), "it");
});

const fields = { firstName: "Maria", surname: "Prova", gender: "Female", dateOfBirth: "1995-03-12", birthPlace: { name: "Bologna", prov: "BO" }, residenceComune: { name: "Modena", prov: "MO" }, location: { address: "Via Esempio 1" }, personalEmail: "maria@example.com" };
const idDoc = { type: "carta di identità", number: "CA00000AA", issuer: "comune di Modena", expiry: "2032-03-12" };

t("operatore: dati completi, nata/identificata/denominata al femminile", () => {
  const { values, missing } = contractValues({ fields, cf: "PRVMRA95C52A944X", idDoc, lang: "it", templateId: "operatore_it", terms: { data: "10/10/2026" } });
  assert.deepEqual(missing, []);
  const f = fillTemplate(TEMPLATE_BY_ID.operatore_it, values);
  assert.deepEqual(f.missing, []);
  const party = f.blocks.find((b) => b.x.startsWith("e Maria Prova"));
  assert.ok(party, "paragrafo della parte");
  assert.match(party.x, /nata a Bologna \(BO\) - Italia il 12\/03\/1995, residente a Modena \(MO\) - Italia in Via Esempio 1, C\.F\. PRVMRA95C52A944X, identificata mediante carta di identità nr\. CA00000AA, rilasciata da comune di Modena, valida sino al 12\/03\/2032 di seguito denominata/);
  assert.ok(f.blocks.some((b) => b.x === "LCS Roveredo, 10/10/2026"));
  assert.ok(f.blocks.some((b) => b.t === "sign" && b.x.includes("(MARIA PROVA)")));
});

t("al maschile", () => {
  const { values } = contractValues({ fields: { ...fields, firstName: "Mario", gender: "Male" }, idDoc, lang: "it", templateId: "operatore_it" });
  const txt = fillTemplate(TEMPLATE_BY_ID.operatore_it, values).blocks.map((b) => b.x).join(" ");
  assert.match(txt, /nato a .* identificato mediante .* denominato “Prestatore”/);
});

t("dati mancanti: dichiarati, mai inventati", () => {
  const { missing } = contractValues({ fields: { firstName: "Maria", surname: "Prova" }, idDoc: {}, lang: "it", templateId: "operatore_it" });
  const keys = missing.map((m) => m.key);
  for (const k of ["gender", "birthPlace", "dateOfBirth", "address", "residence", "idType", "idNumber", "idIssuer", "idExpiry", "email"]) assert.ok(keys.includes(k), k);
});

t("staff: mansione, descrizione, compenso, incentivi facoltativi", () => {
  const terms = { mansione: "Account Manager", descrizione: "il coordinamento del progetto", importo: "3000", incentivi: false, minimoGarantito: true };
  const { values, missing } = contractValues({ fields, idDoc, lang: "it", templateId: "staff_it", terms });
  assert.deepEqual(missing, []);
  const f = fillTemplate(TEMPLATE_BY_ID.staff_it, values);
  const txt = f.blocks.map((b) => b.x).join("\n");
  assert.match(txt, /la Sig\.ra Maria Prova è una libera professionista/);
  assert.match(txt, /consisterà in quella di Account Manager\./);
  assert.match(txt, /Ed in particolare l’Account Manager svolgerà attività aventi ad oggetto il coordinamento del progetto\./);
  assert.match(txt, /compenso mensile minimo garantito quantificato in EUR 3000,00 \(tremila\/00\)/);
  assert.doesNotMatch(txt, /4\.3\. Oltre al compenso/);
  const noMin = fillTemplate(TEMPLATE_BY_ID.staff_it, contractValues({ fields, idDoc, lang: "it", templateId: "staff_it", terms: { ...terms, minimoGarantito: false } }).values);
  assert.match(noMin.blocks.map((b) => b.x).join(" "), /compenso mensile quantificato in EUR/);
  assert.ok(contractValues({ fields, idDoc, lang: "it", templateId: "staff_it", terms: { mansione: "PO" } }).missing.some((m) => m.key === "importo"));
});

t("staff inglese: fee in USD in lettere", () => {
  const { values } = contractValues({ fields: { ...fields, residenceComune: { abroad: true, city: "London", country: "United Kingdom" } }, idDoc: { type: "passport", number: "X1", issuer: "HM Passport Office" }, lang: "en", templateId: "staff_en", terms: { mansione: "Sales Manager", importo: "1700" } });
  const txt = fillTemplate(TEMPLATE_BY_ID.staff_en, values).blocks.map((b) => b.x).join(" ");
  assert.match(txt, /monthly service fee of USD 1\.700,00 \(one thousand seven hundred\)/);
  assert.match(txt, /It is Maria Prova, born in Bologna \(BO\) - Italy on 12\/03\/1995, resident in Via Esempio 1, London, United Kingdom, identified by passport no\. X1, issued by HM Passport Office/);
});

t("controllo documento ↔ scheda", () => {
  const ok = crossCheck({ fields, cf: "PRVMRA95C52A944X", doc: { firstName: "MARIA", surname: "PROVA", dateOfBirth: "1995-03-12", taxCode: "PRVMRA95C52A944X", expiry: "2032-03-12" } });
  assert.ok(ok.every((c) => c.ok === true), JSON.stringify(ok));
  const bad = crossCheck({ fields, cf: "PRVMRA95C52A944X", doc: { firstName: "Maria Luisa", surname: "Rossi", dateOfBirth: "1995-03-13", expiry: "2020-01-01" } });
  const by = Object.fromEntries(bad.map((c) => [c.key, c.ok]));
  assert.equal(by.firstName, true, "secondo nome sul documento: coincide");
  assert.equal(by.surname, false); assert.equal(by.dateOfBirth, false); assert.equal(by.expiry, false);
  assert.equal(by.cf, null, "CF non stampato sul documento: non verificabile, non sbagliato");
});

console.log(`contract-fill: ${n} test ok`);
