// BigQuery client — REST API + service-account JWT (niente SDK pesante).
//
// LOGICA DI FATTURAZIONE (importante):
//   - I dati vivono nel magazzino di HOC (BIGQUERY_DATA_PROJECT, es. house-of-creators-358213).
//   - Le query vengono LANCIATE dentro BIGQUERY_BILLING_PROJECT → è QUEL progetto a pagare.
//   Fissando BIGQUERY_BILLING_PROJECT sul progetto di Nicholas, ogni query di HOC Pro
//   viene addebitata sul suo conto, non su quello del proprietario dei dati.
//   Lettura dei dati e pagamento sono cose separate: il service account deve comunque
//   avere `roles/bigquery.dataViewer` sui dataset di HOC (grant dal proprietario) e
//   `roles/bigquery.jobUser` sul billing project.
//
// SICUREZZA: ogni query porta un tetto `maximumBytesBilled` — se una query proverebbe a
//   scansionare più byte del cap, FALLISCE invece di addebitare. Blindatura anti-conto-svuotato.
//
// Auth: JWT RS256 firmato col crypto nativo di Node (nessuna dipendenza npm aggiunta).
// NB: usa il runtime Node (non Edge) nelle route che lo importano — `crypto` non è su Edge.

import crypto from "crypto";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const BQ_BASE = "https://bigquery.googleapis.com/bigquery/v2";
const SCOPE = "https://www.googleapis.com/auth/bigquery.readonly";

// Cap di default: 2 GiB per query (~$0.012 a $6/TiB). Override con BIGQUERY_MAX_BYTES_BILLED.
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;

function getEnv() {
  const raw = process.env.BIGQUERY_SA_KEY;
  const billingProject = process.env.BIGQUERY_BILLING_PROJECT;
  if (!raw || !billingProject) {
    throw new Error(
      "BigQuery non configurato: servono BIGQUERY_SA_KEY (JSON del service account) e BIGQUERY_BILLING_PROJECT"
    );
  }
  let sa;
  try {
    // Accetta sia JSON diretto sia base64 (più robusto in .env: niente quoting/newline).
    const t = raw.trim();
    const json = t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8");
    sa = JSON.parse(json);
  } catch {
    throw new Error("BIGQUERY_SA_KEY non è un JSON/base64 valido");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("BIGQUERY_SA_KEY incompleto: mancano client_email / private_key");
  }
  return {
    sa,
    billingProject, // chi PAGA le query (progetto di Nicholas)
    dataProject: process.env.BIGQUERY_DATA_PROJECT || "", // dove stanno i DATI (magazzino HOC)
    location: process.env.BIGQUERY_LOCATION || "", // es. "EU" / "europe-west3" / "US" (deve combaciare col dataset)
    maxBytesBilled: Number(process.env.BIGQUERY_MAX_BYTES_BILLED) || DEFAULT_MAX_BYTES,
  };
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// Cache token (come fa creatorspro-api.js): riusa finché non è quasi scaduto.
let _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken(force = false) {
  const now = Date.now();
  if (!force && _tokenCache.token && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.token;
  }
  const { sa } = getEnv();
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URI, iat, exp })
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.private_key)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`BigQuery auth fallita (${res.status}): ${data?.error_description || data?.error}`);
  }
  _tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 };
  return _tokenCache.token;
}

// Converte lo schema+righe BigQuery ({ f:[{v}] }) in array di oggetti JS con coercizione base.
function rowsToObjects(schema, rows) {
  const fields = schema?.fields || [];
  return (rows || []).map((row) => {
    const obj = {};
    fields.forEach((field, i) => {
      const v = row.f?.[i]?.v;
      obj[field.name] = coerce(v, field.type);
    });
    return obj;
  });
}

function coerce(v, type) {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "INTEGER":
    case "INT64":
    case "FLOAT":
    case "FLOAT64":
    case "NUMERIC":
    case "BIGNUMERIC":
      return v === "" ? null : Number(v);
    case "BOOLEAN":
    case "BOOL":
      return v === "true" || v === true;
    default:
      return v; // STRING, DATE, TIMESTAMP (epoch), ... li lascio grezzi
  }
}

/**
 * Esegue una query SQL (standard SQL) sul billing project configurato.
 * @param {string} sql - la query. Referenzia le tabelle in full: `DATA_PROJECT.dataset.tabella`.
 * @param {object} [opts]
 * @param {number} [opts.maxBytesBilled] - override del cap di sicurezza (byte).
 * @param {string} [opts.location] - override della location del job (deve combaciare col dataset).
 * @param {number} [opts.timeoutMs] - attesa lato server prima di passare al polling.
 * @returns {Promise<{rows: object[], totalBytesProcessed: number, cacheHit: boolean}>}
 */
export async function bqQuery(sql, opts = {}) {
  const env = getEnv();
  const token = await getAccessToken();
  const maxBytes = opts.maxBytesBilled ?? env.maxBytesBilled;
  const location = opts.location ?? env.location;

  const body = {
    query: sql,
    useLegacySql: false,
    maximumBytesBilled: String(maxBytes), // int64 → stringa; oltre il cap la query fallisce
    timeoutMs: opts.timeoutMs ?? 20_000,
  };
  if (location) body.location = location;

  const res = await fetch(`${BQ_BASE}/projects/${env.billingProject}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.error?.errors?.[0]?.message || res.statusText;
    throw new Error(`BigQuery query fallita (${res.status}): ${msg}`);
  }

  // Query completata entro timeoutMs → risultati inline.
  if (data.jobComplete) {
    return {
      rows: rowsToObjects(data.schema, data.rows),
      totalBytesProcessed: Number(data.totalBytesProcessed || 0),
      cacheHit: Boolean(data.cacheHit),
    };
  }

  // Non completata in tempo → polling su getQueryResults col jobId.
  const jobId = data.jobReference?.jobId;
  const jobLocation = data.jobReference?.location || location;
  return pollJobResults(env, token, jobId, jobLocation);
}

async function pollJobResults(env, token, jobId, jobLocation, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const url = new URL(`${BQ_BASE}/projects/${env.billingProject}/queries/${jobId}`);
    url.searchParams.set("timeoutMs", "10000");
    if (jobLocation) url.searchParams.set("location", jobLocation);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      throw new Error(`BigQuery getQueryResults fallita (${res.status}): ${msg}`);
    }
    if (data.jobComplete) {
      return {
        rows: rowsToObjects(data.schema, data.rows),
        totalBytesProcessed: Number(data.totalBytesProcessed || 0),
        cacheHit: Boolean(data.cacheHit),
      };
    }
  }
  throw new Error("BigQuery: job non completato entro il timeout di polling");
}

// True se le env sono presenti — utile per rispondere in modo pulito quando non è ancora configurato.
export function bigQueryConfigured() {
  try {
    getEnv();
    return true;
  } catch {
    return false;
  }
}

// ─── Scope tenant HOC ────────────────────────────────────────────────────────
// Il warehouse è MULTI-TENANT: `hoc.ws_chat` (e le tabelle onlyfans.*) contengono
// anche i creator/fan di ALTRE agenzie clienti di CreatorsPro. Ogni query esposta
// agli operatori HOC va ristretta all'organizzazione di HOC, altrimenti la vista
// (Presidio chat, Priority Queue) mostra dati che non sono di HOC e che l'operatore
// non può nemmeno gestire (leak cross-tenant + rumore operativo).
//
// `ws_chat` NON ha una colonna organization_id → lo scope si fa via `onlyfans.reach`
// (creator_id → organization_id). L'id è overridabile via env (default = org HOC).
export const HOC_ORGANIZATION_ID =
  process.env.HOC_ORGANIZATION_ID || "5598597c-7fab-4fe1-acb3-5358df7d9dc5";

// Frammento SQL che restringe `col` (default `creator_id`) ai soli creator dell'org
// HOC, via sub-select su reach (tabella piccola). Usare come condizione AND in un WHERE.
export function hocCreatorScopeSQL(dataProject, col = "creator_id") {
  return `${col} IN (SELECT creator_id FROM \`${dataProject}.onlyfans.reach\` WHERE organization_id = '${HOC_ORGANIZATION_ID}')`;
}
