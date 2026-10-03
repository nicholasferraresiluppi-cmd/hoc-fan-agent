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
export const COLLAB_STATUSES = ["Onboarding", "Active", "Reassigning", "Outboarding", "Decommissioned", "Needs Review"];
export const GENDERS = ["Female", "Male", "Non-Binary", "I prefer not to declare it"];
export const HV_CONTRACT_STATUSES = ["To Do", "Drafted Shared", "Signature Requested", "Signed"];

export const FIELDS = [
  // Anagrafica
  { key: "firstName", label: "Nome", section: "anagrafica", type: "text", taskName: true },
  { key: "surname", label: "Cognome", section: "anagrafica", type: "text", cu: "Surname" },
  { key: "dateOfBirth", label: "Data di nascita", section: "anagrafica", type: "date", cu: "Date Of Birth" },
  { key: "nationality", label: "Nazionalità", section: "anagrafica", type: "text", cu: "Nationality" },
  { key: "gender", label: "Genere", section: "anagrafica", type: "option", cu: "Gender", options: GENDERS },
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
  { key: "collaborationStatus", label: "Stato collaborazione", section: "rapporto", type: "option", cu: "Collaboration Status", options: COLLAB_STATUSES },
  { key: "employmentType", label: "Tipo di rapporto", section: "rapporto", type: "option", cu: "Type of Employment" },
  { key: "role", label: "Ruolo", section: "rapporto", type: "labels", cu: "Role" },
  { key: "additionalRole", label: "Ruolo aggiuntivo", section: "rapporto", type: "labels", cu: "Additional Role" },
  { key: "currentJob", label: "Mansione attuale", section: "rapporto", type: "text", cu: "Mansione attuale", extra: true },
  { key: "department", label: "Reparto", section: "rapporto", type: "labels", cu: "Department" },
  { key: "project", label: "Progetto / creator", section: "rapporto", type: "labels", cu: "Project" },
  { key: "seniority", label: "Seniority", section: "rapporto", type: "option", cu: "Seniority" },
  { key: "skills", label: "Competenze (etichette ClickUp)", section: "rapporto", type: "labels", cu: "Skills" },
  { key: "skillLevels", label: "Competenze e livello", section: "rapporto", type: "skillmap", appOnly: true, mirror: "Competenze e livello" },
  { key: "learnWish", label: "Vorrebbe imparare", section: "rapporto", type: "learn", appOnly: true, mirror: "Vorrebbe imparare" },
  { key: "pastRoles", label: "Ruoli già ricoperti", section: "rapporto", type: "roles", appOnly: true, mirror: "Ruoli già ricoperti" },
  { key: "otherSkills", label: "Altro che sa fare", section: "rapporto", type: "longtext", appOnly: true, mirror: "Altro che sa fare", max: 500 },
  { key: "timeSlots", label: "Fasce orarie", section: "rapporto", type: "labels", cu: "Time Slots" },
  { key: "startDate", label: "Inizio collaborazione", section: "rapporto", type: "date", cu: "Start of Collaboration" },
  { key: "endDate", label: "Fine collaborazione", section: "rapporto", type: "date", cu: "End of Collaboration" },
  { key: "referent", label: "Referente", section: "rapporto", type: "users", cu: "Referent", readOnly: true },
  { key: "companyEmail", label: "Email aziendale", section: "rapporto", type: "email", cu: "Company Email" },
  { key: "companyPhone", label: "Telefono aziendale", section: "rapporto", type: "phone", cu: "Company Phone Number" },
  { key: "yellowWarnings", label: "Richiami gialli", section: "rapporto", type: "number", cu: "Yellow Warnings" },
  { key: "redWarnings", label: "Richiami rossi", section: "rapporto", type: "number", cu: "Red Warnings" },
  // Contratto
  { key: "agreementWith", label: "Accordo con", section: "contratto", type: "labels", cu: "Agreement with" },
  { key: "hvContractStatus", label: "Stato contratto", section: "contratto", type: "option", cu: "HV Contract Status", options: HV_CONTRACT_STATUSES },
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
export const FORM_KEYS = [
  "firstName", "surname", "dateOfBirth", "nationality", "gender", "birthPlace", "residenceComune", "location", "residenceCap", "personalEmail", "personalPhone",
  "skillLevels", "otherSkills", "pastRoles", "learnWish",
  "spokenLanguages", "timeSlots", "currentJob", "partitaIva", "codiceFiscale", "personalInterests", "linkedin",
];
// Campi che l'admin può modificare dalla scheda
export const EDITABLE_KEYS = FIELDS.filter((f) => !f.readOnly).map((f) => f.key);

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
export function validateCodiceFiscale(input) {
  const v = s(input).toUpperCase().replace(/\s+/g, "");
  if (!v) return { ok: false, error: "Codice fiscale vuoto." };
  if (v.length !== 16) return { ok: false, error: "Il codice fiscale ha 16 caratteri." };
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
export const PRIVACY_VERSION = "bozza-2026-09-29";
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
