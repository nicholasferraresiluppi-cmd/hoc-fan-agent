// node tests/ofapi-webhook.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyOfapiSignature, webhookEventRow } from "../src/lib/ofapi-webhook-core.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const secret = "s3greto-lungo-e-casuale";
const raw = '{"event":"messages.received","account_id":"acct_1","payload":{"id":5,"text":"ciao"}}';
const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");

ok(verifyOfapiSignature(raw, sig, secret), "firma giusta accettata");
ok(verifyOfapiSignature(raw, sig.toUpperCase(), secret), "esadecimale maiuscolo accettato");
ok(!verifyOfapiSignature(raw + " ", sig, secret), "corpo alterato di un byte rifiutato");
ok(!verifyOfapiSignature(raw, sig, "altro-segreto"), "segreto sbagliato rifiutato");
ok(!verifyOfapiSignature(raw, null, secret), "senza firma rifiutato");
ok(!verifyOfapiSignature(raw, sig, ""), "senza segreto configurato rifiuta tutto");
ok(!verifyOfapiSignature(raw, "abc", secret), "firma di lunghezza diversa rifiutata senza eccezioni");

const row = webhookEventRow(JSON.parse(raw), { idempotencyKey: "evt_1", receivedAt: new Date("2026-10-09T20:00:00Z") });
ok(row.event === "messages.received" && row.account_id === "acct_1", "evento e account");
ok(row.idempotency_key === "evt_1" && row.received_at === "2026-10-09T20:00:00.000Z", "chiave e orario");
ok(JSON.parse(row.payload).text === "ciao", "payload salvato intero");
ok(webhookEventRow({}).event === "unknown" && webhookEventRow({}).account_id === null, "corpo vuoto non rompe");

console.log(`ofapi-webhook: ${n} asserzioni ok`);
