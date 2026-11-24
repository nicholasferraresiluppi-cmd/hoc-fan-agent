/**
 * Foglio «Anagrafica Operatori» ← CRM persone (17/11/2026): aggiunge in fondo al foglio le
 * persone del CRM che non ci sono. Regole e motivi in hr-anagrafica-sheet-core.js.
 *
 * Si muove: subito dopo l'invio del modulo (solo quella persona) e ogni notte dal dispatcher
 * (tutte: recupera anche chi è arrivato da ClickUp o un giro andato storto).
 * Il foglio va condiviso come editor con l'email del service account (sheetsEmail()).
 */
import { kv } from "@vercel/kv";
import { getValues, appendRows, sheetsConfigured, sheetsEmail } from "./google-sheets.js";
import { listPeople, getPerson, readCf } from "./hr-people.js";
import { getIdDocument } from "./hr-id-document.js";
import { planSheetAppend, personToRow, headerMismatch, SHEET_COLUMNS } from "./hr-anagrafica-sheet-core.js";

// Il foglio dell'Area Partner (Drive condiviso). Non è un segreto: l'override serve per le prove.
const DEFAULT_SHEET_ID = "1yoKDYrmdCMFVievM3Yy8Uu2lho7XOkXudmbAec_Px3E";
const TAB = "Form responses";
const K = {
  written: "hr:anagrafica-sheet:written", // SET degli id già aggiunti (una volta sola per persona)
  lock: "hr:anagrafica-sheet:lock",
  last: "hr:anagrafica-sheet:last",
};

export const anagraficaSheetId = () => process.env.HR_ANAGRAFICA_SHEET_ID || DEFAULT_SHEET_ID;
export const anagraficaSheetUrl = () => `https://docs.google.com/spreadsheets/d/${anagraficaSheetId()}/edit`;
const colLetter = (n) => String.fromCharCode(64 + n); // 17 colonne → "Q"

/**
 * @param opts.onlyIds  solo queste schede (dopo l'invio del modulo)
 * @param opts.dryRun   calcola e restituisce i nomi, non scrive niente
 */
export async function syncAnagraficaSheet({ onlyIds = null, dryRun = false } = {}) {
  if (!sheetsConfigured()) return { ok: false, reason: "service account Google non configurato" };
  const got = dryRun ? "OK" : await kv.set(K.lock, Date.now(), { nx: true, ex: 60 }).catch(() => "OK");
  if (!got) return { ok: false, reason: "un altro giro è in corso" };
  try {
    const sheetId = anagraficaSheetId();
    const last = colLetter(SHEET_COLUMNS.length);
    // una colonna oltre l'ultima: se qualcuno ne aggiunge una in fondo ce ne accorgiamo
    const all = await getValues(sheetId, `'${TAB}'!A1:${colLetter(SHEET_COLUMNS.length + 1)}`);
    const bad = headerMismatch(all[0] || []);
    if (bad) throw new Error(`Le colonne del foglio sono cambiate (${bad}): non scrivo niente`);
    const rows = all.slice(1);
    const people = onlyIds ? (await Promise.all(onlyIds.map((id) => getPerson(id)))).filter(Boolean) : await listPeople({ archived: "include" });
    const written = new Set((await kv.smembers(K.written).catch(() => [])) || []);
    const cfById = {};
    for (const p of people) { const cf = readCf(p); if (cf) cfById[p.id] = cf; }
    const plan = planSheetAppend({ people, sheetRows: rows, alreadyWritten: written, cfById, onlyIds });

    const toAdd = [];
    for (const p of plan.add) {
      const idDoc = await getIdDocument(p.id).catch(() => null);
      toAdd.push({ p, row: personToRow(p, { cf: cfById[p.id] || null, idDoc }) });
    }
    const names = toAdd.map(({ p }) => `${p.fields.firstName} ${p.fields.surname}`.trim());
    if (dryRun || !toAdd.length) {
      return { ok: true, dryRun, added: 0, wouldAdd: names, present: plan.present.length, skipped: plan.skipped.length };
    }
    const res = await appendRows(sheetId, `'${TAB}'!A:${last}`, toAdd.map((x) => x.row));
    await kv.sadd(K.written, ...toAdd.map(({ p }) => p.id));
    const out = { ok: true, added: toAdd.length, names, present: plan.present.length, skipped: plan.skipped.length, range: res.range };
    await kv.set(K.last, { at: Date.now(), added: out.added, names, present: out.present }, { ex: 90 * 24 * 3600 }).catch(() => {});
    return out;
  } catch (e) {
    const msg = e?.message || "errore";
    await kv.set(K.last, { at: Date.now(), error: msg }, { ex: 90 * 24 * 3600 }).catch(() => {});
    return { ok: false, reason: msg, shareWith: sheetsEmail() };
  } finally {
    if (!dryRun) await kv.del(K.lock).catch(() => {});
  }
}

export async function anagraficaSheetStatus() {
  return { sheetUrl: anagraficaSheetUrl(), shareWith: sheetsEmail(), last: (await kv.get(K.last).catch(() => null)) || null };
}
