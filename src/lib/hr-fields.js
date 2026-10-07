/**
 * Centro HR — schema dei campi e codice fiscale (29/09/2026).
 *
 * Modulo SENZA dipendenze Node (niente crypto, niente KV): lo importano sia il
 * server (via hr-people-core.js) sia le pagine client (scheda, modulo
 * pubblico). Aggiungere qui un import server-only romperebbe le pagine.
 */

// ── Schema dei campi ────────────────────────────────────────────────────────
// key = nome in app · cu = nome del campo ClickUp (risolto a runtime per NOME,
// mai per id) · type = tipo in app · extra = campo nuovo deciso dal titolare
// (se la lista non ha un campo con quel nome finisce nel blocco in descrizione)
// · readOnly = in app si legge soltanto (lo scrive ClickUp o un upload)
// · appOnly + mirror = dato strutturato dell'app che su ClickUp vive come TESTO nel
//   campo dedicato `mirror` (se la lista ce l'ha; altrimenti riga nel blocco in
//   descrizione, lì in sola lettura). Dal 03/10/2026 a DUE VIE: si modifica in app
//   o su ClickUp; il testo si rilegge con hr-mirror.js e, se non si capisce, vale
//   il valore dell'app (evento nello storico della scheda).
// Lingue del modulo (04/10/2026): per OGNUNA delle cinque la persona deve rispondere,
// anche "No". Il "No" viaggia come etichetta-sentinella "ENG - No" solo nel browser
// (bozza compresa); il server la toglie prima di salvare e non arriva mai a ClickUp.
export const LANG_CODES = ["ITA", "ENG", "SPA", "TED", "FR"];
export const langNo = (code) => `${code} - No`;
export const isLangNo = (label) => / - No$/.test(String(label || "").trim());
export const stripLangNo = (list) => (Array.isArray(list) ? list.filter((x) => !isLangNo(x)) : list);
/** Codici delle lingue a cui non si è ancora risposto (né livello né "No"). */
export function langsUnanswered(list) {
  const cur = Array.isArray(list) ? list.map((x) => String(x || "").trim()) : [];
  return LANG_CODES.filter((c) => !cur.some((x) => x.startsWith(`${c} - `)));
}
// Mansione (06/10/2026, Nicholas): la mettono HR/coordinamento a mano, non il modulo. Più voci
// insieme se la persona ne copre più d'una. Su ClickUp = campo etichette «Mansione».
export const MANSIONI = ["Chatter", "Sales Manager", "PO", "Social Media Manager", "Editor", "Publisher", "HR", "Finance"];
// Progetto (06/10/2026, Nicholas): campo NUOVO con le creator del NOSTRO split (foglio dello split,
// varianti di lingua unite tranne Fishball, che ha due squadre ITA/ENG; Chiara Stefane non ancora partita) più «Interno» per chi lavora in
// azienda senza una creator. HR e Finance stanno solo in Mansione (cosa fai), non qui (su chi lavori).
// Il vecchio «Project» di ClickUp aveva le modelle dello split precedente: resta leggibile come campo vecchio.
export const PROGETTI = [
  "Fishball ITA", "Fishball ENG", "Rebecca Bardaro", "Alessandra Sparagno", "Anastasia Policardi", "Chiara Stefane", "Christina Bertevello",
  "Cubanita", "Elisa Vimercati", "Giulia Ottorini", "Martina Scavo", "Michela Mucciante", "Stormy", "Giulia Amici",
  "Interno",
];
export const GENDERS = ["Female", "Male", "Non-Binary", "I prefer not to declare it"];
// 05/10/2026: nel modulo il genere usciva in inglese (sono le opzioni del campo ClickUp). Il valore
// salvato resta quello di ClickUp, a schermo si legge in italiano.
export const GENDER_LABELS = { Female: "Donna", Male: "Uomo", "Non-Binary": "Non binario", "I prefer not to declare it": "Preferisco non dirlo" };
// Come la persona è arrivata da noi (03/10/2026, decisione del titolare): serve a tenere
// vivo il confronto reference ↔ annunci e a riconoscere il premio reference (100 € a 30
// turni). La prima voce apre la domanda "Chi ti ha segnalato?".
export const SOURCE_REFERRAL = "Me l'ha consigliato qualcuno";
export const SOURCE_AD = "Ho visto un annuncio o un post sui social";
// 05/10/2026 (Nicholas): o reference o annuncio. «Dai social» e «Altro» confluiscono nell'annuncio
// (le schede vecchie si leggono già così e la parità riallinea ClickUp da sola).
export const SOURCES = [SOURCE_REFERRAL, SOURCE_AD];
const LEGACY_SOURCES = new Set(["Dai social", "Altro", "Ho visto un annuncio"]);
/** Provenienza nella forma attuale (bozze nel browser, ClickUp e schede vecchie). */
export const canonicalSource = (v) => (LEGACY_SOURCES.has(v) ? SOURCE_AD : v);

// ── Fasi della persona e stato del contratto (03/10/2026, decisioni del titolare) ──
// UNICA tabella di corrispondenza: due assi separati, fase e contratto. Per ogni voce
//   label  = nome in app (italiano): è anche il valore salvato in HOC Pro
//   cu     = opzione della tendina ClickUp (oggi in inglese: la tendina è condivisa
//            col CRM vero, per ora resta così e l'app traduce)
//   status = stato del task nella lista HR di ClickUp (solo per le fasi)
// Il confronto con ClickUp accetta SIA il nome inglese SIA quello italiano, senza
// badare alle maiuscole: quando la tendina verrà tradotta su ClickUp il codice
// continua a funzionare così com'è.
// `selectable: false` = valore che può arrivare da ClickUp e si mostra in sola
// lettura, ma non si offre nei menu ("Needs Review" non è più una fase).
// Da procedura non si elimina mai una persona: chi va via resta con la fase "Uscita".
export const PERSON_PHASES = [
  { label: "In ingresso", cu: "Onboarding", status: "In ingresso" },
  { label: "Attiva", cu: "Active", status: "Attiva" },
  { label: "In riassegnazione", cu: "Reassigning", status: "In riassegnazione" },
  { label: "In uscita", cu: "Outboarding", status: "In uscita" },
  { label: "Uscita", cu: "Decommissioned", status: "Uscita" },
  { label: "Da verificare", cu: "Needs Review", status: null, selectable: false },
];
export const PHASE_ENTRY = "In ingresso";
export const PHASE_ACTIVE = "Attiva";
export const PHASE_EXITED = "Uscita";
/** Le 5 fasi che si possono scegliere, in ordine. */
export const PHASE_LABELS = PERSON_PHASES.filter((p) => p.selectable !== false).map((p) => p.label);

export const CONTRACT_STATUSES = [
  { label: "Da preparare", cu: "To Do" },
  { label: "Bozza condivisa", cu: "Drafted Shared" },
  { label: "Firma richiesta", cu: "Signature Requested" },
  { label: "Firmato", cu: "Signed" },
];
export const CONTRACT_LABELS = CONTRACT_STATUSES.map((c) => c.label);

const lcTrim = (v) => (v == null ? "" : String(v)).trim().toLowerCase();
/** Voce della tabella per un nome (italiano o ClickUp, maiuscole indifferenti), o null. */
export function findChoice(choices, name) {
  const n = lcTrim(name);
  if (!n) return null;
  return (choices || []).find((c) => lcTrim(c.label) === n || lcTrim(c.cu) === n) || null;
}
/**
 * Valore app per un nome qualunque: l'etichetta italiana se si riconosce,
 * altrimenti il testo com'è (un'opzione sconosciuta non fa crash: si mostra e basta).
 */
export function choiceLabel(choices, name) {
  const hit = findChoice(choices, name);
  if (hit) return hit.label;
  const raw = name == null ? "" : String(name).trim();
  return raw || null;
}
/** Fase che corrisponde a uno stato del task ClickUp (italiano o inglese), o null se è uno stato estraneo (es. "to do"). */
export function phaseFromTaskStatus(status) {
  const n = lcTrim(status);
  if (!n) return null;
  const hit = PERSON_PHASES.find((p) => p.status && [p.status, p.label, p.cu].some((x) => lcTrim(x) === n));
  return hit ? hit.label : null;
}
/** Nomi accettati per lo stato del task di una fase (per trovarlo tra gli stati della lista). */
export function taskStatusNamesFor(phase) {
  const p = findChoice(PERSON_PHASES, phase);
  if (!p || !p.status) return [];
  return [...new Set([p.status, p.label, p.cu])];
}

export const FIELDS = [
  // Anagrafica
  { key: "firstName", label: "Nome", section: "anagrafica", type: "text", taskName: true },
  { key: "surname", label: "Cognome", section: "anagrafica", type: "text", cu: "Surname" },
  { key: "dateOfBirth", label: "Data di nascita", section: "anagrafica", type: "date", cu: "Date Of Birth" },
  { key: "nationality", label: "Nazionalità", section: "anagrafica", type: "text", cu: "Nationality" },
  { key: "gender", label: "Genere", section: "anagrafica", type: "option", cu: "Gender", options: GENDERS, labels: GENDER_LABELS },
  { key: "birthPlace", label: "Luogo di nascita", section: "anagrafica", type: "birth", appOnly: true, mirror: "Luogo di nascita" },
  { key: "residenceComune", label: "Comune di residenza", section: "anagrafica", type: "comune", appOnly: true, mirror: "Comune di residenza" },
  { key: "location", label: "Indirizzo", section: "anagrafica", type: "location", cu: "Location" },
  { key: "residenceCap", label: "CAP", section: "anagrafica", type: "text", appOnly: true, mirror: "CAP" },
  { key: "codiceFiscale", label: "Codice fiscale", section: "anagrafica", type: "cf", cu: "Codice fiscale", extra: true, sensitive: true },
  { key: "personalEmail", label: "Email personale", section: "anagrafica", type: "email", cu: "Personal Email" },
  { key: "personalPhone", label: "Telefono personale", section: "anagrafica", type: "phone", cu: "Personal Phone Number" },
  { key: "spokenLanguages", label: "Lingue parlate", section: "anagrafica", type: "labels", cu: "Spoken Languages" },
  { key: "personalInterests", label: "Interessi personali", section: "anagrafica", type: "longtext", cu: "Personal Interests" },
  { key: "linkedin", label: "LinkedIn", section: "anagrafica", type: "url", cu: "LinkedIn" },
  // Rapporto
  // fase della persona: tendina "Collaboration Status" + stato del task (tabella PERSON_PHASES)
  { key: "collaborationStatus", label: "Fase", section: "rapporto", type: "option", cu: "Collaboration Status", choices: PERSON_PHASES, options: PHASE_LABELS },
  { key: "employmentType", label: "Tipo di rapporto", section: "rapporto", type: "option", cu: "Type of Employment" },
  { key: "role", label: "Ruolo", section: "rapporto", type: "labels", cu: "Role" },
  { key: "additionalRole", label: "Ruolo aggiuntivo", section: "rapporto", type: "labels", cu: "Additional Role" },
  { key: "mansioni", label: "Mansione", section: "rapporto", type: "labels", cu: "Mansione", options: MANSIONI },
  { key: "currentJob", label: "Mansione (testo, vecchio)", section: "rapporto", type: "text", cu: "Mansione attuale", extra: true },
  { key: "department", label: "Reparto", section: "rapporto", type: "labels", cu: "Department" },
  { key: "progetto", label: "Progetto", section: "rapporto", type: "labels", cu: "Progetto", options: PROGETTI },
  { key: "project", label: "Progetto (vecchio)", section: "rapporto", type: "labels", cu: "Project" },
  { key: "seniority", label: "Seniority", section: "rapporto", type: "option", cu: "Seniority" },
  { key: "skills", label: "Competenze (etichette ClickUp)", section: "rapporto", type: "labels", cu: "Skills" },
  { key: "skillLevels", label: "Competenze e livello", section: "rapporto", type: "skillmap", appOnly: true, mirror: "Competenze e livello" },
  { key: "learnWish", label: "Vorrebbe imparare", section: "rapporto", type: "learn", appOnly: true, mirror: "Vorrebbe imparare" },
  { key: "pastRoles", label: "Ruoli già ricoperti", section: "rapporto", type: "roles", appOnly: true, mirror: "Ruoli già ricoperti" },
  { key: "otherSkills", label: "Altro che sa fare", section: "rapporto", type: "longtext", appOnly: true, mirror: "Altro che sa fare", max: 500 },
  { key: "timeSlots", label: "Fasce orarie", section: "rapporto", type: "labels", cu: "Time Slots" },
  { key: "source", label: "Come ci ha conosciuto", section: "rapporto", type: "option", cu: "Provenienza", extra: true, options: SOURCES },
  { key: "referredBy", label: "Segnalato da", section: "rapporto", type: "text", cu: "Segnalato da", extra: true },
  { key: "startDate", label: "Inizio collaborazione", section: "rapporto", type: "date", cu: "Start of Collaboration" },
  { key: "endDate", label: "Fine collaborazione", section: "rapporto", type: "date", cu: "End of Collaboration" },
  { key: "referent", label: "Referente", section: "rapporto", type: "users", cu: "Referent" },
  { key: "companyEmail", label: "Email aziendale", section: "rapporto", type: "email", cu: "Company Email" },
  { key: "companyPhone", label: "Telefono aziendale", section: "rapporto", type: "phone", cu: "Company Phone Number" },
  { key: "yellowWarnings", label: "Richiami gialli", section: "rapporto", type: "number", cu: "Yellow Warnings" },
  { key: "redWarnings", label: "Richiami rossi", section: "rapporto", type: "number", cu: "Red Warnings" },
  // Contratto
  { key: "agreementWith", label: "Accordo con", section: "contratto", type: "labels", cu: "Agreement with" },
  // stato del contratto: asse separato dalla fase (tendina "HV Contract Status", tabella CONTRACT_STATUSES).
  // La chiave resta hvContractStatus (esisteva già: rinominarla avrebbe staccato i dati salvati). Non è nel modulo pubblico.
  { key: "hvContractStatus", label: "Stato del contratto", section: "contratto", type: "option", cu: "HV Contract Status", choices: CONTRACT_STATUSES, options: CONTRACT_LABELS },
  { key: "partitaIva", label: "Partita IVA", section: "contratto", type: "bool", cu: "Partita IVA", extra: true },
  // Documenti (in app solo riferimenti: i file stanno su ClickUp)
  { key: "idDocument", label: "Documento d'identità", section: "documenti", type: "fileRef", cu: "Documento d'identità", extra: true, readOnly: true },
  { key: "cvUpload", label: "CV caricato dal modulo", section: "documenti", type: "fileRef", readOnly: true, appOnly: true },
  { key: "cvFiles", label: "CV (ClickUp)", section: "documenti", type: "attachment", cu: "CV", readOnly: true },
  { key: "contractFiles", label: "Contratto PDF (ClickUp)", section: "documenti", type: "attachment", cu: "Contract PDF", readOnly: true },
];
export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const SECTIONS = [
  { key: "anagrafica", label: "Anagrafica" },
  { key: "rapporto", label: "Rapporto" },
  { key: "contratto", label: "Contratto" },
  { key: "documenti", label: "Documenti" },
];
// Campi che la persona può compilare dal modulo pubblico (i SUOI dati)
// 04/10/2026: le fasce orarie e la mansione NON si chiedono più nel modulo (decisione del
// titolare); restano in scheda e su ClickUp, le compila HR.
export const FORM_KEYS = [
  "firstName", "surname", "dateOfBirth", "nationality", "gender", "birthPlace", "residenceComune", "location", "residenceCap", "personalEmail", "personalPhone",
  "skillLevels", "otherSkills", "pastRoles", "learnWish",
  "spokenLanguages", "partitaIva", "codiceFiscale", "personalInterests", "linkedin",
  "source", "referredBy",
];
// Campi che l'admin può modificare dalla scheda
export const EDITABLE_KEYS = FIELDS.filter((f) => !f.readOnly).map((f) => f.key);

/**
 * Riporta i campi "a tabella" (fase, contratto) all'etichetta italiana: le schede
 * salvate prima del 03/10/2026 hanno l'opzione ClickUp ("Active", "Needs Review"…).
 * Cambia solo la forma del valore, mai il significato: chi è "Onboarding" diventa
 * "In ingresso", anche se lavora da mesi (lo si sistema a mano, decisione del titolare).
 */
export function normalizeChoiceFields(fields) {
  if (!fields) return fields;
  let out = fields;
  for (const f of FIELDS) {
    if (!f.choices || fields[f.key] == null) continue;
    const v = choiceLabel(f.choices, fields[f.key]);
    if (v !== fields[f.key]) out = { ...out, [f.key]: v };
  }
  if (LEGACY_SOURCES.has(out.source)) out = { ...out, source: SOURCE_AD };
  return out;
}

const s = (v) => (v == null ? "" : String(v)).trim();

// ── Codice fiscale ──────────────────────────────────────────────────────────
const ODD = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const evenVal = (c) => (/\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65);
// Omocodia: le cifre possono essere sostituite da LMNPQRSTUV
const CF_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

export function cfControlChar(first15) {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = first15[i];
    // posizioni 1,3,5… (base 1) = indici pari
    sum += i % 2 === 0 ? ODD[c] : evenVal(c);
  }
  return String.fromCharCode(65 + (sum % 26));
}

/** @returns {{ok:true, value:string} | {ok:false, error:string}} */
// 06/10/2026 (Nicholas): chi viene da fuori (es. Filippine: TIN di 9-12 cifre, «123-456-789-000»)
// non ha il codice fiscale italiano di 16 caratteri. Si accetta anche il numero fiscale del proprio
// paese: 5-20 caratteri tra lettere, cifre, trattini, punti e barre, con almeno 5 cifre. Un testo che
// INIZIA come un codice fiscale italiano (6 lettere + 2 cifre) resta controllato alla lettera: così un
// codice italiano scritto a metà non passa per «estero».
const CF_IT_START = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}/;
const FOREIGN_TAX_RE = /^[A-Z0-9][A-Z0-9./-]{3,18}[A-Z0-9]$/;
export function isForeignTaxId(v) {
  return FOREIGN_TAX_RE.test(v) && (v.match(/\d/g) || []).length >= 5 && !CF_IT_START.test(v);
}
export function validateCodiceFiscale(input) {
  const v = s(input).toUpperCase().replace(/\s+/g, "");
  if (!v) return { ok: false, error: "Codice fiscale vuoto." };
  if (isForeignTaxId(v)) return { ok: true, value: v, foreign: true };
  if (v.length !== 16) return { ok: false, error: "Il codice fiscale italiano ha 16 caratteri. Se non ce l'hai, scrivi il numero fiscale del tuo paese." };
  if (!CF_RE.test(v)) return { ok: false, error: "Formato del codice fiscale non valido." };
  if (cfControlChar(v.slice(0, 15)) !== v[15]) return { ok: false, error: "Il carattere di controllo non torna: controlla di averlo scritto bene." };
  return { ok: true, value: v };
}
export function maskCf(cf) {
  const v = s(cf);
  if (v.length < 4) return "••••••••••••••••";
  return v.slice(0, 3) + "•".repeat(v.length - 4) + v.slice(-1);
}

// ── Modulo pubblico e file ──────────────────────────────────────────────────
// testo in /hr/privacy (03/10/2026): informativa art. 13 GDPR per i dati della collaborazione
export const PRIVACY_VERSION = "2026-10-03.2"; // .2: frase sullo spazio temporaneo dei documenti
// 50 MB (03/10/2026, alzato da 20 su richiesta di Nicholas): i file vanno diretti sul Blob privato, non più nel corpo della funzione (~4,5 MB)
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
