// Editoriale — scaricare un contenuto per pubblicarlo (28/10/2026, Nicholas: «possiamo scaricarlo
// così che poi possiamo caricarlo sul social?»). Solo nel browser.
//
// - Foto: JPEG già girato nel verso giusto (anche le HEIF del telefono), dalla route ?photo=.
// - Video: il file intero, ricomposto dai pezzi della route ?media= (ogni risposta del server è
//   piccola, così anche un video da 200 MB passa).
// - Telefono: si apre il menu di condivisione (navigator.share con i file) → «Salva immagini»
//   mette tutto nel rullino, nell'ordine del carosello. Computer: un file alla volta, numerati.
// - La didascalia viene copiata negli appunti, pronta da incollare.
const API = "/api/admin/editoriale";

const slug = (s) => String(s || "contenuto").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "contenuto";

async function photoFile(creator, id, name) {
  const r = await fetch(`${API}?creator=${encodeURIComponent(creator)}&photo=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("Una foto non si scarica (Drive non risponde): riprova");
  return new File([await r.blob()], `${name}.jpg`, { type: "image/jpeg" });
}

async function videoFile(creator, id, name, onProgress) {
  const url = `${API}?creator=${encodeURIComponent(creator)}&media=${encodeURIComponent(id)}`;
  const parts = [];
  let pos = 0, size = null, type = "video/mp4";
  do {
    const r = await fetch(url, { headers: { Range: `bytes=${pos}-` } });
    if (!r.ok && r.status !== 206) throw new Error("Il video non si scarica (Drive non risponde): riprova");
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(r.headers.get("content-range") || "");
    type = r.headers.get("content-type") || type;
    parts.push(await r.blob());
    if (!m) break; // risposta intera
    pos = Number(m[2]) + 1;
    size = Number(m[3]);
    onProgress?.(Math.min(1, pos / size));
  } while (pos < size);
  return new File(parts, `${name}.mp4`, { type });
}

/** Scarica i file di un contenuto (id nel drive in ordine). Ritorna File[] pronti da consegnare. */
export async function prepareFiles({ creator, files, kind, title, onProgress }) {
  if (!files?.length) throw new Error("Niente da scaricare");
  const base = slug(title);
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const name = files.length > 1 ? `${String(i + 1).padStart(2, "0")}-${base}` : base;
    out.push(kind === "reel"
      ? await videoFile(creator, files[i], name, (p) => onProgress?.((i + p) / files.length))
      : await photoFile(creator, files[i], name));
    onProgress?.((i + 1) / files.length);
  }
  return out;
}

/** Telefono con condivisione di file (iPhone, Android). */
export const canShareFiles = (files) => {
  try {
    const touch = window.matchMedia?.("(pointer: coarse)").matches;
    return Boolean(touch && navigator.canShare?.({ files: files || [new File([""], "x.jpg", { type: "image/jpeg" })] }));
  } catch { return false; }
};

/**
 * Consegna i file: sul telefono il menu di condivisione (va chiamato direttamente da un tocco,
 * il telefono lo blocca se prima c'è un'attesa lunga); sul computer un download per file.
 */
export async function deliverFiles(files, { share } = {}) {
  if (share && canShareFiles(files)) {
    try { await navigator.share({ files }); return { shared: true }; }
    catch (e) { if (e?.name === "AbortError") return { aborted: true }; }
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    await new Promise((res) => setTimeout(res, 350)); // il browser accetta più download se non arrivano tutti insieme
  }
  return { shared: false };
}
