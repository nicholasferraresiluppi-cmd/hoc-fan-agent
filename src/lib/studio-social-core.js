// Studio social — logica pura (16/10/2026). Nessun import: la usano API, pagine e test.
//
// Un PROFILO è un account social di una creator gestito dalla redazione (es. @marty.tibecca):
// ha un'identità scritta (la "bibbia": chi è, cosa raccontiamo, come, cosa non fa mai), una fase
// (rodaggio → lancio → crescita), un calendario fisso per giorno della settimana e una lista di
// cose da fare A MANO ogni giorno (seguire, commentare, storie). Le interazioni su Instagram non si
// automatizzano: sono contro le regole della piattaforma e il modo più rapido di perdere l'account.
//
// Un CONTENUTO è un pezzo (reel, storia, carosello) che attraversa la coda:
// idea → script → da girare → in montaggio → da approvare → programmato → pubblicato (o scartato).
// Ogni contenuto porta gli esiti dei revisori della redazione (conformità adult, voce/brand,
// qualità del video con le sue voci, controllo tecnico): passa a "programmato" solo una persona,
// e solo sul video montato con qualità piena (v studio-2).

export const STUDIO_VERSION = "studio-2";

export const PLATFORMS = ["instagram", "tiktok", "x", "reddit"];
export const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok", x: "X", reddit: "Reddit" };

export const PHASES = [
  { key: "rodaggio", label: "Rodaggio", days: 7, hint: "Uso a mano dal telefono, 1 reel al giorno dal 3º giorno, niente link né automazioni" },
  { key: "lancio", label: "Lancio", days: 21, hint: "1-2 reel al giorno, link nelle evidenze se la reach è stabile" },
  { key: "crescita", label: "Crescita", days: null, hint: "Trial Reels, report del lunedì, si tiene ciò che porta click e abbonati" },
];

// Colonne della coda, nell'ordine in cui il lavoro le attraversa.
export const STATUSES = [
  { key: "idea", label: "Idee", hint: "Da scrivere" },
  { key: "script", label: "Script pronti", hint: "Scritti, da passare ai revisori" },
  { key: "da_girare", label: "Da girare", hint: "Nella lista riprese della creator" },
  { key: "montaggio", label: "In montaggio", hint: "Girati, si montano e si sottotitolano" },
  { key: "da_approvare", label: "Da approvare", hint: "Pronti: una persona li guarda" },
  { key: "programmato", label: "Programmati", hint: "Approvati, in coda di pubblicazione" },
  { key: "pubblicato", label: "Pubblicati", hint: "Usciti" },
  { key: "scartato", label: "Scartati", hint: "Non escono" },
];
const STATUS_KEYS = STATUSES.map((s) => s.key);

export const KINDS = [
  { key: "reel", label: "Reel" },
  { key: "storia", label: "Storia" },
  { key: "carosello", label: "Carosello" },
  { key: "post", label: "Post" },
];
const KIND_KEYS = KINDS.map((k) => k.key);

// Revisori della redazione. Esito: ok | attenzione | blocca (null = non ancora passato).
// Tutti e quattro servono per programmare: la qualità è la differenza, non un optional.
export const REVIEWERS = [
  { key: "conformita", label: "Conformità", hint: "Regole adult: niente OF, link, persone reali, minore età, letto come set" },
  { key: "voce", label: "Voce e brand", hint: "Suona come lei, rispetta la bibbia, il gancio regge" },
  { key: "qualita", label: "Qualità", hint: "È lei, identica; montaggio pulito; nessun errore. Si guarda il video, non lo script" },
  { key: "tecnico", label: "Controllo tecnico", hint: "Formato verticale, durata, audio, nessun fermo immagine (controllo_video.py)" },
];
export const REQUIRED_REVIEWERS = ["conformita", "voce", "qualita", "tecnico"];

// Cosa guarda il revisore Qualità, una voce alla volta. "Ok" solo con tutte spuntate.
// Le voci "ai" valgono solo se il contenuto ha parti generate con l'AI.
export const QUALITY_CHECKS = [
  { key: "volto", label: "È lei: volto, corpo, capelli, nei identici alle foto di riferimento, in ogni inquadratura" },
  { key: "anatomia", label: "Mani, dita, denti, occhi giusti; niente pelle di plastica o lineamenti che cambiano" },
  { key: "coerenza", label: "Vestiti, oggetti, luce e ambiente non cambiano da un taglio all'altro" },
  { key: "montaggio", label: "Montaggio pulito: tagli a tempo, niente scatti, fermi o salti di colore" },
  { key: "testo", label: "Testi a schermo e sottotitoli senza refusi, a tempo, leggibili e fuori dalle zone coperte da Instagram" },
  { key: "audio", label: "Audio pulito e a volume giusto; la voce è la sua o dichiarata" },
  { key: "aggancio", label: "I primi 2 secondi fermano il pollice: lo guarderesti fino in fondo?" },
  { key: "etichetta_ai", label: "Etichetta AI prevista alla pubblicazione", ai: true },
];
export const qualityChecksFor = (item) => QUALITY_CHECKS.filter((c) => !c.ai || item?.ai);

const REVIEW_OUTCOMES = ["ok", "attenzione", "blocca"];

export const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
export const WEEKDAY_LABEL = { lun: "Lunedì", mar: "Martedì", mer: "Mercoledì", gio: "Giovedì", ven: "Venerdì", sab: "Sabato", dom: "Domenica" };

// Cose da fare a mano ogni giorno, se il profilo non ne ha di sue.
export const DEFAULT_DAILY = [
  "Segui 10-15 account della nicchia (lista del giorno)",
  "Commenta 5 reel di creator simili, frasi vere",
  "3 storie: sondaggio, dietro le quinte, risposta a un commento",
  "Rispondi ai commenti entro un'ora da ogni pubblicazione",
];

const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v, maxItems = 30, max = 400) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [])
    .map((x) => str(x, max)).filter(Boolean).slice(0, maxItems);

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** Profilo pulito dall'input (crea o aggiorna). Ritorna { ok, errors, profile }. */
export function normalizeProfile(input, prev = null) {
  const errors = [];
  const handle = str(input?.handle, 60).replace(/^@/, "");
  if (!handle) errors.push("Scrivi il nome dell'account (es. marty.tibecca)");
  const platform = PLATFORMS.includes(input?.platform) ? input.platform : prev?.platform || "instagram";
  const phase = PHASES.some((p) => p.key === input?.phase) ? input.phase : prev?.phase || "rodaggio";
  const id = str(input?.id, 80) || prev?.id || slugify(`${platform}-${handle}`);
  const idIn = input?.identity || {};
  const identity = {
    personaggio: str(idIn.personaggio, 600),
    promessa: str(idIn.promessa, 400),
    racconto: strList(idIn.racconto),
    voce: str(idIn.voce, 600),
    estetica: str(idIn.estetica, 600),
    maiFare: strList(idIn.maiFare),
  };
  const calendar = {};
  for (const d of WEEKDAYS) {
    const v = str(input?.calendar?.[d], 120);
    if (v) calendar[d] = v;
  }
  const daily = strList(input?.daily, 12, 200);
  const profile = {
    id,
    handle,
    platform,
    creator: str(input?.creator, 80),
    format: str(input?.format, 120),
    phase,
    phaseStart: isDay(input?.phaseStart) ? input.phaseStart : prev?.phaseStart || null,
    identity,
    calendar,
    daily: daily.length ? daily : [],
    trackingLink: str(input?.trackingLink, 120),
    note: str(input?.note, 1000),
    createdAt: prev?.createdAt || null,
    updatedAt: null,
  };
  return { ok: errors.length === 0, errors, profile };
}

/** Contenuto pulito dall'input. */
export function normalizeItem(input, prev = null) {
  const errors = [];
  const title = str(input?.title, 140);
  if (!title) errors.push("Dai un titolo al contenuto");
  const status = STATUS_KEYS.includes(input?.status) ? input.status : prev?.status || "idea";
  const kind = KIND_KEYS.includes(input?.kind) ? input.kind : prev?.kind || "reel";
  const reviews = {};
  for (const r of REVIEWERS) {
    const src = input?.reviews?.[r.key] ?? prev?.reviews?.[r.key];
    // la Qualità può avere voci spuntate prima dell'esito (le spunta l'agente o chi guarda)
    const hasChecks = r.key === "qualita" && Array.isArray(src?.checks) && src.checks.length > 0;
    if (src && (REVIEW_OUTCOMES.includes(src.outcome) || hasChecks)) {
      const rv = { outcome: REVIEW_OUTCOMES.includes(src.outcome) ? src.outcome : null, note: str(src.note, 600), at: src.at || null };
      if (r.key === "qualita") {
        const keys = QUALITY_CHECKS.map((c) => c.key);
        rv.checks = Array.isArray(src.checks) ? [...new Set(src.checks.filter((k) => keys.includes(k)))] : [];
      }
      reviews[r.key] = rv;
    }
  }
  const item = {
    id: str(input?.id, 80) || prev?.id || null,
    title,
    kind,
    status,
    day: isDay(input?.day) ? input.day : null,
    format: str(input?.format, 80),
    hook: str(input?.hook, 120),
    script: str(input?.script, 6000),
    shooting: str(input?.shooting, 1000),
    caption: str(input?.caption, 600),
    why: str(input?.why, 600),
    ai: input?.ai === undefined ? !!prev?.ai : !!input.ai,
    mediaUrl: /^https:\/\//.test(str(input?.mediaUrl, 600)) ? str(input.mediaUrl, 600) : "",
    reviews,
    // Editoriale: a quale storia della settimana appartiene e con che ruolo
    arcId: str(input?.arcId ?? prev?.arcId, 40) || null,
    arcRole: str(input?.arcRole ?? prev?.arcRole, 20) || null,
    aiReview: prev?.aiReview || null, // scritto solo dall'agente qualità (studio-quality.js), mai dal browser
    createdAt: prev?.createdAt || null,
    updatedAt: null,
  };
  return { ok: errors.length === 0, errors, item };
}

/** Un revisore ha bloccato? Allora il contenuto non può essere approvato. */
export function blockingReviews(item) {
  return REVIEWERS.filter((r) => item?.reviews?.[r.key]?.outcome === "blocca").map((r) => r.label);
}

/** Si può portare a "programmato"? Serve il video, tutti i revisori, nessun blocco e la qualità piena. */
export function canSchedule(item) {
  const blocks = blockingReviews(item);
  if (blocks.length) return { ok: false, reason: `Bloccato da: ${blocks.join(", ")}` };
  if (!item?.mediaUrl) return { ok: false, reason: "Manca il video montato: la qualità si giudica sul video" };
  const missing = REQUIRED_REVIEWERS.filter((k) => !item?.reviews?.[k]?.outcome);
  if (missing.length) {
    const names = REVIEWERS.filter((r) => missing.includes(r.key)).map((r) => r.label);
    return { ok: false, reason: `Manca il revisore: ${names.join(", ")}` };
  }
  const q = item.reviews.qualita;
  if (q.outcome !== "ok") return { ok: false, reason: "La qualità deve essere ok: con «attenzione» si rifà, non si pubblica" };
  const done = new Set(q.checks || []);
  const open = qualityChecksFor(item).filter((c) => !done.has(c.key));
  if (open.length) return { ok: false, reason: `Qualità: ${open.length === 1 ? "manca una voce" : `mancano ${open.length} voci`} (${open.map((c) => c.key).join(", ")})` };
  return { ok: true, reason: null };
}

/** Giorno della fase (1 = primo giorno) dato oggi in YYYY-MM-DD. */
export function phaseDay(profile, today) {
  if (!profile?.phaseStart || !isDay(today)) return null;
  const a = Date.parse(profile.phaseStart + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.floor((b - a) / 86400000) + 1;
}

/** Riga di stato della fase in parole: "Rodaggio, giorno 2 di 7". */
export function phaseLine(profile, today) {
  const ph = PHASES.find((p) => p.key === profile?.phase) || PHASES[0];
  const d = phaseDay(profile, today);
  if (d == null) return ph.label;
  if (ph.days && d > ph.days) return `${ph.label}, giorno ${d}: fase finita, passa alla successiva`;
  return ph.days ? `${ph.label}, giorno ${d} di ${ph.days}` : `${ph.label}, giorno ${d}`;
}

/** Conteggi per colonna; la somma è il totale (nessun contenuto fuori colonna). */
export function countsByStatus(items) {
  const out = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
  for (const it of items || []) out[STATUS_KEYS.includes(it.status) ? it.status : "idea"] += 1;
  return out;
}

/** Lista del giorno: le voci del profilo (o quelle di base) con lo stato fatto/non fatto salvato. */
export function dailyChecklist(profile, saved) {
  const texts = profile?.daily?.length ? profile.daily : DEFAULT_DAILY;
  const done = new Set(Array.isArray(saved?.done) ? saved.done : []);
  return texts.map((text, i) => ({ i, text, done: done.has(i) }));
}

/** Giorno della settimana (chiave WEEKDAYS) di una data YYYY-MM-DD. */
export function weekdayOf(day) {
  if (!isDay(day)) return null;
  const d = new Date(day + "T12:00:00Z").getUTCDay(); // 0 = domenica
  return WEEKDAYS[(d + 6) % 7];
}

/** Prossimo contenuto in programma da oggi in poi (per la scheda del profilo nell'elenco). */
export function nextUp(items, today) {
  const future = (items || [])
    .filter((it) => it.day && it.day >= today && !["pubblicato", "scartato"].includes(it.status))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return future[0] || null;
}

/** Oggi a Roma in YYYY-MM-DD (le giornate della redazione sono italiane). */
export function romeToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
