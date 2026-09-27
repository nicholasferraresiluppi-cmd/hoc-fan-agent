import crypto from "node:crypto";

// AES-256-GCM encrypt/decrypt per le password dei proxy social (SOCKS5/HTTP).
// Stesso schema di content-pipeline/crypto.js (bot token Telegram), chiave
// dedicata per isolamento tra domini.
// Chiave da env SOCIAL_PROXY_ENCRYPTION_KEY (32 byte hex = 64 caratteri).
// Genera con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Formato ciphertext: base64(iv | authTag | ciphertext)
//   - IV: 12 byte random
//   - authTag: 16 byte

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const hex = process.env.SOCIAL_PROXY_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "SOCIAL_PROXY_ENCRYPTION_KEY missing or not 32 bytes hex (64 chars)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext) {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext must be a non-empty string");
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(b64) {
  if (typeof b64 !== "string" || b64.length === 0) {
    throw new Error("decryptSecret: ciphertext must be a non-empty string");
  }
  const key = getKey();
  const buf = Buffer.from(b64, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("decryptSecret: ciphertext too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const dec = crypto.createDecipheriv(ALGO, key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
}

export function maskSecret(plaintext) {
  if (typeof plaintext !== "string" || plaintext.length < 4) return "••••••••";
  return "••••••••" + plaintext.slice(-4);
}
