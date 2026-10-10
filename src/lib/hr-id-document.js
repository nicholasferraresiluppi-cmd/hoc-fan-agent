/**
 * Lettura del documento d'identità per il contratto (10/10/2026).
 *
 * Richiesta di Nicholas: i dati del documento che servono al contratto (tipo, numero,
 * rilasciato da, scadenza) non li deve ricopiare nessuno — si leggono dal documento che
 * la persona ha caricato col modulo (sta allegato al suo task ClickUp), e si controlla che
 * combacino con la scheda (nome, cognome, data di nascita, codice fiscale).
 *
 * - Si legge SOLO su richiesta (pulsante "Leggi dal documento"), mai in automatico:
 *   ogni lettura è una chiamata all'AI (~3 centesimi) e manda le immagini del documento
 *   al fornitore del modello.
 * - Il risultato si salva CIFRATO (stessa chiave del codice fiscale) e scade dopo 120 giorni:
 *   serve per preparare il contratto, non è un archivio di documenti.
 * - Il confronto con la scheda è informativo: un "non coincide" lo vede chi prepara il
 *   contratto, che decide (il documento può avere un secondo nome, la scheda un refuso).
 */
import Anthropic from "@anthropic-ai/sdk";
import { kv } from "@vercel/kv";
import { getTask, downloadAttachment } from "./clickup-hr-api.js";
import { encryptHr, decryptHr, hrCryptoConfigured } from "./hr-crypto.js";
import { appendLog } from "./hr-people.js";

const KEY = (id) => `hr:iddoc:${id}`;
const TTL_S = 120 * 24 * 3600;
const MODEL = () => process.env.HR_ID_MODEL || "claude-opus-5";
const IMAGE_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    readable: { type: "boolean", description: "true se si vede un documento d'identità leggibile" },
    documentType: { type: "string", description: "come si scrive in un contratto italiano: \"carta di identità\", \"carta d'identità elettronica\", \"passaporto\", \"patente di guida\", \"permesso di soggiorno\"; per documenti esteri il nome in inglese (es. \"passport\", \"national ID card\")" },
    number: { type: "string", description: "numero del documento esattamente come stampato" },
    issuer: { type: "string", description: "chi l'ha rilasciato, nella forma usata nei contratti: \"comune di Modena\", \"Ministero dell'Interno\", \"Questura di Roma\", \"Motorizzazione Civile\"; per esteri l'autorità come scritta" },
    issueDate: { type: "string", description: "data di rilascio YYYY-MM-DD o stringa vuota" },
    expiry: { type: "string", description: "data di scadenza YYYY-MM-DD o stringa vuota" },
    firstName: { type: "string" },
    surname: { type: "string" },
    dateOfBirth: { type: "string", description: "YYYY-MM-DD o stringa vuota" },
    placeOfBirth: { type: "string" },
    taxCode: { type: "string", description: "codice fiscale se stampato sul documento, altrimenti stringa vuota" },
    nationality: { type: "string" },
    notes: { type: "string", description: "problemi di lettura (foto sfocata, solo retro, documento scaduto…), altrimenti stringa vuota" },
  },
  required: ["readable", "documentType", "number", "issuer", "issueDate", "expiry", "firstName", "surname", "dateOfBirth", "placeOfBirth", "taxCode", "nationality", "notes"],
};

/** Allegati del task che sono il documento d'identità (fronte/retro), i più recenti. */
export async function listIdAttachments(taskId) {
  const task = await getTask(taskId);
  const all = task?.attachments || [];
  const isDoc = (a) => /^documento d/i.test(String(a.title || "").replace(/['’]/g, ""));
  return all.filter(isDoc).sort((a, b) => Number(b.date || 0) - Number(a.date || 0)).slice(0, 3);
}

export async function getIdDocument(personId) {
  const v = await kv.get(KEY(personId));
  if (!v || !hrCryptoConfigured()) return null;
  try { return JSON.parse(decryptHr(typeof v === "string" ? v : v.enc)); } catch { return null; }
}

/** Correzione a mano (chi prepara il contratto vede un dato letto male). */
export async function saveIdDocument(personId, data, { actor, via = "a mano" } = {}) {
  if (!hrCryptoConfigured()) throw new Error("Chiave di cifratura assente: i dati del documento non si possono salvare.");
  const rec = { ...data, at: Date.now(), via };
  await kv.set(KEY(personId), encryptHr(JSON.stringify(rec)), { ex: TTL_S });
  await appendLog(personId, [{ at: rec.at, by: actor, source: "app", action: "id_document", field: "idDocument", from: null, to: via === "a mano" ? "dati del documento corretti a mano" : "dati letti dal documento" }]).catch(() => {});
  return rec;
}

/**
 * Legge il documento dagli allegati del task ClickUp. → { ok, data?, files, error? }
 */
export async function readIdDocument(person, { actor } = {}) {
  if (!person?.clickupTaskId) return { ok: false, error: "La scheda non ha ancora un task su ClickUp: il documento non è raggiungibile." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Chiave dell'AI non configurata." };
  const atts = await listIdAttachments(person.clickupTaskId);
  if (!atts.length) return { ok: false, error: "Sul task ClickUp non c'è nessun allegato «Documento d'identità»: la persona deve caricarlo dal modulo." };
  const content = [];
  const files = [];
  for (const a of atts) {
    const ext = String(a.extension || a.title?.split(".").pop() || "").toLowerCase();
    if (!IMAGE_TYPES[ext] && ext !== "pdf") { files.push({ title: a.title, skipped: `formato ${ext || "sconosciuto"} non leggibile` }); continue; }
    const { bytes } = await downloadAttachment(a.url);
    const data = bytes.toString("base64");
    content.push(ext === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: IMAGE_TYPES[ext], data } });
    files.push({ title: a.title });
  }
  if (!content.length) return { ok: false, files, error: "Il documento caricato è in un formato che non si legge (es. HEIC): chiedi una foto JPG o un PDF." };
  content.push({ type: "text", text: "Queste immagini sono fronte e/o retro del documento d'identità di un collaboratore, caricate da lui per il suo contratto. Trascrivi i dati del documento nello schema. Scrivi solo ciò che leggi: se un dato non si legge lascia la stringa vuota, non dedurlo." });

  const client = new Anthropic();
  let res;
  try {
    res = await client.messages.create({
      model: MODEL(),
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    // messaggi in italiano per chi prepara il contratto (il testo grezzo dell'API non dice cosa fare)
    const msg = String(e?.message || "");
    if (/credit balance/i.test(msg)) return { ok: false, files, error: "Il credito dell'AI (account Anthropic) è esaurito: va ricaricato. Nel frattempo inserisci i dati del documento a mano qui sotto." };
    if (e?.status === 429 || e?.status >= 500) return { ok: false, files, error: "L'AI non risponde in questo momento: riprova tra poco o inserisci i dati a mano." };
    return { ok: false, files, error: `Lettura non riuscita (${msg.slice(0, 120)}): inserisci i dati a mano.` };
  }
  if (res.stop_reason === "refusal") return { ok: false, files, error: "L'AI non ha letto il documento: inserisci i dati a mano." };
  const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, files, error: "Risposta dell'AI non leggibile: riprova o inserisci i dati a mano." }; }
  const rec = await saveIdDocument(person.id, { type: data.documentType, number: data.number, issuer: data.issuer, issueDate: data.issueDate, expiry: data.expiry, read: data, files: files.map((f) => f.title) }, { actor, via: "letto dal documento" });
  return { ok: true, data: rec, files };
}
