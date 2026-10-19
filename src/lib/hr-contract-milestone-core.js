/**
 * Contratti da recuperare nello spazio Area Partner (18/10/2026) — parte pura, testabile.
 *
 * Nicholas: i contratti si fanno a mano (Dropbox Sign), niente più automazione che li legge e
 * li salva. Chi oggi non ha un contratto firmato deve COMPARIRE nel lavoro dell'Area Partner
 * finché non è risolto: un task «Contratti da recuperare» nella lista Milestone, con un
 * sottotask per persona. L'HR carica il PDF firmato sulla scheda del CRM e porta «Stato del
 * contratto» su «Firmato» → il sottotask va in «done» da solo.
 *
 * Regole:
 *  - serve un sottotask chi è nel CRM (non archiviato), non è in «Uscita», non ha lo stato
 *    «Firmato» e non è del Board;
 *  - si chiude (done) quando arriva «Firmato», o la persona esce, o la scheda va in archivio;
 *  - un sottotask chiuso da NOI si riapre come sottotask nuovo se il contratto torna non
 *    firmato (es. cambio di mansione → contratto nuovo); uno chiuso a mano dall'HR non lo
 *    sappiamo e non lo tocchiamo finché la scheda non arriva a «Firmato».
 */
import { fullName } from "./hr-people-core.js";
import { CONTRACT_STATUSES, findChoice } from "./hr-fields.js";

export const SIGNED = "Firmato";
export const EXITED = "Uscita";
export const DONE_STATUS = "done";
export const PARENT_NAME = "Contratti da recuperare";

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String);

/** La persona ha bisogno del sottotask? */
export function needsContract(p) {
  if (!p || p.archived) return false;
  const f = p.fields || {};
  if (f.collaborationStatus === EXITED) return false;
  if (f.hvContractStatus === SIGNED) return false;
  const roles = arr(f.mansioni);
  if (roles.length && roles.every((r) => /^board$/i.test(r))) return false;
  return true;
}

/** Nome del sottotask: «Nome Cognome · Mansione». */
export function subtaskName(p) {
  const f = p.fields || {};
  const roles = arr(f.mansioni);
  return `${fullName(f) || "Senza nome"}${roles.length ? ` · ${roles.join(", ")}` : ""}`;
}

export function subtaskDescription(p) {
  const f = p.fields || {};
  return [
    `Contratto da recuperare per ${fullName(f) || "questa persona"}.`,
    // il nome che l'Area Partner vede su ClickUp («Signature Requested»), non l'etichetta dell'app
    `HV Contract Status nel CRM: ${findChoice(CONTRACT_STATUSES, f.hvContractStatus)?.cu || f.hvContractStatus || "vuoto"}.`,
    p.clickupUrl ? `Scheda nel CRM: ${p.clickupUrl}` : null,
    "",
    "Quando il contratto è firmato: carica il PDF sulla scheda del CRM e porta «HV Contract Status» su «Signed». Questo sottotask va in done da solo.",
  ].filter((x) => x !== null).join("\n");
}

/** Impronta di nome + descrizione: se cambia (mansione, stato del contratto…) il sottotask aperto si riscrive. */
export function subtaskSig(p) {
  return `${subtaskName(p)}\n${subtaskDescription(p)}`;
}

/**
 * Cosa fare. `items` = { personId: { taskId, state: "open"|"done", sig } }.
 * @returns { create: person[], close: personId[], update: person[] }
 */
export function planMilestones(people, items = {}) {
  const create = [];
  const close = [];
  const update = [];
  const seen = new Set();
  for (const p of people || []) {
    seen.add(p.id);
    const it = items[p.id];
    const need = needsContract(p);
    if (need && (!it || it.state === "done")) create.push(p);
    if (!need && it && it.state === "open") close.push(p.id);
    // 19/10/2026: il sottotask aperto segue la scheda (es. mansione aggiunta dopo → «Nome · Chatter»)
    if (need && it && it.state === "open" && it.sig !== subtaskSig(p)) update.push(p);
  }
  // schede sparite dall'elenco (archiviate e non più restituite): il sottotask si chiude
  for (const [pid, it] of Object.entries(items)) if (!seen.has(pid) && it?.state === "open") close.push(pid);
  return { create, close, update };
}
