/**
 * Client Dropbox Sign (ex HelloSign) — SOLO LETTURA (09/10/2026).
 *
 * Chiave in `DROPBOX_SIGN_API_KEY` (Basic auth, chiave come utente, password vuota).
 * Il piano dell'account è un piano API pagato: elenco richieste e download dei PDF
 * funzionano in produzione. Da qui non si invia, annulla o modifica nulla.
 *
 * Il download dei file è lento e limitato (osservato 09/10: ~1 PDF ogni 2 secondi,
 * 429 sopra quel ritmo, qualche 404 sui contratti non firmati): chi chiama lavora a
 * budget e riprende al giro dopo.
 */
const BASE = "https://api.hellosign.com/v3";

export const dropboxSignConfigured = () => Boolean(String(process.env.DROPBOX_SIGN_API_KEY || "").trim());

function authHeader() {
  const key = String(process.env.DROPBOX_SIGN_API_KEY || "").trim();
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export class DropboxSignError extends Error {
  constructor(message, { status = 0, retryAfter = null } = {}) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function ds(path, { raw = false, timeoutMs = 30_000 } = {}) {
  if (!dropboxSignConfigured()) throw new DropboxSignError("DROPBOX_SIGN_API_KEY non configurata");
  const res = await fetch(BASE + path, { headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = body.slice(0, 200);
    try { msg = JSON.parse(body)?.error?.error_msg || msg; } catch { /* testo */ }
    throw new DropboxSignError(`Dropbox Sign ${res.status}: ${msg}`, { status: res.status, retryAfter: Number(res.headers.get("retry-after")) || null });
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/** Tutte le richieste di firma dell'account (100 per pagina). */
export async function listAllSignatureRequests({ maxPages = 30 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const d = await ds(`/signature_request/list?page=${page}&page_size=100`);
    out.push(...(d.signature_requests || []));
    if (page >= Number(d.list_info?.num_pages || 1)) break;
  }
  return out;
}

/** PDF del contratto (con la pagina di audit di Dropbox Sign), o null se non c'è (404). */
export async function downloadContractPdf(signatureRequestId) {
  try {
    return await ds(`/signature_request/files/${encodeURIComponent(signatureRequestId)}?file_type=pdf`, { raw: true, timeoutMs: 45_000 });
  } catch (e) {
    if (e?.status === 404 || e?.status === 410) return null;
    throw e;
  }
}

/** Testo del PDF (unpdf, import dinamico: entra solo nelle funzioni che lo usano). "" se illeggibile. */
export async function pdfText(bytes) {
  if (!bytes?.length) return "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || "");
  } catch {
    return "";
  }
}
