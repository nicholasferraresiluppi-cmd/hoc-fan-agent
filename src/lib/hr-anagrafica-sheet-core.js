/**
 * Foglio «Anagrafica Operatori» ← CRM persone (17/11/2026) — logica pura, nessun I/O.
 *
 * Perché esiste: il foglio Google dell'Area Partner si riempiva dal VECCHIO modulo Google
 * (scheda «Form responses»). Dal 4/10 le persone compilano il modulo di HOC Pro, che scrive
 * su app e ClickUp ma non sul foglio: Nicholas ha dovuto ricopiare i nomi a mano (10/11, 17/11)
 * e una ventina mancavano ancora. Qui si decide chi aggiungere e con quali valori.
 *
 * Regole (scelte per non fare danni su un foglio che le persone correggono a mano):
 *   - SOLO aggiunta in fondo: una riga già nel foglio non si tocca mai, neanche se in app cambia.
 *   - Una persona si aggiunge UNA volta sola (chi chiama tiene l'insieme degli id già scritti):
 *     se qualcuno cancella la riga di proposito, non ricompare.
 *   - «È già nel foglio» se coincide almeno uno tra: codice fiscale, email, cognome + data di
 *     nascita, cognome + un nome in comune. Meglio una riga in meno (si vede e si aggiunge a mano)
 *     che un doppione di una persona già scritta a mano con il nome un po' diverso.
 *   - Fuori: schede archiviate, in fase «Uscita» (24/11: aggiungere oggi chi è già andato via
 *     sarebbe una riga nuova senza scopo), senza nome o cognome, schede di prova.
 *   - Se le colonne del foglio non sono più quelle attese (qualcuno ne ha aggiunta o spostata
 *     una) non si scrive niente: i valori finirebbero sotto l'intestazione sbagliata.
 *   - Ogni valore passa da sheetText: il modulo è un link pubblico, un "=…" diventerebbe formula.
 */

import { PHASE_EXITED } from "./hr-fields.js";

/** Colonne della scheda «Form responses», nell'ordine del foglio (A…Q). */
export const SHEET_COLUMNS = [
  "Timestamp", "Nome", "Cognome", "Città di nascita", "Provincia di nascita", "Nazione di nascita",
  "Data di nascita", "Città di residenza", "Provincia di residenza", "Nazione di residenza",
  "Via e numero civico residenza", "Codice fiscale", "Numero documento", "Rilasciato da",
  "Valida sino al", "Email", "foto documento identita",
];
const COL = Object.fromEntries(SHEET_COLUMNS.map((c, i) => [c, i]));

/**
 * L'intestazione del foglio è quella attesa? Le intestazioni vere hanno esempi tra parentesi
 * («Città di nascita (Es. Roma)», «Numero documento (Carta d'identità / Passaporto)»): conta
 * l'inizio, confrontato senza maiuscole né spazi doppi. null se va bene, altrimenti la colonna
 * che non torna (frase per chi legge l'errore).
 */
export function headerMismatch(header = []) {
  const h = (v) => s(v).toLowerCase();
  for (let i = 0; i < SHEET_COLUMNS.length; i++) {
    const want = h(SHEET_COLUMNS[i]);
    if (!h(header[i]).startsWith(want)) return `colonna ${String.fromCharCode(65 + i)}: atteso «${SHEET_COLUMNS[i]}», trovato «${s(header[i]) || "vuota"}»`;
  }
  if (header.slice(SHEET_COLUMNS.length).some((v) => s(v))) return `ci sono colonne in più dopo la ${String.fromCharCode(64 + SHEET_COLUMNS.length)}`;
  return null;
}

const s = (v) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
/** minuscolo, senza accenti né apostrofi, solo lettere/cifre separate da uno spazio */
export const norm = (v) => s(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const normCf = (v) => s(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
const normMail = (v) => s(v).toLowerCase();

/** Data in "aaaa-mm-gg" da "aaaa-mm-gg" o "g/m/aaaa"; "" se non si riconosce. */
export function isoDate(v) {
  const t = s(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
/** "aaaa-mm-gg" → "gg/mm/aaaa" (formato del foglio). */
export function itDate(v) {
  const iso = isoDate(v);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
/** Istante → "gg/mm/aaaa hh:mm:ss" ora di Roma (come il timestamp del modulo Google). */
export function itTimestamp(ms) {
  if (!Number.isFinite(ms)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
}

/**
 * Valore sicuro per USER_ENTERED: testo che il foglio leggerebbe come formula ("=", "+", "-", "@")
 * o come numero (codice fiscale estero, numero di documento, telefono: perderebbe gli zeri
 * iniziali) diventa testo con l'apostrofo davanti, che il foglio non mostra.
 */
export function sheetText(v) {
  const t = s(v);
  if (!t) return "";
  if (/^[=+\-@]/.test(t) || /^\d[\d\s.,]*$/.test(t)) return `'${t}`;
  return t;
}

const isTest = (f) => /^prova\b/i.test(s(f.firstName)) || /^prova\b/i.test(s(f.surname));

/** Chiavi di confronto di una riga del foglio (array di celle A…Q). */
export function rowKeys(row = []) {
  const at = (c) => row[COL[c]];
  return {
    cf: normCf(at("Codice fiscale")),
    email: normMail(at("Email")),
    surname: norm(at("Cognome")),
    names: new Set(norm(at("Nome")).split(" ").filter(Boolean)),
    dob: isoDate(at("Data di nascita")),
  };
}

/** La persona (fields + cf in chiaro, se c'è) è già in una delle righe? */
export function findInSheet(person, cf, sheetKeys) {
  const f = person.fields || {};
  const myCf = normCf(cf);
  const myMail = normMail(f.personalEmail);
  const mySurname = norm(f.surname);
  const myNames = norm(f.firstName).split(" ").filter(Boolean);
  const myDob = isoDate(f.dateOfBirth);
  for (const k of sheetKeys) {
    if (myCf && k.cf && myCf === k.cf) return "codice fiscale";
    if (myMail && k.email && myMail === k.email) return "email";
    if (mySurname && k.surname === mySurname) {
      if (myDob && k.dob === myDob) return "cognome e data di nascita";
      if (myNames.some((n) => k.names.has(n))) return "nome e cognome";
    }
  }
  return null;
}

const placeParts = (p) => {
  if (!p) return { city: "", prov: "", country: "" };
  if (p.abroad) return { city: s(p.city), prov: "", country: s(p.country) };
  return p.name ? { city: s(p.name), prov: s(p.prov), country: "Italia" } : { city: "", prov: "", country: "" };
};

/**
 * Riga del foglio per una persona. `cf` in chiaro (o null), `idDoc` = lettura del documento
 * d'identità salvata in app (o null: le tre colonne del documento restano vuote).
 */
export function personToRow(person, { cf = null, idDoc = null } = {}) {
  const f = person.fields || {};
  const birth = placeParts(f.birthPlace);
  const res = placeParts(f.residenceComune);
  const v = {
    "Timestamp": itTimestamp(person.createdAt),
    "Nome": s(f.firstName),
    "Cognome": s(f.surname),
    "Città di nascita": birth.city,
    "Provincia di nascita": birth.prov,
    "Nazione di nascita": birth.country,
    "Data di nascita": itDate(f.dateOfBirth),
    "Città di residenza": res.city,
    "Provincia di residenza": res.prov,
    "Nazione di residenza": res.country,
    "Via e numero civico residenza": s(f.location?.address),
    "Codice fiscale": s(cf),
    "Numero documento": s(idDoc?.number),
    "Rilasciato da": s(idDoc?.issuer),
    "Valida sino al": itDate(idDoc?.expiry),
    "Email": s(f.personalEmail),
    // il documento caricato dal modulo sta tra gli allegati della scheda ClickUp
    "foto documento identita": s(person.clickupUrl),
  };
  // date e timestamp restano date vere (USER_ENTERED, foglio en_GB = gg/mm/aaaa)
  const asDate = new Set(["Timestamp", "Data di nascita", "Valida sino al"]);
  return SHEET_COLUMNS.map((c) => (asDate.has(c) ? v[c] : sheetText(v[c])));
}

/**
 * Chi aggiungere. `people` = schede (con `cf` già decifrato in `cfById`), `sheetRows` = righe del
 * foglio senza l'intestazione, `alreadyWritten` = id già aggiunti in passato.
 * Ritorna { add: [person], present: [{id, by}], skipped: [{id, why}] }.
 */
export function planSheetAppend({ people = [], sheetRows = [], alreadyWritten = new Set(), cfById = {}, onlyIds = null }) {
  const sheetKeys = sheetRows.map(rowKeys);
  const add = [];
  const present = [];
  const skipped = [];
  const only = onlyIds ? new Set(onlyIds) : null;
  for (const p of people) {
    if (only && !only.has(p.id)) continue;
    const f = p.fields || {};
    if (p.archived) { skipped.push({ id: p.id, why: "archiviata" }); continue; }
    if (s(f.collaborationStatus) === PHASE_EXITED) { skipped.push({ id: p.id, why: "uscita" }); continue; }
    if (!s(f.firstName) || !s(f.surname)) { skipped.push({ id: p.id, why: "senza nome o cognome" }); continue; }
    if (isTest(f)) { skipped.push({ id: p.id, why: "scheda di prova" }); continue; }
    if (alreadyWritten.has(p.id)) { present.push({ id: p.id, by: "già aggiunta da HOC Pro" }); continue; }
    const by = findInSheet(p, cfById[p.id], sheetKeys);
    if (by) { present.push({ id: p.id, by }); continue; }
    add.push(p);
    // due schede della stessa persona nello stesso giro: la seconda trova la prima
    sheetKeys.push(rowKeys(personToRow(p, { cf: cfById[p.id] })));
  }
  return { add, present, skipped };
}
