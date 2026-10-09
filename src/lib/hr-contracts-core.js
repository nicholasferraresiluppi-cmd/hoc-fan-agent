/**
 * Contratti Dropbox Sign ↔ Centro HR — logica PURA (09/10/2026).
 *
 * Richiesta di Nicholas: i contratti firmati su Dropbox Sign entrano nel CRM e il CRM
 * deve dire, chiaro e cristallino, chi ce l'ha, chi no e chi sta cambiando mansione
 * (la mansione scritta nel CRM non è più quella del contratto firmato → serve un
 * contratto nuovo, e il CRM lo deve far notare da solo).
 *
 * Tre fatti emersi leggendo i 325 contratti veri, che spiegano le scelte qui sotto:
 *  - su Dropbox Sign NON ci sono modelli: la mansione si legge dal TESTO, non dal titolo.
 *    Un contratto intitolato "Collaboratore" ha lo stesso testo di quello da chatter
 *    ("attività autonome di carattere autorale" = operatore in chat);
 *  - lo staff ha la mansione scritta per esteso ("l'opera consisterà in quella di HR
 *    Senior", "the Consultant role will be that of Sales Manager"), a volte in PDF
 *    senza spazi ("consisteràinquelladiAccountManager");
 *  - nello stesso account ci sono anche contratti con le creator, moduli di apertura
 *    conto e NDA: non sono contratti del personale e non contano.
 *
 * Disciplina: si collega un contratto a una persona solo se l'abbinamento è UNICO
 * (email, poi nome). Due persone possibili = nessun abbinamento automatico: meglio
 * un contratto "senza scheda" da collegare a mano che il contratto di un altro
 * sulla scheda sbagliata.
 */

import { MANSIONI } from "./hr-fields.js";

// ── Lettura del contratto ────────────────────────────────────────────────────

/** Tipi di documento. Solo quelli "del personale" contano per lo stato. */
export const KIND = {
  operatore: "operatore",       // contratto da autore = chat
  staff: "staff",               // mansione scritta per esteso
  smm: "smm",                   // "attività autonome di social media management"
  consulente: "consulente",     // "consulenza organizzativa"
  sconosciuto: "sconosciuto",   // contratto del personale, mansione non leggibile
  risoluzione: "risoluzione",
  creator: "creator",           // contratto con una creator / talent
  nda: "nda",
  modulo: "modulo",             // modulo di apertura conto, non un contratto di lavoro
};
export const PERSONNEL_KINDS = new Set([KIND.operatore, KIND.staff, KIND.smm, KIND.consulente, KIND.sconosciuto]);
export const KIND_LABEL = {
  operatore: "Operatore (chat)", staff: "Staff", smm: "Social media manager", consulente: "Consulente",
  sconosciuto: "Mansione non leggibile", risoluzione: "Risoluzione", creator: "Contratto creator",
  nda: "Accordo di riservatezza", modulo: "Modulo apertura conto",
};

// Mansione del contratto → voce della tendina «Mansione» del CRM (null = nessuna voce corrispondente).
const ROLE_TO_MANSIONE = [
  [/sales\s*manager/i, "Sales Manager"],
  [/social\s*media/i, "Social Media Manager"],
  [/product\s*owner/i, "PO"],
  [/editor/i, "Editor"],
  [/\bhr\b|people\s*operations/i, "HR"],
  [/finance/i, "Finance"],
  [/publisher/i, "Publisher"],
  [/chatter|operatore/i, "Chatter"],
];
export function roleToMansione(role) {
  const r = String(role || "");
  for (const [re, m] of ROLE_TO_MANSIONE) if (re.test(r)) return MANSIONI.includes(m) ? m : null;
  return null;
}

const squash = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
// "consisterà in quella di" che regge anche i PDF senza spazi
const loose = (phrase) => new RegExp(phrase.split("").map((ch) => (ch === " " ? "\\s*" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*")).join(""), "i");
const ROLE_PATTERNS = [
  loose("consisterà in quella di"), loose("consistera in quella di"), loose("consisterà in quelladi"),
  loose("role will be that of"), loose("work will consist of that of"), loose("svolgendo attività di"),
];
/** "AccountManager" → "Account Manager"; maiuscola iniziale; niente spazi doppi. */
function prettyRole(raw) {
  let s = String(raw || "").replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  s = s.replace(/^(il|la|lo|l'|un|una)\s+/i, "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
function roleFromText(text) {
  for (const re of ROLE_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const end = rest.search(/[.,;:(]|\s{2,}|\bsecondo\b|\bovvero\b|\bconsistente\b/i);
    const role = prettyRole(end > 0 ? rest.slice(0, end) : rest.slice(0, 40));
    if (role.length >= 2 && role.length <= 60) return role;
  }
  return null;
}

/** Dal solo titolo (contratti in firma: il PDF non c'è ancora; PDF illeggibili). */
export function classifyTitle(title) {
  const t = String(title || "").toLowerCase();
  if (/risoluzion|termination/.test(t)) return { kind: KIND.risoluzione, role: null };
  if (/\bnda\b/.test(t)) return { kind: KIND.nda, role: null };
  if (/user application/.test(t)) return { kind: KIND.modulo, role: null };
  if (/chatter/.test(t)) return { kind: KIND.operatore, role: "Chatter" };
  if (/sales manager/.test(t)) return { kind: KIND.staff, role: "Sales Manager" };
  if (/\bsmm\b|social media/.test(t)) return { kind: KIND.smm, role: "Social Media Manager" };
  if (/\bam\b|account manager/.test(t)) return { kind: KIND.staff, role: "Account Manager" };
  if (/\bpo\b|product owner/.test(t)) return { kind: KIND.staff, role: "Product Owner" };
  if (/\bmb\b|management consultant/.test(t)) return { kind: KIND.staff, role: "Management Consultant" };
  if (/talent (manager|scouter)/.test(t)) return { kind: KIND.staff, role: /scouter/.test(t) ? "Talent Scouter" : "Talent Manager" };
  if (/content coordinator/.test(t)) return { kind: KIND.staff, role: "Content Coordinator" };
  if (/publisher|creator growth/.test(t)) return { kind: KIND.creator, role: null };
  return { kind: KIND.sconosciuto, role: null };
}

/**
 * Tipo e mansione di un contratto dal testo del PDF (fallback: titolo).
 * → { kind, role, mansione, readFrom: "testo"|"titolo" }
 */
export function classifyContract({ text = "", title = "" } = {}) {
  const t = String(text || "").replace(/\s+/g, " ");
  const ns = squash(t);
  const tl = String(title || "").toLowerCase();
  const out = (kind, role, readFrom = "testo") => ({ kind, role: role || null, mansione: kind === KIND.operatore ? "Chatter" : kind === KIND.smm ? "Social Media Manager" : roleToMansione(role), readFrom });
  if (/risoluzion|termination/.test(tl)) return out(KIND.risoluzione, null, ns ? "testo" : "titolo");
  if (ns.length < 200) { const c = classifyTitle(title); return out(c.kind, c.role, "titolo"); }
  if (/\bnda\b/.test(tl) || ns.slice(0, 3000).includes("non-disclosureagreement")) return out(KIND.nda);
  if (ns.slice(0, 600).includes("userapplication")) return out(KIND.modulo);
  if (ns.slice(0, 4000).includes("risoluzioneconsensuale")) return out(KIND.risoluzione);
  const role = roleFromText(t);
  if (role) return out(KIND.staff, role);
  if (/carattereautor[i]?ale|independentauthorial|authorialactivit/.test(ns)) return out(KIND.operatore, "Operatore (chat)");
  if (ns.slice(0, 8000).includes("socialmediamanagement")) return out(KIND.smm, "Social Media Manager");
  if (ns.slice(0, 8000).includes("consulenzaorganizzativa")) return out(KIND.consulente, "Consulente organizzativo");
  if (/profilodel\/dellacreator|profilodellacreator|profilodelcreator|creator['’]sprofiles|talentmanagementservices/.test(ns)) return out(KIND.creator);
  const c = classifyTitle(title);
  return out(c.kind, c.role, "titolo");
}

// ── Richiesta di firma → contratto ───────────────────────────────────────────

export const HOC_SIGNER_EMAILS = ["contact@houseofcreators.com"];

/** Stato della firma: firmato | in_firma | rifiutato | scaduto. */
export function signatureState(req, now = Date.now()) {
  if (req?.is_complete) return "firmato";
  if (req?.is_declined || (req?.signatures || []).some((s) => s.status_code === "declined")) return "rifiutato";
  if (req?.expires_at && req.expires_at * 1000 < now) return "scaduto";
  return "in_firma";
}

/**
 * Forma compatta di una richiesta Dropbox Sign (quella che si salva).
 * Solo metadati: nessun testo del contratto, nessun dato oltre a nome ed email di chi firma.
 */
export function requestToContract(req, { now = Date.now(), hocEmails = HOC_SIGNER_EMAILS } = {}) {
  const sigs = req?.signatures || [];
  const other = sigs.find((s) => !hocEmails.includes(String(s.signer_email_address || "").toLowerCase())) || null;
  const signedAt = Math.max(0, ...sigs.map((s) => Number(s.signed_at) || 0)) * 1000 || null;
  return {
    id: String(req.signature_request_id),
    title: String(req.title || req.original_title || "").replace(/\s+/g, " ").trim(),
    createdAt: (Number(req.created_at) || 0) * 1000,
    signedAt: req.is_complete ? signedAt : null,
    state: signatureState(req, now),
    signerName: other ? String(other.signer_name || "").trim() : "",
    signerEmail: other ? String(other.signer_email_address || "").trim().toLowerCase() : "",
  };
}

// ── Abbinamento contratto ↔ scheda ───────────────────────────────────────────

const STOP = new Set("contratto contract hoc h o c 0 collaboratore collaborator chatter sales manager am mb po agreement risoluzione di del della the and creator growth marketing talent scouter content coordinator smm user application cosmo nda meet".split(" "));
export function nameTokens(s) {
  return new Set(String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)) || []);
}
const subset = (a, b) => [...a].every((x) => b.has(x));

/**
 * @param contracts [{id, title, signerName, signerEmail, kind}]
 * @param people    [{id, firstName, surname, emails: []}]
 * @param links     {contractId: personId | "none"} — scelte a mano, vincono sempre
 * → { byContract: {contractId: {personId, how}}, ambiguous: {contractId: [personId]} }
 */
export function matchContracts(contracts = [], people = [], links = {}) {
  const P = people.map((p) => ({ id: p.id, tok: nameTokens(`${p.firstName || ""} ${p.surname || ""}`), emails: new Set((p.emails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)) }));
  const byContract = {};
  const ambiguous = {};
  for (const c of contracts) {
    const manual = links[c.id];
    if (manual === "none") continue;
    if (manual && P.some((p) => p.id === manual)) { byContract[c.id] = { personId: manual, how: "a mano" }; continue; }
    if (c.kind && !PERSONNEL_KINDS.has(c.kind) && c.kind !== KIND.risoluzione) continue;
    const byEmail = c.signerEmail ? P.filter((p) => p.emails.has(c.signerEmail)) : [];
    if (byEmail.length === 1) { byContract[c.id] = { personId: byEmail[0].id, how: "email" }; continue; }
    if (byEmail.length > 1) { ambiguous[c.id] = byEmail.map((p) => p.id); continue; }
    // nome: prima chi firma, poi il titolo (un titolo può nominare due persone)
    let found = null;
    for (const src of [nameTokens(c.signerName), nameTokens(c.title)]) {
      if (!src.size) continue;
      const cands = P.filter((p) => p.tok.size >= 2 && subset(p.tok, src));
      if (!cands.length) continue;
      const best = Math.max(...cands.map((p) => p.tok.size));
      const top = cands.filter((p) => p.tok.size === best);
      found = top.length === 1 ? { one: top[0].id } : { many: top.map((p) => p.id) };
      break;
    }
    if (found?.one) byContract[c.id] = { personId: found.one, how: "nome" };
    else if (found?.many) ambiguous[c.id] = found.many;
  }
  return { byContract, ambiguous };
}

// ── Stato del contratto della persona ────────────────────────────────────────

/** Mansioni che non richiedono un contratto proprio (cappello in più, non un lavoro diverso). */
export const EXEMPT_MANSIONI = ["Board", "Formatore"];

/**
 * Esito per persona. `flag` (una sola parola, per elenco e filtri):
 *  ok                — contratto firmato e mansione uguale a quella del CRM
 *  cambiata          — la mansione del CRM non è coperta da nessun contratto firmato: serve un contratto nuovo
 *  cambiata_in_firma — come sopra, ma il contratto nuovo è già partito
 *  in_firma          — nessun contratto firmato, uno in attesa di firma
 *  mancante          — nessun contratto su Dropbox Sign
 *  risolto           — l'ultimo atto è una risoluzione (se lavora ancora con noi serve un contratto nuovo)
 *  da_verificare     — firmato, ma la mansione non si confronta (CRM senza mansione, o contratto non leggibile)
 *  non_richiesto     — mansione che non richiede contratto (es. Board) e nessun contratto
 */
export function contractStatus(mansioni = [], contracts = []) {
  const crm = [...new Set([].concat(mansioni || []).map((m) => String(m || "").trim()).filter(Boolean))];
  const required = crm.filter((m) => !EXEMPT_MANSIONI.includes(m));
  const all = [...contracts].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const terms = all.filter((c) => c.kind === KIND.risoluzione && c.state === "firmato");
  const lastTerm = terms[terms.length - 1] || null;
  const active = all.filter((c) => PERSONNEL_KINDS.has(c.kind) && (!lastTerm || (c.createdAt || 0) > (lastTerm.createdAt || 0)));
  const signed = active.filter((c) => c.state === "firmato");
  const pending = active.filter((c) => c.state === "in_firma");
  const latestSigned = signed[signed.length - 1] || null;
  const covered = new Set(signed.map((c) => c.mansione).filter(Boolean));
  const uncovered = required.filter((m) => !covered.has(m));
  const base = { crm, contractMansioni: [...covered], latestSigned: latestSigned?.id || null, pending: pending.map((c) => c.id), uncovered };

  if (!signed.length) {
    if (pending.length) return { ...base, flag: "in_firma", contract: "in_firma" };
    if (lastTerm) return { ...base, flag: "risolto", contract: "risolto", terminatedAt: lastTerm.signedAt || lastTerm.createdAt };
    if (crm.length && !required.length) return { ...base, flag: "non_richiesto", contract: "mancante" };
    return { ...base, flag: "mancante", contract: "mancante" };
  }
  if (!required.length) return { ...base, flag: crm.length ? "ok" : "da_verificare", contract: "firmato", why: crm.length ? null : "crm_vuoto" };
  if (!uncovered.length) return { ...base, flag: "ok", contract: "firmato" };
  // la mansione del contratto non si legge: non si può dire che è cambiata
  if (!covered.size) return { ...base, flag: "da_verificare", contract: "firmato", why: "contratto_illeggibile" };
  const newOne = pending.find((c) => !c.mansione || uncovered.includes(c.mansione));
  return { ...base, flag: newOne ? "cambiata_in_firma" : "cambiata", contract: "firmato" };
}

export const FLAG_LABEL = {
  ok: "Firmato", cambiata: "Mansione cambiata", cambiata_in_firma: "Nuovo contratto in firma", in_firma: "In firma",
  mancante: "Manca", risolto: "Risolto", da_verificare: "Da verificare", non_richiesto: "Non richiesto",
};
/** Le domande del CRM, nell'ordine in cui vanno guardate. */
export const FLAG_ORDER = ["cambiata", "mancante", "risolto", "da_verificare", "in_firma", "cambiata_in_firma", "ok", "non_richiesto"];

/**
 * Valore del campo «Stato del contratto» (CRM e ClickUp) che segue da Dropbox Sign,
 * o null = non toccare. Dropbox Sign dice il vero su firmato / in firma; quando la
 * mansione è cambiata il contratto da preparare è quello NUOVO → «Da preparare», ma
 * senza scavalcare una «Bozza condivisa» messa a mano da chi lo sta già preparando.
 */
export function desiredContractField(status, current) {
  const cur = current || "";
  switch (status?.flag) {
    case "ok":
    case "da_verificare":
      return cur === "Firmato" ? null : "Firmato";
    case "in_firma":
    case "cambiata_in_firma":
      return cur === "Firma richiesta" ? null : "Firma richiesta";
    case "cambiata":
    case "risolto":
      return ["", "Firmato", "Firma richiesta"].includes(cur) ? "Da preparare" : null;
    default:
      return null; // mancante / non richiesto: lo stato lo decide l'HR (può essere una bozza in corso)
  }
}

/** Frase per la scheda: cosa sta succedendo e cosa fare. `name` di un contratto → titolo/data. */
export function statusSentence(status, byId = {}, fmt = (ms) => new Date(ms).toLocaleDateString("it-IT")) {
  const c = byId[status?.latestSigned];
  const when = c ? fmt(c.signedAt || c.createdAt) : "";
  const contrRole = c ? (c.role || KIND_LABEL[c.kind]) : "";
  switch (status?.flag) {
    case "ok": return `Contratto firmato${when ? ` il ${when}` : ""} da ${contrRole}: coerente con la mansione nel CRM.`;
    case "cambiata": return `Nel CRM la mansione è ${status.uncovered.join(", ")}, ma il contratto firmato${when ? ` il ${when}` : ""} è da ${contrRole}. Serve un contratto nuovo.`;
    case "cambiata_in_firma": return `Mansione cambiata in ${status.uncovered.join(", ")}: il contratto nuovo è partito ed è in attesa di firma.`;
    case "in_firma": return "Il contratto è stato inviato ed è in attesa di firma.";
    case "mancante": return "Nessun contratto su Dropbox Sign. Se è stato firmato altrove, va recuperato; se non c'è, va preparato.";
    case "risolto": return `Il contratto è stato risolto${status.terminatedAt ? ` il ${fmt(status.terminatedAt)}` : ""}. Se lavora ancora con noi serve un contratto nuovo.`;
    case "da_verificare": return status.why === "crm_vuoto"
      ? `Contratto firmato${when ? ` il ${when}` : ""} da ${contrRole}, ma nel CRM la mansione non è indicata: aggiungila per completare il controllo.`
      : `Contratto firmato${when ? ` il ${when}` : ""}, ma la mansione non si legge dal documento: controlla il PDF.`;
    case "non_richiesto": return "Nessun contratto: per questa mansione non è richiesto.";
    default: return "";
  }
}
