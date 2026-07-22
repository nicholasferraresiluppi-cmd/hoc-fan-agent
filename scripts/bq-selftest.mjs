#!/usr/bin/env node
// Collaudo del connettore BigQuery — SOLO LETTURA, non scrive né modifica nulla.
// Dice esattamente a che punto siamo: chiave valida? fatturazione ok? Mattia ha dato la lettura?
//
// Uso:
//   node scripts/bq-selftest.mjs <path-della-chiave.json> [billingProject] [dataProject] [location]
// Esempio:
//   node scripts/bq-selftest.mjs ~/Downloads/hoc-pro-xxxxxxxx.json
//
// Default: billingProject=hoc-pro  dataProject=house-of-creators-358213  location=europe-west3

import fs from "node:fs";
import crypto from "node:crypto";

const [
  keyPath,
  BILLING = "hoc-pro",
  DATA = "house-of-creators-358213",
  LOCATION = "europe-west3",
] = process.argv.slice(2);

if (!keyPath) {
  console.error("Uso: node scripts/bq-selftest.mjs <path-chiave.json> [billingProject] [dataProject] [location]");
  process.exit(1);
}

const MAX_BYTES = String(100 * 1024 * 1024); // cap di sicurezza: 100 MB per query

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getToken(sa) {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat, exp: iat + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const sig = crypto.createSign("RSA-SHA256").update(signingInput).sign(sa.private_key)
    .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${sig}`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "auth fallita");
  return data.access_token;
}

async function query(token, sql) {
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${BILLING}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, location: LOCATION, maximumBytesBilled: MAX_BYTES, timeoutMs: 20000 }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

console.log("\n🔎 Collaudo connettore BigQuery (solo lettura)\n");

let sa;
try {
  sa = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  console.log(`   chiave letta: ${sa.client_email}`);
} catch (e) {
  console.error(`❌ Non riesco a leggere la chiave (${keyPath}): ${e.message}`);
  process.exit(1);
}

let token;
try {
  token = await getToken(sa);
  console.log("✅ 1/3  Autenticazione OK — la chiave del robot è valida.");
} catch (e) {
  console.error(`❌ 1/3  Autenticazione fallita: ${e.message}`);
  process.exit(1);
}

try {
  await query(token, "SELECT 1 AS ok");
  console.log(`✅ 2/3  Fatturazione OK — le query girano nel progetto "${BILLING}" (paga la tua carta).`);
} catch (e) {
  console.error(`❌ 2/3  La query di prova non gira su "${BILLING}": ${e.message}`);
  console.error("        (Controlla: fatturazione collegata a hoc-pro + ruolo BigQuery Job User al service account.)");
  process.exit(1);
}

try {
  const r = await query(token, `SELECT COUNT(*) AS n FROM \`${DATA}.onlyfans.reach\``);
  const n = r.rows?.[0]?.f?.[0]?.v;
  console.log(`✅ 3/3  Lettura dati OK — Mattia ha dato l'accesso. (onlyfans.reach: ${n} righe)`);
  console.log("\n🎉 Tutto verde: possiamo collegare HOC Pro e usare i dati.\n");
} catch (e) {
  if (e.status === 403) {
    console.log("⏳ 3/3  Lettura dati: ANCORA in attesa di Mattia (permesso negato sul dato).");
    console.log("        Auth e fatturazione sono a posto: appena Mattia dà 'BigQuery Data Viewer' al robot, rilancia questo comando.\n");
  } else {
    console.error(`❌ 3/3  Errore imprevisto in lettura: ${e.message}`);
    console.error(`        (Se parla di 'location', il dataset potrebbe stare in una region diversa da ${LOCATION}.)\n`);
  }
}
