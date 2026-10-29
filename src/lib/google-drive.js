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
  const folders = []; // tutte le sottocartelle, anche vuote (l'editor le usa come «da editare», «editati»…)
  const queue = [{ id: folderId, path: "", depth: 0 }];
  let truncated = false;
  while (queue.length) {
    const f = queue.shift();
    let pageToken;
    do {
      const d = await gget("/files", {
        q: `'${f.id}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height,durationMillis))",
        pageSize: "1000", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}),
      });
      for (const x of d.files || []) {
        if (x.mimeType === FOLDER) {
          const sub = f.path ? `${f.path}/${x.name}` : x.name;
          folders.push(sub);
          if (f.depth + 1 <= MAX_DEPTH) queue.push({ id: x.id, path: sub, depth: f.depth + 1 });
          continue;
        }
        const kind = kindOf(x.mimeType);
        if (!kind) continue;
        if (out.length >= MAX_FILES) { truncated = true; break; }
        const im = x.imageMediaMetadata || {}, vm = x.videoMediaMetadata || {};
        // foto del telefono girate (rotation 1 o 3 = 90°/270°): larghezza e altezza vere sono scambiate
        const turned = im.rotation === 1 || im.rotation === 3;
        out.push({
          id: x.id, name: x.name, kind, path: f.path,
          created: x.createdTime || null,
          w: (turned ? im.height : im.width) || vm.width || null, h: (turned ? im.width : im.height) || vm.height || null,
          dur: vm.durationMillis ? Math.round(Number(vm.durationMillis) / 1000) : null,
          size: x.size ? Number(x.size) : null,
        });
      }
      pageToken = d.nextPageToken;
    } while (pageToken && !truncated);
    if (truncated) break;
  }
  out.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
  return { files: out, folders: folders.sort((a, b) => a.localeCompare(b, "it")), truncated };
}

/**
 * Anteprima di un file (JPEG/PNG) per la griglia. Prima la miniatura di Drive (anche per i
 * video), se non c'è e il file è una foto non troppo grande, la foto intera.
 */
const thumbMeta = new Map(); // id → metadati con thumbnailLink (per istanza, 30 min: il link dura ore)
export async function thumbnail(fileId, size = 400) {
  // Drive gira le foto del telefono (HEIF/EXIF) solo nelle anteprime da 800 px in su: sotto le dà
  // coricate (verificato 28/10 su IMG_0702.heif: s600 → 600x450, s800 → 600x800). Quindi mai sotto 800.
  size = Math.max(800, size);
  const bearer = await token();
  let meta = thumbMeta.get(fileId);
  if (!meta || Date.now() - meta.at > 30 * 60_000) {
    meta = { ...(await gget(`/files/${encodeURIComponent(fileId)}`, { fields: "id,mimeType,size,thumbnailLink" })), at: Date.now() };
    thumbMeta.set(fileId, meta);
    if (thumbMeta.size > 3000) thumbMeta.delete(thumbMeta.keys().next().value);
  }
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

/**
 * Un pezzo di un file (per guardare i video nella pagina). Il browser chiede i byte a pezzi
 * (Range); si risponde con al massimo MEDIA_CHUNK byte per volta, così ogni risposta resta sotto
 * il limite delle funzioni e il lettore video chiede da solo il pezzo dopo.
 */
const MEDIA_CHUNK = 3 * 1024 * 1024;
const metaCache = new Map(); // id → { mime, size, at } (per istanza, 10 min)
export async function mediaChunk(fileId, rangeHeader) {
  let meta = metaCache.get(fileId);
  if (!meta || Date.now() - meta.at > 600_000) {
    const m = await gget(`/files/${encodeURIComponent(fileId)}`, { fields: "id,mimeType,size" });
    meta = { mime: m.mimeType, size: Number(m.size || 0), at: Date.now() };
    metaCache.set(fileId, meta);
  }
  const size = meta.size;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || "");
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : start + MEDIA_CHUNK - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; } // "ultimi N byte"
  end = Math.min(end, start + MEDIA_CHUNK - 1, size - 1);
  if (!size || start >= size) return { status: 416, size, mime: meta.mime };
  const bearer = await token();
  const r = await fetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${bearer}`, Range: `bytes=${start}-${end}` } });
  if (!r.ok && r.status !== 206) throw new Error(`Google Drive ${r.status}`);
  return { status: 206, body: r.body, start, end, size, mime: meta.mime };
}

/**
 * Una foto pronta per Instagram: JPEG già girato nel verso giusto (anche le HEIF del telefono),
 * lato lungo `size` px (Instagram pubblica al massimo 1080 di larghezza; 2048 lascia margine).
 * Resta sotto il limite di risposta delle funzioni. null se Drive non ha un'anteprima.
 */
export async function photoForPublishing(fileId, size = 2048) {
  const bearer = await token();
  const meta = await gget(`/files/${encodeURIComponent(fileId)}`, { fields: "id,name,thumbnailLink" });
  if (!meta.thumbnailLink) return null;
  const r = await fetch(meta.thumbnailLink.replace(/=s\d+$/, `=s${size}`), { headers: { Authorization: `Bearer ${bearer}` } });
  if (!r.ok) return null;
  return { name: meta.name, body: Buffer.from(await r.arrayBuffer()) };
}

export const driveFileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
export const driveFolderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
