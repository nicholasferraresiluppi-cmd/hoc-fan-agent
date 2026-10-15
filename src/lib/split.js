/**
 * Conto dello split — archivio (15/10/2026). Logica in split-core.js.
 *
 * KV CIFRATO con la chiave della contabilità (stesso accesso: titolari + chi ha
 * l'accesso contabilità; gli admin no):
 *  - acct:split:config        { rev, teams, people, updatedAt, updatedBy }  — accordi, valgono finché non si cambiano
 *  - acct:split:months        set dei mesi (in chiaro, solo "YYYY-MM")
 *  - acct:split:month:{m}     { month, rev, fx, teams:{[teamId]:{revenueUsd, chatterUsd, …}}, extras, note }
 * `rev` cresce a ogni salvataggio: chi salva con un rev vecchio riceve un conflitto.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { sealJson, openJson } from "@/lib/compensi-crypto";
import { ConflictError } from "@/lib/compensi";
import { isMonthId } from "@/lib/compensi-core";
import { sanitizeConfig, sanitizeMonthInput } from "@/lib/split-core";

const P = process.env.ACCOUNTING_KV_PREFIX || "acct"; // vedi compensi.js
const K = {
  config: `${P}:split:config`,
  months: `${P}:split:months`,
  month: (m) => `${P}:split:month:${m}`,
};
export const newSplitId = () => "s_" + randomBytes(6).toString("hex");

export async function getSplitConfig() {
  const raw = await kv.get(K.config);
  return raw ? openJson(raw, K.config) : { rev: 0, teams: [], people: [] };
}

export async function saveSplitConfig(input, { by, expectRev = null }) {
  const cur = await getSplitConfig();
  if (expectRev !== null && Number(expectRev) !== Number(cur.rev || 0)) throw new ConflictError("Qualcun altro ha salvato gli accordi nel frattempo: ricarica la pagina.");
  const doc = { rev: (cur.rev || 0) + 1, ...sanitizeConfig(input, newSplitId), updatedAt: Date.now(), updatedBy: by || null };
  await kv.set(K.config, sealJson(doc, K.config));
  return doc;
}

export async function listSplitMonths() {
  return ((await kv.smembers(K.months)) || []).filter(isMonthId).sort().reverse();
}

export async function getSplitMonth(m) {
  if (!isMonthId(m)) return null;
  const raw = await kv.get(K.month(m));
  return raw ? openJson(raw, K.month(m)) : null;
}

export async function saveSplitMonth(m, input, { by, expectRev = null }) {
  if (!isMonthId(m)) throw new Error("mese non valido");
  const cur = await getSplitMonth(m);
  if (cur && expectRev !== null && Number(expectRev) !== Number(cur.rev || 0)) throw new ConflictError("Qualcun altro ha salvato questo mese nel frattempo: ricarica la pagina.");
  const doc = { month: m, rev: (cur?.rev || 0) + 1, ...sanitizeMonthInput(input, newSplitId), createdAt: cur?.createdAt || Date.now(), updatedAt: Date.now(), updatedBy: by || null };
  await kv.set(K.month(m), sealJson(doc, K.month(m)));
  await kv.sadd(K.months, m);
  return doc;
}

/** Nuovo mese: revenue, chatter ed extra da rifare; il cambio si propone dal mese prima. */
export async function createSplitMonth(m, { by }) {
  if (await getSplitMonth(m)) throw new Error("Questo mese esiste già.");
  return saveSplitMonth(m, { fx: { rate: null }, teams: {}, extras: [] }, { by });
}

export async function deleteSplitMonth(m) {
  if (!isMonthId(m)) throw new Error("mese non valido");
  await kv.del(K.month(m));
  await kv.srem(K.months, m);
}
