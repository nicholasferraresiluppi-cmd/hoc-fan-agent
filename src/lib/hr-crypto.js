import crypto from "node:crypto";

// AES-256-GCM per il codice fiscale del Centro HR (29/09/2026).
// Clone del pattern di social-proxy-crypto.js (a sua volta di
// content-pipeline/crypto.js), con chiave DEDICATA HR_ENCRYPTION_KEY: un
// dominio compromesso non apre gli altri.
// Chiave: 32 byte hex = 64 caratteri.
// Genera con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Formato ciphertext: base64(iv | authTag | ciphertext) — IV 12 byte, tag 16.
// Senza chiave NON si fallisce tutto: hrCryptoConfigured() è false, il CF non
// si salva e la UI lo dice (vedi hr-people.js).

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function hrCryptoConfigured() {
  const hex = process.env.HR_ENCRYPTION_KEY;
  return Boolean(hex && hex.length === 64 && /^[0-9a-f]+$/i.test(hex));
}

function getKey() {
  if (!hrCryptoConfigured()) throw new Error("HR_ENCRYPTION_KEY mancante o non di 32 byte hex (64 caratteri)");
  return Buffer.from(process.env.HR_ENCRYPTION_KEY, "hex");
}

export function encryptHr(plaintext) {
  if (typeof plaintext !== "string" || plaintext.length === 0) throw new Error("encryptHr: testo vuoto");
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptHr(b64) {
  if (typeof b64 !== "string" || b64.length === 0) throw new Error("decryptHr: cifrato vuoto");
  const key = getKey();
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error("decryptHr: cifrato troppo corto");
  const dec = crypto.createDecipheriv(ALGO, key, buf.subarray(0, IV_LEN));
  dec.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([dec.update(buf.subarray(IV_LEN + TAG_LEN)), dec.final()]).toString("utf8");
}
