// Richieste alla modella — logica pura (26/11/2026). Nessun import: la usano lib, API, pagine e test.
//
// Il pezzo PRIMA dell'Editing: la social media manager prepara una lista di riprese (ognuna col suo
// video di riferimento, cosa fare, outfit, frase da dire, nota vocale) con una scadenza; la modella
// apre un link dal telefono (niente app, niente account), gira e carica; la SMM guarda, approva o
// chiede di rifare. Studio di partenza: reports/richieste-modella-cp.html (Projects di CreatorsPro +
// prova pratica di Vocal Video, Billo, Filestage).
//
// Regole che vengono dallo studio e che qui non si rompono:
//   - riferimento PER RIPRESA e scadenza per chi gira: nessuno dei tre strumenti provati li ha
//   - lo stato si CALCOLA dai file e dai giudizi (in CP si cambia a mano ed è per questo che si ferma)
//   - si chiede di rifare solo ciò che è scritto nella richiesta, al massimo MAX_REDO giri per ripresa
//   - due esiti soli per ripresa: approvata o da rifare (con la nota)

export const TOKEN_RE = /^[a-f0-9]{32}$/;
export const SHOT_ID_RE = /^[a-f0-9]{8}$/;
export const MAX_SHOTS = 15;
export const MAX_TAKES_PER_SHOT = 8;
export const MAX_SLOTS_PER_TOKEN = 400;     // caricamenti chiesti (anche quelli falliti e ripresi)
export const MAX_REDO = 2;                   // giri di «da rifare» per ripresa
export const LINK_GRACE_DAYS = 21;           // il link resta aperto fino a 21 giorni dopo la scadenza
export const UPLOAD_SLOT_TTL_S = 6 * 3600;   // un video lungo dal telefono può metterci molto
export const DAY_MS = 86400e3;

export const TEXT = { title: 120, note: 1500, creatorName: 80, shotTitle: 90, what: 700, outfit: 240, line: 500, refLink: 500, reviewNote: 600 };

// Tipi ammessi per uso. take = ripresa della modella, ref = video/foto di riferimento, voce = nota vocale.
export const UPLOAD_TYPES = {
  take: { "video/mp4": "mp4", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heif" },
  ref: { "video/mp4": "mp4", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png" },
  voce: { "audio/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/aac": "aac" },
};
export const MAX_BYTES = { take: 4 * 1024 ** 3, ref: 600 * 1024 ** 2, voce: 25 * 1024 ** 2 };
const KIND_LABEL = { take: "ripresa", ref: "riferimento", voce: "nota vocale" };

// Estensione → tipo, per i file del telefono che arrivano senza tipo (succede con alcuni video HEVC)
const EXT_TYPE = { mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", aac: "audio/aac" };
export function guessType(name, type) {
  const t = String(type || "").toLowerCase().split(";")[0].trim();
  if (t) return t;
  const ext = String(name || "").toLowerCase().split(".").pop();
  return EXT_TYPE[ext] || "";
}

export const familyOf = (contentType) => {
  const t = String(contentType || "");
  return t.startsWith("video/") ? "video" : t.startsWith("image/") ? "photo" : t.startsWith("audio/") ? "audio" : null;
};

// ── Stati ──────────────────────────────────────────────────────────────────
export const SHOT_STATE = {
  da_girare: { model: "Da girare", app: "Da girare", order: 0 },
  da_rifare: { model: "Da rifare", app: "Da rifare", order: 1 },
  da_vedere: { model: "Caricata, la stiamo guardando", app: "Da guardare", order: 2 },
  approvata: { model: "Approvata", app: "Approvata", order: 3 },
};

export const REQUEST_STATE = {
  pronta: { label: "Pronta, non ancora mandata", order: 0 },
  inviata: { label: "Mandata", order: 1 },
  vista: { label: "Aperta dalla modella", order: 2 },
  in_corso: { label: "In corso", order: 3 },
  da_rifare: { label: "Da rifare", order: 4 },
  consegnata: { label: "Consegnata, da guardare", order: 5 },
  approvata: { label: "Approvata", order: 6 },
};

const ts = (x) => Number(x) || 0;

/** Le riprese di uno scatto, dalla più vecchia. */
export function takesOf(files = [], shotId) {
  return files.filter((f) => f && f.kind === "take" && f.shotId === shotId).sort((a, b) => ts(a.at) - ts(b.at));
}

export function lastReview(reviews = []) {
  return [...(reviews || [])].sort((a, b) => ts(a.at) - ts(b.at)).pop() || null;
}

export const redoCount = (reviews = []) => (reviews || []).filter((r) => r?.verdict === "redo").length;

/**
 * Stato di una ripresa, calcolato:
 *   nessun file                         → da girare (o da rifare se l'ultimo giudizio lo chiede)
 *   file dopo l'ultimo giudizio         → da guardare
 *   ultimo giudizio «ok», niente dopo   → approvata
 *   ultimo giudizio «redo», niente dopo → da rifare
 */
export function shotState(takes = [], reviews = []) {
  const last = lastReview(reviews);
  const after = last ? takes.filter((t) => ts(t.at) > ts(last.at)) : takes;
  if (after.length) return "da_vedere";
  if (last?.verdict === "ok") return "approvata";
  if (last?.verdict === "redo") return "da_rifare";
  return "da_girare";
}

/** Il giudizio è ammesso? (stato della ripresa + tetto dei giri) */
export function reviewAllowed(state, verdict, reviews = []) {
  if (verdict !== "ok" && verdict !== "redo") return { ok: false, error: "Giudizio non valido." };
  if (state !== "da_vedere") return { ok: false, error: state === "approvata" ? "Questa ripresa è già approvata." : "Non c'è niente di nuovo da guardare in questa ripresa." };
  if (verdict === "redo" && redoCount(reviews) >= MAX_REDO) return { ok: false, error: `Hai già chiesto di rifarla ${MAX_REDO} volte: si approva così o se ne parla con lei.` };
  return { ok: true };
}

/** La modella può ancora caricare su questa ripresa? */
export function canUpload(state, takesCount) {
  if (state === "approvata") return { ok: false, error: "Questa ripresa è già approvata." };
  if (takesCount >= MAX_TAKES_PER_SHOT) return { ok: false, error: `Al massimo ${MAX_TAKES_PER_SHOT} file per ripresa: togline uno prima di caricarne un altro.` };
  return { ok: true };
}

/** Un file della modella si può togliere finché nessuno l'ha giudicato. */
export function takeRemovable(take, reviews = []) {
  const last = lastReview(reviews);
  return !last || ts(take?.at) > ts(last.at);
}

/** Stato di tutta la richiesta, con i conteggi per stato. */
export function requestState(rec, files = []) {
  const shots = rec?.shots || [];
  const by = { da_girare: 0, da_rifare: 0, da_vedere: 0, approvata: 0 };
  let anyTake = false;
  for (const s of shots) {
    const tk = takesOf(files, s.id);
    if (tk.length) anyTake = true;
    by[shotState(tk, rec.reviews?.[s.id])]++;
  }
  const n = shots.length;
  let state;
  if (n && by.approvata === n) state = "approvata";
  else if (by.da_rifare) state = "da_rifare";
  else if (n && by.da_vedere + by.approvata === n) state = "consegnata";
  else if (anyTake) state = "in_corso";
  else if (rec?.openedAt) state = "vista";
  else if (rec?.sentAt) state = "inviata";
  else state = "pronta";
  return { state, counts: by, total: n, delivered: by.da_vedere + by.approvata };
}

/** In ritardo: scadenza passata e la modella non ha ancora caricato tutto. */
export function isLate(rec, state, now = Date.now()) {
  return Boolean(rec?.deadline) && ts(rec.deadline) < now && !["consegnata", "approvata"].includes(state);
}

export function linkState(rec, now = Date.now()) {
  if (!rec || !TOKEN_RE.test(String(rec.token || ""))) return "invalid";
  if (ts(rec.expiresAt) < now) return "expired";
  return "open";
}

export const expiresFor = (deadline) => ts(deadline) + LINK_GRACE_DAYS * DAY_MS;

// ── Scadenza in parole ─────────────────────────────────────────────────────
const TZ = "Europe/Rome";
function dayKey(ms, tz = TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
const hhmm = (ms, tz = TZ) => new Intl.DateTimeFormat("it-IT", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const longDay = (ms, tz = TZ) => new Intl.DateTimeFormat("it-IT", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(ms));
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS);

/**
 * La scadenza come la legge una persona: «entro oggi alle 18:00», «entro domani alle 18:00»,
 * «entro venerdì 28 novembre alle 18:00 · mancano 2 giorni», «scaduta da 3 ore», «scaduta da 2 giorni».
 */
export function deadlineText(deadline, now = Date.now(), tz = TZ) {
  const d = ts(deadline);
  if (!d) return { text: "senza scadenza", late: false, soon: false };
  if (d < now) {
    const h = Math.floor((now - d) / 3600e3);
    const days = dayDiff(dayKey(now, tz), dayKey(d, tz));
    const text = h < 24 && days <= 1 ? (h < 1 ? "scaduta da poco" : `scaduta da ${h} ${h === 1 ? "ora" : "ore"}`) : `scaduta da ${days} ${days === 1 ? "giorno" : "giorni"}`;
    return { text, late: true, soon: false };
  }
  const days = dayDiff(dayKey(d, tz), dayKey(now, tz));
  if (days === 0) return { text: `entro oggi alle ${hhmm(d, tz)}`, late: false, soon: true };
  if (days === 1) return { text: `entro domani alle ${hhmm(d, tz)}`, late: false, soon: true };
  return { text: `entro ${longDay(d, tz)} alle ${hhmm(d, tz)}`, left: `mancano ${days} giorni`, late: false, soon: false };
}

// ── Dati dal browser (lato app) ────────────────────────────────────────────
const clip = (s, n) => String(s ?? "").replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, n);
const oneLine = (s, n) => clip(String(s ?? "").replace(/[\r\n]+/g, " "), n);
export const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function isHttpUrl(s) {
  try { const u = new URL(String(s)); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

/**
 * Pulisce ciò che arriva dalla pagina dell'app. `existing` = la richiesta salvata (per tenere id,
 * file di riferimento e note vocali: quelli non li decide mai il browser). `newId()` = id casuale.
 * Ritorna { data, errors } — errors è vuoto se si può salvare.
 */
export function sanitizeRequest(input = {}, { existing = null, newId, now = Date.now() } = {}) {
  const errors = [];
  const creatorName = oneLine(input.creator?.name ?? input.creatorName, TEXT.creatorName);
  const creatorSlug = slugify(input.creator?.slug || creatorName);
  const title = oneLine(input.title, TEXT.title);
  const note = clip(input.note, TEXT.note);
  const deadline = Number(input.deadline);
  if (!creatorName) errors.push("Scegli per quale creator è la richiesta.");
  if (!title) errors.push("Dai un titolo alla richiesta (es. «Reel della settimana 48»).");
  if (!Number.isFinite(deadline) || deadline <= 0) errors.push("Metti una scadenza.");
  else if (!existing && deadline < now) errors.push("La scadenza è già passata.");
  else if (deadline > now + 120 * DAY_MS) errors.push("La scadenza è troppo lontana (massimo 4 mesi).");

  const old = new Map((existing?.shots || []).map((s) => [s.id, s]));
  const raw = Array.isArray(input.shots) ? input.shots.slice(0, MAX_SHOTS + 1) : [];
  if (raw.length > MAX_SHOTS) errors.push(`Al massimo ${MAX_SHOTS} riprese per richiesta.`);
  const seen = new Set();
  const shots = [];
  raw.slice(0, MAX_SHOTS).forEach((s, i) => {
    let id = SHOT_ID_RE.test(String(s?.id || "")) && old.has(s.id) ? s.id : null;
    if (!id || seen.has(id)) id = newId ? newId() : `${String(i).padStart(8, "0")}`;
    seen.add(id);
    const prev = old.get(id);
    const refLink = oneLine(s?.refLink, TEXT.refLink);
    const shot = {
      id,
      title: oneLine(s?.title, TEXT.shotTitle),
      what: clip(s?.what, TEXT.what),
      outfit: oneLine(s?.outfit, TEXT.outfit),
      line: clip(s?.line, TEXT.line),
      refLink: refLink && isHttpUrl(refLink) ? refLink : "",
      ref: prev?.ref || null,     // file caricati dall'app: li cambia solo la route dell'app
      voice: prev?.voice || null,
    };
    if (!shot.title) errors.push(`Dai un nome alla ripresa ${i + 1}.`);
    if (refLink && !shot.refLink) errors.push(`Il link di riferimento della ripresa ${i + 1} non è un indirizzo web.`);
    shots.push(shot);
  });
  if (!shots.length) errors.push("Aggiungi almeno una ripresa.");
  return { data: { creator: { slug: creatorSlug, name: creatorName }, title, note, deadline: Number.isFinite(deadline) ? deadline : null, shots }, errors };
}

/** Le riprese tolte che hanno già file della modella: non si possono togliere (si perderebbero). */
export function removedShotsWithTakes(existing, nextShots, files = []) {
  const keep = new Set((nextShots || []).map((s) => s.id));
  return (existing?.shots || []).filter((s) => !keep.has(s.id) && takesOf(files, s.id).length > 0);
}

export function sanitizeReviewNote(s) { return clip(s, TEXT.reviewNote); }

// ── File ───────────────────────────────────────────────────────────────────
const UPLOAD_PREFIX = "richieste/";
export function newUploadPathname(randomHex, kind, contentType) {
  const ext = UPLOAD_TYPES[kind]?.[contentType];
  if (!ext || !TOKEN_RE.test(String(randomHex || ""))) return null;
  return `${UPLOAD_PREFIX}${kind}/${randomHex}.${ext}`;
}
export function isUploadPathname(p) {
  return typeof p === "string" && /^richieste\/(take|ref|voce)\/[a-f0-9]{32}\.(mp4|mov|m4v|webm|jpg|png|heic|heif|m4a|mp3|ogg|aac)$/.test(p);
}
export const kindOfPathname = (p) => (isUploadPathname(p) ? p.split("/")[1] : null);

/** Controlli di una richiesta di caricamento (oltre allo stato del link e della ripresa). */
export function checkUploadRequest({ kind, contentType, size }) {
  if (!UPLOAD_TYPES[kind]) return { status: 400, error: "Caricamento non previsto." };
  if (!UPLOAD_TYPES[kind][contentType]) {
    return { status: 415, error: kind === "voce" ? "Formato audio non letto." : kind === "take" ? "Carica un video o una foto dal telefono." : "Carica un video (mp4 o mov) o una foto." };
  }
  const n = Number(size);
  if (!(n > 0)) return { status: 400, error: "Il file è vuoto." };
  if (n > MAX_BYTES[kind]) return { status: 413, error: `File troppo grande per una ${KIND_LABEL[kind]} (massimo ${fmtBytes(MAX_BYTES[kind])}).` };
  return null;
}

/**
 * Cosa c'è davvero nei primi byte (non ci si fida del tipo dichiarato dal browser).
 * Ritorna la famiglia: video | photo | audio, oppure null se non è un formato atteso.
 */
export function sniffMedia(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 12) return null;
  const s = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "photo";
  if (b[0] === 0x89 && s(1, 3) === "PNG") return "photo";
  if (s(4, 4) === "ftyp") {
    const brand = s(8, 4);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(brand)) return "photo";
    if (/^(M4A |M4B |F4A )$/.test(brand)) return "audio";
    return "video"; // isom, mp41, mp42, qt  , M4V , 3gp…, avc1, dash…
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm"; // video o audio: decide il tipo dichiarato
  if (s(0, 4) === "OggS") return "audio";
  if (s(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio";
  // .mov vecchi: l'atomo «ftyp» può mancare, c'è subito «moov»/«wide»/«mdat»
  if (/^(moov|wide|mdat|free|skip)$/.test(s(4, 4))) return "video";
  return null;
}

/** Il contenuto vero è compatibile col tipo dichiarato? */
export function sniffMatches(sniffed, contentType) {
  const fam = familyOf(contentType);
  if (!sniffed || !fam) return false;
  if (sniffed === "webm") return contentType === "video/webm" || contentType === "audio/webm";
  // l'audio registrato dal browser (Chrome, Safari) esce in un contenitore MP4 generico («isom»,
  // «mp42», «iso5»): i primi byte sono gli stessi di un video, decide il tipo dichiarato
  if (sniffed === "video" && (contentType === "audio/mp4" || contentType === "audio/x-m4a")) return true;
  return sniffed === fam;
}

export function fmtBytes(n) {
  const x = Number(n) || 0;
  if (x >= 1024 ** 3) return `${(x / 1024 ** 3).toFixed(x >= 10 * 1024 ** 3 ? 0 : 1).replace(".", ",")} GB`;
  if (x >= 1024 ** 2) return `${Math.round(x / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(x / 1024))} KB`;
}

// ── Messaggio per WhatsApp (lo manda a mano la SMM) ────────────────────────
export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

export function whatsappText(rec, link, now = Date.now()) {
  const n = rec?.shots?.length || 0;
  const dl = deadlineText(rec?.deadline, now);
  const hi = firstName(rec?.creator?.name);
  return [
    `Ciao${hi ? " " + hi : ""}! 🤍`,
    `Ecco le riprese di «${rec?.title || "questa settimana"}»: ${n} ${n === 1 ? "ripresa" : "riprese"}, ognuna con il video di esempio e cosa fare.`,
    `Le carichi dal telefono direttamente da qui, ${dl.late ? "appena puoi" : dl.text}:`,
    link,
  ].join("\n");
}

/** Vista per la modella: solo ciò che le serve (niente chi l'ha creata, niente note interne). */
export function publicShots(rec, files = []) {
  return (rec?.shots || []).map((s, i) => {
    const reviews = rec.reviews?.[s.id] || [];
    const takes = takesOf(files, s.id);
    const state = shotState(takes, reviews);
    const last = lastReview(reviews);
    return {
      id: s.id, n: i + 1, title: s.title, what: s.what, outfit: s.outfit, line: s.line, refLink: s.refLink || "",
      ref: s.ref ? { pathname: s.ref.pathname, family: familyOf(s.ref.contentType) } : null,
      voice: s.voice ? { pathname: s.voice.pathname } : null,
      state,
      redoNote: state === "da_rifare" || (state === "da_vedere" && last?.verdict === "redo") ? last?.note || "" : "",
      takes: takes.map((t) => ({ pathname: t.pathname, at: t.at, family: familyOf(t.contentType), size: t.size, removable: takeRemovable(t, reviews) })),
      upload: canUpload(state, takes.length),
    };
  });
}
