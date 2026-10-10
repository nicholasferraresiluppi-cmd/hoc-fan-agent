/**
 * Compilazione dei contratti — logica PURA (10/10/2026).
 *
 * Dalla scheda della persona (+ i dati letti dal documento d'identità + le scelte di chi
 * prepara: compenso, incentivi…) al contratto compilato, pronto per il PDF.
 *
 *   suggestTemplate(fields)       quale modello e in che lingua (dalla mansione e dalla residenza)
 *   contractValues(input)         i valori dei segnaposto + cosa manca, in parole
 *   fillTemplate(tpl, values)     blocchi con i segnaposto sostituiti; `missing` = segnaposto senza valore
 *
 * Disciplina: niente viene inventato. Un dato che manca resta segnato come mancante e il
 * contratto non si può inviare finché non c'è (meglio un campo vuoto evidente che un
 * contratto firmato con un indirizzo sbagliato).
 */
import { CONTRACT_TEMPLATES } from "./contract-templates.js";

export const TEMPLATE_BY_ID = Object.fromEntries(CONTRACT_TEMPLATES.map((t) => [t.id, t]));

// Mansione del CRM → modello. Le mansioni che non hanno un modello (es. Finance) vanno sullo staff.
const MANSIONE_FAMILY = { Chatter: "operatore", "Social Media Manager": "smm", Publisher: "smm" };
/** Nome della mansione come si scrive nel contratto (il CRM usa sigle). */
export const MANSIONE_LABEL = { PO: "Product Owner", HR: "HR", "Sales Manager": "Sales Manager", Editor: "Editor", Finance: "Finance", "Account Manager": "Account Manager" };
/** Descrizione (art. 1.3) presa dai contratti già firmati, modificabile prima dell'invio. */
export const DEFAULT_DESCRIPTION = {
  "Sales Manager": "la gestione operativa delle chat e la guida degli operatori di chat verso performance scalabili e sostenibili",
  "Account Manager": "la responsabilità completa sul progetto Modella con un quadro di ownership che integra vendite, marketing e coordinamento operativo",
  "Product Owner": "la definizione, pianificazione e prioritizzazione delle attività di progetto, coordinando le esigenze di business e degli stakeholder e garantendo l’avanzamento delle iniziative secondo gli obiettivi concordati",
  "Social Media Manager": "la gestione del traffico interno al profilo in termini di subscribers, in maniera coerente con le aspettative di brand identity della cliente, con responsabilità su piani editoriali, contenuti e performance organiche",
};

const s = (v) => (v == null ? "" : String(v)).trim();

/** Italiano se nato o residente in Italia, altrimenti inglese. */
export function suggestLang(fields = {}) {
  const res = fields.residenceComune;
  if (res && !res.abroad && res.name) return "it";
  const bp = fields.birthPlace;
  if (bp && !bp.abroad && bp.name) return "it";
  if (/ital/i.test(s(fields.nationality))) return "it";
  return res?.abroad || bp?.abroad ? "en" : "it";
}

/**
 * Modello suggerito per la PRIMA mansione che richiede un contratto (Board/Formatore non lo
 * richiedono). → { templateId, lang, mansione, note }
 */
export function suggestTemplate(fields = {}, { mansione: wanted = null, lang: forcedLang = null } = {}) {
  const list = [].concat(fields.mansioni || []).map(s).filter((m) => m && !["Board", "Formatore"].includes(m));
  const mansione = wanted || list[0] || null;
  const lang = forcedLang || suggestLang(fields);
  const family = MANSIONE_FAMILY[mansione] || "staff";
  let id = family === "operatore" ? `operatore_${lang}` : family === "smm" ? "smm_it" : `staff_${lang}`;
  let note = null;
  if (!TEMPLATE_BY_ID[id]) { id = id.replace(/_en$/, "_it"); note = "Per questa mansione esiste solo il modello in italiano."; }
  if (family === "smm" && lang === "en") note = "Per social media manager esiste solo il modello in italiano.";
  if (!mansione) note = "Nella scheda manca la mansione: scegli tu il modello.";
  return { templateId: id, lang: TEMPLATE_BY_ID[id].lang, mansione, note };
}

// ── Numeri in lettere (compenso) ─────────────────────────────────────────────
const IT_U = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const IT_T = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
function it99(n) {
  if (n < 20) return IT_U[n];
  const t = IT_T[Math.floor(n / 10)], u = n % 10;
  if (!u) return t;
  return (u === 1 || u === 8 ? t.slice(0, -1) : t) + (u === 3 ? "tré" : IT_U[u]);
}
function it999(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const hs = h === 0 ? "" : h === 1 ? "cento" : IT_U[h] + "cento";
  if (!r) return hs;
  const rs = it99(r);
  return (h && (r === 8 || (r >= 80 && r < 90)) ? hs.slice(0, -1) : hs) + rs;
}
export function itWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "zero";
  const mil = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  let out = "";
  if (mil) out += mil === 1 ? "unmilione" : it999(mil) + "milioni";
  if (th) out += th === 1 ? "mille" : it999(th) + "mila";
  if (rest) out += it999(rest);
  return out;
}
const EN_U = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_T = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function en999(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const parts = [];
  if (h) parts.push(`${EN_U[h]} hundred`);
  if (r) parts.push(r < 20 ? EN_U[r] : EN_T[Math.floor(r / 10)] + (r % 10 ? `-${EN_U[r % 10]}` : ""));
  return parts.join(" ");
}
export function enWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "zero";
  const mil = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  return [mil && `${en999(mil)} million`, th && `${en999(th)} thousand`, rest && en999(rest)].filter(Boolean).join(" ");
}
/** Importo come nei contratti firmati: IT "2000,00 (duemila/00)", EN "1.200,00 (one thousand two hundred)". */
export function amountText(value, lang) {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round((n - Math.floor(n)) * 100);
  if (lang === "en") {
    const num = Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + String(cents).padStart(2, "0");
    return { importo: num, importo_lettere: enWords(n) + (cents ? ` and ${cents}/100` : "") };
  }
  return { importo: `${Math.floor(n)},${String(cents).padStart(2, "0")}`, importo_lettere: `${itWords(n)}/${String(cents).padStart(2, "0")}` };
}

// ── Dati della persona nel formato dei contratti ─────────────────────────────
const isoToIt = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v)); return m ? `${m[3]}/${m[2]}/${m[1]}` : s(v); };
const place = (p, lang) => {
  if (!p) return "";
  if (p.abroad) return [s(p.city), s(p.country)].filter(Boolean).join(", ");
  const base = `${s(p.name)}${p.prov ? ` (${s(p.prov)})` : ""}`;
  return base ? `${base} - ${lang === "en" ? "Italy" : "Italia"}` : "";
};
const female = (g) => /^f/i.test(s(g)); // Female / F / femmina
export const genderKnown = (g) => /^(f|m)/i.test(s(g));

/**
 * @param fields   campi della scheda (fields)
 * @param cf       codice fiscale in chiaro (letto lato server; mai nel KV in chiaro)
 * @param idDoc    { type, number, issuer, expiry } dal documento (letto o corretto a mano)
 * @param terms    { mansione, descrizione, valuta, importo, minimoGarantito, incentivi, dispositivi, compensoEn, email, data, gender }
 * → { values, missing: [{key, label}] }
 */
export function contractValues({ fields = {}, cf = "", idDoc = {}, terms = {}, lang = "it", templateId = "" } = {}) {
  const tpl = TEMPLATE_BY_ID[templateId];
  const name = `${s(fields.firstName)} ${s(fields.surname)}`.replace(/\s+/g, " ").trim();
  const gender = s(terms.gender) || s(fields.gender);
  const fem = female(gender);
  const res = fields.residenceComune;
  const addr = s(fields.location?.address);
  const missing = [];
  const need = (key, label, v) => { if (!s(v)) missing.push({ key, label }); return s(v); };

  need("name", "Nome e cognome", name);
  if (!genderKnown(gender)) missing.push({ key: "gender", label: "Genere (per nato/nata, il Sig./la Sig.ra)" });
  const birth = need("birthPlace", "Luogo di nascita", place(fields.birthPlace, lang));
  const dob = need("dateOfBirth", "Data di nascita", isoToIt(fields.dateOfBirth));
  need("address", "Indirizzo di residenza", addr);
  const resPlace = place(res, lang);
  if (lang === "it") need("residence", "Comune di residenza", resPlace);
  const docType = need("idType", "Tipo di documento", idDoc.type);
  const docNum = need("idNumber", "Numero del documento", idDoc.number);
  const docIssuer = need("idIssuer", "Documento rilasciato da", idDoc.issuer);
  const docExp = lang === "it" ? need("idExpiry", "Scadenza del documento", isoToIt(idDoc.expiry)) : isoToIt(idDoc.expiry);
  const email = need("email", "Email della persona", terms.email || fields.personalEmail);

  let parte;
  if (lang === "en") {
    const resEn = [addr, resPlace].filter(Boolean).join(", ");
    parte = `${name}, born in ${birth} on ${dob}, resident in ${resEn}, identified by ${docType} no. ${docNum}, issued by ${docIssuer}${docExp ? `, valid through ${docExp}` : ""}`;
  } else {
    // il C.F. si scrive se c'è (nei contratti staff firmati a volte manca)
    parte = `${name}, ${fem ? "nata" : "nato"} a ${birth} il ${dob}, residente a ${resPlace} in ${addr}${cf ? `, C.F. ${cf}` : ""}, ${fem ? "identificata" : "identificato"} mediante ${docType} nr. ${docNum}, rilasciata da ${docIssuer}, valida sino al ${docExp}`;
  }

  const values = {
    parte, nome: name, NOME: name.toUpperCase(), email,
    data: s(terms.data) || isoToIt(new Date().toISOString().slice(0, 10)),
    _female: fem,
  };
  const uses = (ph) => tpl && tpl.blocks.some((b) => b.x.includes(`{{${ph}}}`));
  if (uses("mansione")) {
    const m = s(terms.mansione);
    values.mansione = need("mansione", "Mansione da scrivere nel contratto", m);
    values.articolo_mansione = m ? (/^[aeiouAEIOU]/.test(m) ? `l’${m}` : `il ${m}`) : "";
  }
  if (uses("descrizione")) values.descrizione = need("descrizione", "Descrizione dell'attività (art. 1.3)", terms.descrizione);
  if (uses("importo")) {
    const a = amountText(terms.importo, lang);
    if (!a) missing.push({ key: "importo", label: "Compenso mensile" });
    Object.assign(values, a || { importo: "", importo_lettere: "" });
    values.valuta = s(terms.valuta) || (lang === "en" ? "USD" : "EUR");
    values.minimo_garantito = terms.minimoGarantito === false ? "" : "minimo garantito ";
    values._incentivi = terms.incentivi !== false;
  }
  if (uses("dispositivi")) values.dispositivi = need("dispositivi", "Dispositivi in comodato d'uso", terms.dispositivi);
  if (uses("compenso_en")) values.compenso_en = need("compensoEn", "Compenso (testo dell'art. 4.1)", terms.compensoEn);
  return { values, missing };
}

/** Sostituisce i segnaposto. → { blocks, missing: [segnaposto senza valore] } */
export function fillTemplate(tpl, values = {}) {
  const missing = new Set();
  const blocks = [];
  for (const b of tpl.blocks) {
    if (b.if === "incentivi" && values._incentivi === false) continue;
    const x = b.x
      .replace(/\{\{g:([^|}]*)\|([^}]*)\}\}/g, (_, m, f) => (values._female ? f : m))
      .replace(/\{\{([A-Za-z_]+)\}\}/g, (_, k) => { const v = values[k]; if (v == null || (v === "" && k !== "minimo_garantito")) missing.add(k); return v == null ? `[${k}]` : String(v); });
    blocks.push({ t: b.t, x });
  }
  // incentivi tolti: la numerazione 4.4/4.5 del modello inglese resta coerente perché vanno via insieme
  return { blocks, missing: [...missing] };
}

/** Controllo incrociato documento ↔ scheda. → [{ key, label, ok, detail }] */
export function crossCheck({ fields = {}, cf = "", doc = {} } = {}) {
  const norm = (v) => s(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const out = [];
  const add = (key, label, a, b, { soft = false } = {}) => {
    if (!s(a) || !s(b)) { out.push({ key, label, ok: null, detail: !s(b) ? "non letto dal documento" : "non presente nella scheda" }); return; }
    const ok = norm(a) === norm(b) || (soft && (norm(a).includes(norm(b)) || norm(b).includes(norm(a))));
    out.push({ key, label, ok, detail: ok ? "coincide" : `scheda: ${s(a)} · documento: ${s(b)}` });
  };
  add("firstName", "Nome", fields.firstName, doc.firstName, { soft: true });
  add("surname", "Cognome", fields.surname, doc.surname, { soft: true });
  add("dateOfBirth", "Data di nascita", isoToIt(fields.dateOfBirth), isoToIt(doc.dateOfBirth));
  if (doc.taxCode || cf) add("cf", "Codice fiscale", cf, doc.taxCode);
  if (s(doc.expiry)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(doc.expiry));
    const expired = m && new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59Z`).getTime() < Date.now();
    out.push({ key: "expiry", label: "Validità", ok: m ? !expired : null, detail: m ? (expired ? `scaduto il ${isoToIt(doc.expiry)}` : `valido fino al ${isoToIt(doc.expiry)}`) : "scadenza non leggibile" });
  }
  return out;
}
