// Doppioni nel warehouse (15/10/2026) — lo scudo di HOC Pro. Logica e regole in warehouse-duplicates-core.js.
//
// - refreshDuplicates(): ricalcola le coppie dal warehouse (query piccola: solo i record con account condiviso) e
//   aggiorna la mappa delle sostituzioni, APPICCICOSA. Gira ogni notte dal check "warehouse-duplicates" (ops-alerts).
// - getSubstitutions() / dedupeCreatorIds(): applicano lo scudo dove HOC Pro mette insieme più creator
//   (liste degli split, media HOC AVG, Difficoltà creator). Leggono SOLO KV, mai BigQuery.
//
// Le analisi per turno (operator-signals, academy-signals, …) non si toccano: ogni turno appartiene a un solo record,
// lì il doppione non raddoppia niente (e i turni CP di Atena e Marta Bellini sono agganciati proprio al record nuovo).
//
// KV: warehouse:duplicates = { at, pairs, subs: {idDoppione: idDaTenere} }

import { kv } from "@vercel/kv";
import { bqQuery, bqProjects } from "@/lib/bigquery-api";
import { duplicatesSql, classifyDuplicates, mergeSubstitutions, dedupeIds } from "@/lib/warehouse-duplicates-core";

const KEY = "warehouse:duplicates";
const MEM_TTL = 5 * 60 * 1000;
let mem = null; // { at, subs } — evita una lettura KV per ogni query nella stessa istanza

export async function getDuplicateReport() {
  return (await kv.get(KEY).catch(() => null)) || { at: null, pairs: [], subs: {} };
}

export async function getSubstitutions() {
  if (mem && Date.now() - mem.loaded < MEM_TTL) return mem.subs;
  const rep = await getDuplicateReport();
  mem = { loaded: Date.now(), subs: rep.subs || {} };
  return mem.subs;
}

/** Id con i doppioni sostituiti dal record da tenere (ordine mantenuto, niente ripetizioni). */
export async function dedupeCreatorIds(ids) {
  return dedupeIds(ids, await getSubstitutions().catch(() => ({})));
}

/** Gli id doppione (da escludere dove si sommano tutte le creator dell'agenzia). */
export async function duplicateIds() {
  return Object.keys(await getSubstitutions().catch(() => ({}))).map(Number);
}

export async function refreshDuplicates() {
  const { dataProject } = bqProjects();
  const refs = { creators: `${dataProject}.postgres.public_creators`, attributed: `${dataProject}.onlyfans.attributed_transactions` };
  const { rows } = await bqQuery(duplicatesSql(refs));
  const pairs = classifyDuplicates(rows);
  const prev = await getDuplicateReport();
  const out = { at: Date.now(), pairs, subs: mergeSubstitutions(prev.subs, pairs) };
  await kv.set(KEY, out);
  mem = { loaded: Date.now(), subs: out.subs };
  return out;
}
