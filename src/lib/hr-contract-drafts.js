/**
 * Preparazione e invio del contratto dal CRM (10/10/2026).
 *
 * Il percorso (pagina /admin/hr/[id]/contratto, raggiungibile anche dal link nel task ClickUp):
 *   1. modello e condizioni — suggeriti da mansione e residenza, compenso per lo staff
 *   2. documento d'identità — letto dall'allegato e confrontato con la scheda
 *   3. anteprima del PDF esatto che partirà
 *   4. invio in firma (Dropbox Sign) — solo se non manca niente; una differenza documento↔scheda
 *      va confermata esplicitamente
 *
 * La bozza (modello + condizioni) si salva CIFRATA: contiene condizioni economiche. Il
 * codice fiscale non entra mai nella bozza: si legge dalla scheda al momento del PDF.
 */
import { kv } from "@vercel/kv";
import { encryptHr, decryptHr, hrCryptoConfigured } from "./hr-crypto.js";
import { getPerson, readCf, savePerson, appendLog } from "./hr-people.js";
import { getIdDocument } from "./hr-id-document.js";
import { TEMPLATE_BY_ID, suggestTemplate, contractValues, fillTemplate, crossCheck, MANSIONE_LABEL, DEFAULT_DESCRIPTION } from "./contract-fill-core.js";
import { CONTRACT_TEMPLATES } from "./contract-templates.js";
import { renderContractPdf } from "./contract-pdf.js";
import { sendForSignature, getAccountInfo } from "./dropbox-sign.js";
import { registerSentContract } from "./hr-contracts.js";
import { roleToMansione } from "./hr-contracts-core.js";

const KEY = (id) => `hr:contract:draft:${id}`;
export const HOC_SIGNER = { email: "contact@houseofcreators.com", name: "H.O.C. Business Unit Superbia Management SA" };

export async function getDraft(personId) {
  const v = await kv.get(KEY(personId));
  if (!v || !hrCryptoConfigured()) return null;
  try { return JSON.parse(decryptHr(typeof v === "string" ? v : v.enc)); } catch { return null; }
}
export async function saveDraft(personId, draft, { actor } = {}) {
  if (!hrCryptoConfigured()) throw new Error("Chiave di cifratura assente: la bozza non si può salvare.");
  const prev = (await getDraft(personId)) || {};
  const next = { ...prev, ...draft, updatedAt: Date.now(), by: actor || null };
  if (draft.templateId && !TEMPLATE_BY_ID[draft.templateId]) throw new Error("Modello sconosciuto.");
  await kv.set(KEY(personId), encryptHr(JSON.stringify(next)), { ex: 365 * 24 * 3600 });
  return next;
}

/** Condizioni di partenza: mansione nel linguaggio del contratto, descrizione dai contratti firmati. */
function defaultTerms(fields, sug) {
  const m = MANSIONE_LABEL[sug.mansione] || sug.mansione || "";
  return { mansione: m, descrizione: DEFAULT_DESCRIPTION[m] || "", valuta: sug.lang === "en" ? "USD" : "EUR", importo: "", minimoGarantito: true, incentivi: true, dispositivi: "", compensoEn: "", email: fields.personalEmail || "", gender: fields.gender || "" };
}

/** Tutto quello che serve alla pagina. Nessun CF in chiaro nella risposta. */
export async function contractContext(personId) {
  const person = await getPerson(personId);
  if (!person) return null;
  const f = person.fields || {};
  const [draft, idDoc] = await Promise.all([getDraft(personId), getIdDocument(personId)]);
  const cf = readCf(person) || "";
  const sug = suggestTemplate(f);
  const templateId = draft?.templateId || sug.templateId;
  const lang = TEMPLATE_BY_ID[templateId].lang;
  const terms = { ...defaultTerms(f, { ...sug, lang }), ...(draft?.terms || {}) };
  const { missing } = contractValues({ fields: f, cf, idDoc: idDoc || {}, terms, lang, templateId });
  return {
    person: { id: person.id, name: `${f.firstName || ""} ${f.surname || ""}`.trim(), mansioni: f.mansioni || [], email: f.personalEmail || "", hasCf: Boolean(cf), clickupTaskId: person.clickupTaskId || null, archived: Boolean(person.archived) },
    suggestion: sug,
    templates: CONTRACT_TEMPLATES.map((t) => ({ id: t.id, label: t.label, lang: t.lang, kind: t.kind, source: t.source, fields: [...new Set((t.blocks.map((b) => b.x).join(" ").match(/\{\{([a-z_]+)\}\}/g) || []).map((x) => x.slice(2, -2)))] })),
    templateId, lang, terms,
    idDoc: idDoc ? { type: idDoc.type || "", number: idDoc.number || "", issuer: idDoc.issuer || "", expiry: idDoc.expiry || "", at: idDoc.at, via: idDoc.via, files: idDoc.files || [], notes: idDoc.read?.notes || "" } : null,
    checks: idDoc?.read ? crossCheck({ fields: f, cf, doc: idDoc.read }) : [],
    missing,
    sent: draft?.sent || null,
  };
}

/** PDF esatto (anteprima = ciò che parte). → { pdf, missing, title, tpl } */
export async function buildContractPdf(personId) {
  const person = await getPerson(personId);
  if (!person) return null;
  const f = person.fields || {};
  const ctx = await contractContext(personId);
  const idDoc = (await getIdDocument(personId)) || {};
  const tpl = TEMPLATE_BY_ID[ctx.templateId];
  const { values, missing } = contractValues({ fields: f, cf: readCf(person) || "", idDoc, terms: ctx.terms, lang: tpl.lang, templateId: tpl.id });
  const filled = fillTemplate(tpl, values);
  const role = tpl.kind === "operatore" ? (tpl.lang === "en" ? "Collaborator" : "Collaboratore") : ctx.terms.mansione || "";
  const title = `${tpl.lang === "en" ? "Contract" : "Contratto"} H.O.C. ${role} ${values.nome}`.replace(/\s+/g, " ").trim();
  const pdf = await renderContractPdf(filled.blocks, { title });
  return { pdf, missing: [...missing.map((m) => m.label), ...filled.missing], title, tpl, values, ctx };
}

/**
 * Invio in firma. `confirmMismatch` obbligatorio se il documento non coincide con la scheda.
 * `testMode` forzato se il piano non ha invii API reali (la risposta lo dice).
 */
export async function sendContract(personId, { actor, confirmMismatch = false, testMode = false } = {}) {
  const built = await buildContractPdf(personId);
  if (!built) return { ok: false, status: 404, error: "Persona non trovata." };
  const { pdf, missing, title, tpl, values, ctx } = built;
  if (ctx.person.archived) return { ok: false, status: 409, error: "Scheda archiviata." };
  if (missing.length) return { ok: false, status: 400, error: `Mancano dati: ${missing.join(", ")}.` };
  if (ctx.checks.some((c) => c.ok === false) && !confirmMismatch) return { ok: false, status: 409, error: "Il documento non coincide con la scheda: controlla e conferma prima di inviare.", needsConfirm: true };
  let left = null;
  try { left = (await getAccountInfo()).quotas?.api_signature_requests_left ?? null; } catch { /* si prova comunque */ }
  const forcedTest = !testMode && left === 0;
  const isTest = testMode || forcedTest;
  const lang = tpl.lang;
  const req = await sendForSignature({
    pdf, filename: `${title}.pdf`, title,
    subject: lang === "en" ? "Your contract with House of Creators" : "Il tuo contratto con House of Creators",
    message: lang === "en" ? "Hi, here is your contract with House of Creators: please read it and sign it here. Thank you!" : "Ciao, ecco il tuo contratto con House of Creators: leggilo e firmalo da qui. Grazie!",
    signers: [HOC_SIGNER, { email: values.email, name: values.nome }],
    testMode: isTest,
    metadata: { hoc_person_id: personId, hoc_template: tpl.id },
  });
  const crmMansione = tpl.kind === "operatore" ? "Chatter" : tpl.kind === "smm" ? "Social Media Manager" : roleToMansione(ctx.terms.mansione);
  await registerSentContract(req, personId, { kind: tpl.kind, role: tpl.kind === "operatore" ? "Operatore (chat)" : ctx.terms.mansione || null, mansione: crmMansione });
  const sent = { requestId: req.signature_request_id, at: Date.now(), testMode: isTest, by: actor, templateId: tpl.id };
  await saveDraft(personId, { sent }, { actor });
  await appendLog(personId, [{ at: sent.at, by: actor, source: "app", action: "contract_sent", field: "hvContractStatus", from: null, to: `${title}${isTest ? " (PROVA, non vincolante)" : ""}` }]);
  if (!isTest) await savePerson({ id: personId, input: { hvContractStatus: "Firma richiesta" }, allowed: ["hvContractStatus"], actor, source: "app" });
  return { ok: true, requestId: req.signature_request_id, testMode: isTest, forcedTest, title };
}
