// Google Drive in sola lettura (26/10/2026) — per l'Editoriale: legge la cartella della creator
// dove l'editor sceglie foto e video. Non sposta, non copia e non cancella niente: lo stato dei
// file (libero, in un carosello, pubblicato) vive in HOC Pro, il drive resta com'è.
//
// Auth: lo stesso service account di BigQuery (BIGQUERY_SA_KEY, o GOOGLE_DRIVE_SA_KEY se si vuole
// separarlo), SENZA delega di dominio: vede solo le cartelle condivise con il suo indirizzo email.
// È il modo giusto per i drive delle modelle (account Google personali, fuori dal nostro Workspace):
// chi gestisce la cartella la condivide con l'indirizzo e basta. Serve la Google Drive API attiva
// sul progetto Google Cloud del service account.
import crypto from "crypto";

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const MAX_FILES = 6000;
const MAX_DEPTH = 5;

function sa() {
  const raw = process.env.GOOGLE_DRIVE_SA_KEY || process.env.BIGQUERY_SA_KEY;
  if (!raw) return null;
  try {
    const t = raw.trim();
    const j = JSON.parse(t.startsWith("{") ? t : Buffer.from(t, "base64").toString("utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}
export const driveConfigured = () => Boolean(sa());
/** L'indirizzo con cui condividere le cartelle (null se il service account non c'è). */
export const driveEmail = () => sa()?.client_email || null;

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

/** Errore di Drive tradotto in una frase che dice cosa fare. */
function driveError(status, body) {
  const msg = body?.error?.message || "";
  if (status === 403 && /has not been used|is disabled/i.test(msg)) return "La Google Drive API non è attiva sul progetto Google Cloud di HOC Pro";
  if (status === 404) return `Cartella non trovata: va condivisa con ${driveEmail()}`;
  if (status === 403) return `Nessun accesso: condividi la cartella con ${driveEmail()}`;
  return `Google Drive ${status}${msg ? ": " + msg : ""}`;
}

async function gget(path, params = {}) {
  const bearer = await token();
  const qs = new URLSearchParams({ supportsAllDrives: "true", ...params });
  const r = await fetch(`${API}${path}?${qs}`, { headers: { Authorization: `Bearer ${bearer}` }, cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(driveError(r.status, d));
  return d;
}

/** Id della cartella da un link di Drive (o l'id nudo). null se non si riconosce. */
export function folderIdFromUrl(url) {
  const s = String(url || "").trim();
  const m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}

/** Nome della cartella (e verifica che il service account la veda). */
export async function folderInfo(folderId) {
  const d = await gget(`/files/${encodeURIComponent(folderId)}`, { fields: "id,name,mimeType" });
  if (d.mimeType !== FOLDER) throw new Error("Il link non è una cartella di Drive");
  return { id: d.id, name: d.name };
}

const kindOf = (mime) => (String(mime).startsWith("image/") ? "photo" : String(mime).startsWith("video/") ? "video" : null);

/**
 * Tutte le foto e i video della cartella e delle sottocartelle (fino a MAX_DEPTH livelli).
 * `path` = sottocartella relativa ("" per la radice): l'editor ci si orienta come nel drive.
 */
export async function listMedia(folderId) {
  const out = [];
  const queue = [{ id: folderId, path: "", depth: 0 }];
  let truncated = false;
  while (queue.length) {
    const f = queue.shift();
    let pageToken;
    do {
      const d = await gget("/files", {
        q: `'${f.id}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,imageMediaMetadata(width,height,time),videoMediaMetadata(width,height,durationMillis))",
        pageSize: "1000", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}),
      });
      for (const x of d.files || []) {
        if (x.mimeType === FOLDER) {
          if (f.depth + 1 <= MAX_DEPTH) queue.push({ id: x.id, path: f.path ? `${f.path}/${x.name}` : x.name, depth: f.depth + 1 });
          continue;
        }
        const kind = kindOf(x.mimeType);
        if (!kind) continue;
        if (out.length >= MAX_FILES) { truncated = true; break; }
        const im = x.imageMediaMetadata || {}, vm = x.videoMediaMetadata || {};
        out.push({
          id: x.id, name: x.name, kind, path: f.path,
          created: x.createdTime || null,
          w: im.width || vm.width || null, h: im.height || vm.height || null,
          dur: vm.durationMillis ? Math.round(Number(vm.durationMillis) / 1000) : null,
          size: x.size ? Number(x.size) : null,
        });
      }
      pageToken = d.nextPageToken;
    } while (pageToken && !truncated);
    if (truncated) break;
  }
  out.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
  return { files: out, truncated };
}

/**
 * Anteprima di un file (JPEG/PNG) per la griglia. Prima la miniatura di Drive (anche per i
 * video), se non c'è e il file è una foto non troppo grande, la foto intera.
 */
export async function thumbnail(fileId, size = 400) {
  const bearer = await token();
  const meta = await gget(`/files/${encodeURIComponent(fileId)}`, { fields: "id,mimeType,size,thumbnailLink" });
  if (meta.thumbnailLink) {
    const url = meta.thumbnailLink.replace(/=s\d+$/, `=s${size}`);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    if (r.ok) return { type: r.headers.get("content-type") || "image/jpeg", body: Buffer.from(await r.arrayBuffer()) };
  }
  if (String(meta.mimeType).startsWith("image/") && Number(meta.size || 0) < 12_000_000) {
    const r = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${bearer}` } });
    if (r.ok) return { type: meta.mimeType, body: Buffer.from(await r.arrayBuffer()) };
  }
  return null;
}

export const driveFileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
export const driveFolderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
