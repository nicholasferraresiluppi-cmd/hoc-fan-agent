// Unit test — social-proxies-core + social-proxy-crypto. Esegui: node tests/social-proxies.mjs
import assert from "node:assert/strict";

// Chiave di test iniettata PRIMA dell'import (il modulo legge process.env a ogni chiamata,
// ma la impostiamo comunque a livello di processo per coerenza con l'uso reale).
process.env.SOCIAL_PROXY_ENCRYPTION_KEY =
  "0".repeat(63) + "1"; // 64 char hex valido, solo per test

import {
  validateProxyInput,
  pickLeastLoadedProxy,
  computeProxyStats,
} from "../src/lib/social-proxies-core.js";
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
} from "../src/lib/social-proxy-crypto.js";

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  n++;
};

// ── validateProxyInput ──────────────────────────────────────────────────────
ok(!validateProxyInput({}).ok, "input vuoto → invalido");
ok(
  validateProxyInput({ host: "", port: 1080, type: "socks5" }).errors.includes(
    "host richiesto"
  ),
  "host vuoto → errore esplicito"
);
ok(
  !validateProxyInput({ host: "1.2.3.4", port: 0, type: "socks5" }).ok,
  "porta 0 → invalida"
);
ok(
  !validateProxyInput({ host: "1.2.3.4", port: 70000, type: "socks5" }).ok,
  "porta fuori range → invalida"
);
ok(
  !validateProxyInput({ host: "1.2.3.4", port: 1080, type: "ftp" }).ok,
  "type non supportato → invalido"
);
ok(
  validateProxyInput({ host: "1.2.3.4", port: 1080, type: "socks5" }).ok,
  "input minimo valido → ok"
);
ok(
  validateProxyInput({ host: "1.2.3.4", port: 8080, type: "http", username: "u", password: "p" }).ok,
  "http con credenziali → ok"
);

// ── pickLeastLoadedProxy ─────────────────────────────────────────────────────
eq(pickLeastLoadedProxy([]), null, "nessun proxy → null");
eq(
  pickLeastLoadedProxy([{ id: "a", status: "inactive", createdAt: 1 }]),
  null,
  "solo proxy inattivi → null"
);
eq(
  pickLeastLoadedProxy([
    { id: "a", status: "active", createdAt: 1 },
    { id: "b", status: "active", createdAt: 2 },
  ]),
  "a",
  "nessun conteggio → sceglie il primo (entrambi a 0, tie-break su createdAt)"
);
eq(
  pickLeastLoadedProxy(
    [
      { id: "a", status: "active", createdAt: 1 },
      { id: "b", status: "active", createdAt: 2 },
    ],
    { a: 5, b: 1 }
  ),
  "b",
  "sceglie il meno carico"
);
eq(
  pickLeastLoadedProxy(
    [
      { id: "a", status: "active", createdAt: 2 },
      { id: "b", status: "active", createdAt: 1 },
      { id: "c", status: "error", createdAt: 0 },
    ],
    { a: 3, b: 3, c: 0 }
  ),
  "b",
  "pareggio tra attivi → il più vecchio (ignora il proxy in errore anche se a 0 account)"
);

// ── computeProxyStats ────────────────────────────────────────────────────────
const stats = computeProxyStats([
  { status: "active", provider: "coronium" },
  { status: "active", provider: "coronium" },
  { status: "inactive", provider: "nsocks" },
  { status: "error", provider: null },
]);
eq(stats.total, 4, "totale corretto");
eq(stats.active, 2, "conteggio active corretto");
eq(stats.inactive, 1, "conteggio inactive corretto");
eq(stats.error, 1, "conteggio error corretto");
eq(stats.byProvider, { coronium: 2, nsocks: 1, altro: 1 }, "raggruppamento per provider (null → altro)");

// ── encryptSecret / decryptSecret / maskSecret ──────────────────────────────
const secret = "super-secret-password-123";
const enc = encryptSecret(secret);
ok(enc !== secret, "il ciphertext non è il plaintext");
eq(decryptSecret(enc), secret, "roundtrip encrypt→decrypt preserva il valore");
eq(maskSecret(secret), "••••••••-123", "maskSecret mostra solo le ultime 4 char");
eq(maskSecret("ab"), "••••••••", "stringa troppo corta → nessuna char esposta");
assert.throws(() => encryptSecret(""), "encryptSecret rifiuta stringa vuota");
assert.throws(() => decryptSecret(""), "decryptSecret rifiuta stringa vuota");
n += 6;

console.log(`✓ social-proxies: ${n} asserzioni passate`);
