// Google Sheets (17/11/2026) — per il foglio «Anagrafica Operatori» dell'Area Partner.
//
// Auth: lo stesso service account di BigQuery/Drive (BIGQUERY_SA_KEY, o GOOGLE_SHEETS_SA_KEY se
// si vuole separarlo), SENZA delega di dominio: vede e scrive solo i fogli condivisi con il suo
// indirizzo email (come le cartelle dell'Editoriale in google-drive.js). Serve la Google Sheets API
// attiva sul progetto Google Cloud del service account.
import crypto from "crypto";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

function sa() {
  const raw = process.env.GOOGLE_SHEETS_SA_KEY || process.env.BIGQUERY_SA_KEY;
  if (!raw) return null;
  try {
    const t = raw.trim();
    const j = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}
export const sheetsConfigured = () => Boolean(sa());
/** L'indirizzo con cui condividere il foglio (null se il service account non c'è). */
export const sheetsEmail = () => sa()?.client_email || null;

const b64u = (x) => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
let tok = { token: null, exp: 0 };
async function token() {
  if (tok.token && tok.exp > Date.now() + 30_000) return tok.token;
  const k = sa();
  if (!k) throw new Error("Service account Google non configurato");
  const iat = Math.floor(Date.now() / 1000);
  const input = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iss: k.client_email, scope: SCOPE, aud: TOKEN_URI, iat, exp: iat + 3600 }))}`;
  const sig = crypto.createSign("RSA-SHA256").update(input).sign(k.private_key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const r = await fetch(TOKEN_URI, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${sig}` }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google auth ${r.status}`);
  tok = { token: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return tok.token;
}

/** Errore di Sheets tradotto in una frase che dice cosa fare. */
function sheetsError(status, body) {
  const msg = body?.error?.message || "";
  if (status === 403 && /has not been used|is disabled/i.test(msg)) return "La Google Sheets API non è attiva sul progetto Google Cloud di HOC Pro";
  if (status === 404) return `Foglio non trovato: va condiviso con ${sheetsEmail()}`;
  if (status === 403) return `Nessun accesso: condividi il foglio con ${sheetsEmail()} come editor`;
  return `Google Sheets ${status}${msg ? ": " + msg : ""}`;
}

async function call(method, path, { params = {}, body } = {}) {
  const bearer = await token();
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${API}${path}${qs ? "?" + qs : ""}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(sheetsError(r.status, d));
  return d;
}

/** Valori di un intervallo A1, come li vede chi apre il foglio (testo formattato). */
export async function getValues(spreadsheetId, range) {
  const d = await call("GET", `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, { params: { valueRenderOption: "FORMATTED_VALUE" } });
  return d.values || [];
}

/**
 * Aggiunge righe IN FONDO (inserisce righe nuove, non sovrascrive niente). USER_ENTERED: le date
 * "gg/mm/aaaa" diventano date come quelle scritte a mano (il foglio è en_GB); chi chiama
 * neutralizza i valori che il foglio leggerebbe come formule o numeri (vedi sheetText).
 */
export async function appendRows(spreadsheetId, range, rows) {
  if (!rows.length) return { updatedRows: 0 };
  const d = await call("POST", `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`, {
    params: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
    body: { values: rows },
  });
  return { updatedRows: d.updates?.updatedRows || 0, range: d.updates?.updatedRange || null };
}
