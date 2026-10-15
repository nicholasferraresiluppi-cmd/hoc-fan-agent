/**
 * Compensi team — archivio (15/10/2026). Logica di calcolo in compensi-core.js,
 * accesso in compensi-access.js.
 *
 * KV (tutto CIFRATO con ACCOUNTING_ENCRYPTION_KEY, legato alla sua chiave):
 *  - acct:months            set dei mesi presenti ("2026-09"); l'unica cosa in chiaro
 *  - acct:month:{YYYY-MM}   { month, rev, fx:{rate,source}, revenues:[{name,usd}], lines:[…], updatedAt, updatedBy }
 *  - acct:payees            { byKey: { [personKey]: { person, address, zip, city, accounts:[{label,iban,bic}], note } } }
 * `rev` cresce a ogni salvataggio: chi salva con un rev vecchio riceve un conflitto
 * invece di sovrascrivere il lavoro di un altro.
 */
import { kv } from "@vercel/kv";
import { randomBytes } from "node:crypto";
import { sealJson, openJson } from "@/lib/compensi-crypto";
import { isMonthId, cloneForNextMonth, sanitizeLine, sanitizeRevenues, personKey, toNumber } from "@/lib/compensi-core";

// ACCOUNTING_KV_PREFIX: il KV è lo stesso tra produzione e sviluppo locale → in locale si usa
// un prefisso diverso ("acct-dev") e una chiave diversa, così una prova non tocca i dati veri.
const P = process.env.ACCOUNTING_KV_PREFIX || "acct";
const K = {
  months: `${P}:months`,
  month: (m) => `${P}:month:${m}`,
  payees: `${P}:payees`,
};

export const newLineId = () => "l_" + randomBytes(6).toString("hex");

export async function listMonths() {
  const ms = (await kv.smembers(K.months)) || [];
  return ms.filter(isMonthId).sort().reverse();
}

export async function getMonth(m) {
  if (!isMonthId(m)) return null;
  const raw = await kv.get(K.month(m));
  return raw ? openJson(raw, K.month(m)) : null;
}

export class ConflictError extends Error {}

export async function saveMonth(m, input, { by, expectRev = null } = {}) {
  if (!isMonthId(m)) throw new Error("mese non valido");
  const cur = await getMonth(m);
  if (cur && expectRev !== null && Number(expectRev) !== Number(cur.rev || 0)) {
    throw new ConflictError("Qualcun altro ha salvato questo mese nel frattempo: ricarica la pagina.");
  }
  const rate = input?.fx?.rate === null || input?.fx?.rate === "" || input?.fx?.rate === undefined ? null : toNumber(input.fx.rate);
  const doc = {
    month: m,
    rev: (cur?.rev || 0) + 1,
    fx: { rate: rate && rate > 0 && rate < 5 ? rate : null, source: String(input?.fx?.source || "").slice(0, 120) || null },
    revenues: sanitizeRevenues(input?.revenues),
    lines: (Array.isArray(input?.lines) ? input.lines : []).slice(0, 500).map((l) => sanitizeLine(l, newLineId)),
    clonedFrom: input?.clonedFrom ?? cur?.clonedFrom ?? null,
    importedFrom: input?.importedFrom ?? cur?.importedFrom ?? null,
    createdAt: cur?.createdAt || Date.now(),
    updatedAt: Date.now(),
    updatedBy: by || null,
  };
  await kv.set(K.month(m), sealJson(doc, K.month(m)));
  await kv.sadd(K.months, m);
  return doc;
}

/** Nuovo mese copiando il precedente (righe e regole; pagato/extra/revenue/tasso da rifare). */
export async function createMonthFrom(newMonth, fromMonth, { by }) {
  if (!isMonthId(newMonth)) throw new Error("mese non valido");
  if (await getMonth(newMonth)) throw new Error("Questo mese esiste già.");
  const src = fromMonth ? await getMonth(fromMonth) : null;
  const doc = src ? cloneForNextMonth(src, newMonth, newLineId) : { month: newMonth, fx: { rate: null }, revenues: [], lines: [] };
  return saveMonth(newMonth, doc, { by });
}

export async function deleteMonth(m) {
  if (!isMonthId(m)) throw new Error("mese non valido");
  await kv.del(K.month(m));
  await kv.srem(K.months, m);
}

// ── Dati di pagamento (IBAN, indirizzo) — uno per persona, valgono per tutti i mesi ──

export async function getPayees() {
  const raw = await kv.get(K.payees);
  return raw ? openJson(raw, K.payees) : { byKey: {} };
}

const clean = (v, max = 160) => String(v ?? "").slice(0, max).trim();
export const normalizeIban = (v) => clean(v, 60).replace(/\s+/g, "").toUpperCase();

export async function savePayee(person, input, { by }) {
  const key = personKey(person);
  if (!key) throw new Error("persona mancante");
  const all = await getPayees();
  all.byKey[key] = {
    person: clean(person, 120),
    address: clean(input?.address), zip: clean(input?.zip, 20), city: clean(input?.city, 80),
    invoice: Boolean(input?.invoice),
    accounts: (Array.isArray(input?.accounts) ? input.accounts : []).slice(0, 5)
      .map((a) => ({ label: clean(a?.label, 60), iban: normalizeIban(a?.iban), bic: clean(a?.bic, 20).toUpperCase(), share: clean(a?.share, 20) }))
      .filter((a) => a.label || a.iban),
    note: clean(input?.note, 500),
    updatedAt: Date.now(), updatedBy: by || null,
  };
  await kv.set(K.payees, sealJson(all, K.payees));
  return all.byKey[key];
}

export async function replacePayees(byKey) {
  await kv.set(K.payees, sealJson({ byKey }, K.payees));
}

/** IBAN mascherato per le viste d'insieme: IT32 •••• 9880. */
export function maskIban(iban) {
  const s = normalizeIban(iban);
  if (s.length < 8) return s ? "••••" : "";
  return `${s.slice(0, 4)} •••• ${s.slice(-4)}`;
}
