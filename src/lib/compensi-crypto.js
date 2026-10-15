import crypto from "node:crypto";

// AES-256-GCM per la Contabilità (15/10/2026). Stesso pattern di hr-crypto.js
// con chiave DEDICATA ACCOUNTING_ENCRYPTION_KEY: qui si cifra il documento
// INTERO (compensi, IBAN, indirizzi), non un campo. Chi ha accesso al KV — o a
// una route admin che lo legge — vede solo testo cifrato.
// Chiave: 32 byte hex = 64 caratteri.
// Senza chiave la sezione NON parte (fail closed): niente salvataggi in chiaro.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function accountingCryptoConfigured() {
  const hex = process.env.ACCOUNTING_ENCRYPTION_KEY;
  return Boolean(hex && hex.length === 64 && /^[0-9a-f]+$/i.test(hex));
}

function getKey() {
  if (!accountingCryptoConfigured()) throw new Error("ACCOUNTING_ENCRYPTION_KEY mancante o non di 32 byte hex (64 caratteri)");
  return Buffer.from(process.env.ACCOUNTING_ENCRYPTION_KEY, "hex");
}

/** Oggetto → stringa cifrata (base64 iv|tag|ct). `aad` lega il cifrato alla sua chiave KV (non si può spostare un documento su un altro mese). */
export function sealJson(obj, aad = "") {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function openJson(sealed, aad = "") {
  if (typeof sealed !== "string" || !sealed.startsWith("v1:")) throw new Error("documento contabilità non cifrato o di formato sconosciuto");
  const buf = Buffer.from(sealed.slice(3), "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error("cifrato troppo corto");
  const dec = crypto.createDecipheriv(ALGO, getKey(), buf.subarray(0, IV_LEN));
  if (aad) dec.setAAD(Buffer.from(aad));
  dec.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return JSON.parse(Buffer.concat([dec.update(buf.subarray(IV_LEN + TAG_LEN)), dec.final()]).toString("utf8"));
}
