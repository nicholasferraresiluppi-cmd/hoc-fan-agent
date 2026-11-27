/**
 * Scheda numeri della creator — logica PURA (19/11/2026). Testata in tests/creator-numeri.mjs.
 *
 * Perché (Nicholas, 19/11): «se domani arriva una creator, che dati le chiedo per misurare
 * quanto potrebbe fare?». Il potenziale sta in tre leve — quanta gente le arriva (social),
 * quanti si iscrivono (link e pagina), quanto rende ogni fan (guadagni per tipo, fan che
 * spendono di più) — più ciò che è disposta a fare (contenuti) e il suo tempo.
 * La creator riceve un LINK personale (/numeri/[token], niente account), compila a capitoli
 * e carica ogni screenshot ACCANTO alla spiegazione con la schermata d'esempio.
 *
 * Qui niente KV né rete: definizione dei passi, pulizia delle risposte, regole d'invio.
 */

export const TOKEN_RE = /^[a-f0-9]{32}$/;
export const LINK_TTL_DAYS = 30;
export const MAX_FILES_PER_STEP = 4;
export const MAX_FILES_PER_TOKEN = 40;
export const MAX_SLOTS_PER_TOKEN = 120;      // richieste di caricamento (anche dopo errori)
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // uno screenshot pesa pochi MB: 15 è largo
export const UPLOAD_SLOT_TTL_S = 2 * 3600;
export const UPLOAD_PREFIX = "creator-numeri/";
export const UPLOAD_TYPES = { "image/jpeg": "jpg", "image/png": "png" };

// ── Capitoli del modulo ─────────────────────────────────────────────────────
export const CHAPTERS = [
  { id: "chi", label: "Chi sei" },
  { id: "contenuti", label: "I tuoi contenuti" },
  { id: "pagina", label: "La tua pagina" },
  { id: "social", label: "Instagram e TikTok" },
  { id: "domande", label: "Ultime domande" },
];

// ── Screenshot richiesti ────────────────────────────────────────────────────
// `period` è SEMPRE dichiarato: uno screenshot senza periodo non si può leggere.
// `mock` sceglie la schermata d'esempio disegnata nella pagina.
export const SHOT_STEPS = [
  {
    id: "of_earnings", read: 'Guarda quanto pesano i messaggi sul totale: se quasi tutto arriva dagli abbonamenti, la chat non è sfruttata ed è il margine che possiamo aggiungere noi.', chapter: "pagina", title: "Quanto guadagni, diviso per tipo",
    path: ["Menu", "Statistics", "Overview"], period: "Ultimi 12 mesi",
    look: ["Imposta il periodo sugli ultimi 12 mesi (o da quando hai aperto, se è meno).", "Deve vedersi la divisione: abbonamenti, messaggi, mance, post, dirette."],
    tip: "È il dato più importante: ci dice se guadagni soprattutto dagli abbonamenti o dalla chat. Se in Overview non trovi la divisione, guarda nella scheda Statements.",
    mock: "earnings",
  },
  {
    id: "of_fans", read: 'Nuovi iscritti al mese e andamento: dicono se la base cresce o cala. Rinnovi attivi bassi rispetto ai fan attivi = pubblico che non resta.', chapter: "pagina", title: "Quanti fan hai e quanti restano",
    path: ["Menu", "Statistics", "Fans"], period: "Ultimi 12 mesi",
    look: ["Stesso periodo: ultimi 12 mesi.", "Devono vedersi fan attivi, nuovi iscritti e il grafico mese per mese."],
    tip: "Se vedi anche quanti hanno il rinnovo automatico attivo, mettilo nello screenshot: ci dice quanti fan restano.",
    mock: "fans",
  },
  {
    id: "of_reach", read: 'Visite alla pagina rispetto ai nuovi iscritti dello stesso periodo: dice quanto la pagina converte chi arriva. Molte visite e pochi iscritti = pagina o prezzo da sistemare.', chapter: "pagina", title: "Quanta gente visita la tua pagina",
    path: ["Menu", "Statistics", "Reach"], period: "Ultimi 12 mesi",
    look: ["Stesso periodo: ultimi 12 mesi.", "Devono vedersi le visite al profilo (visitatori e utenti) e il grafico mese per mese."],
    tip: "Ci dice quanta gente arriva sulla tua pagina e, insieme ai nuovi iscritti, quanti di loro si abbonano. Se in Reach non trovi le visite al profilo, guarda in Overview.",
    mock: "reach",
  },
  {
    id: "of_topfans", read: 'Se i primi 2-3 fan fanno metà della spesa, il fatturato è fragile. Confrontalo con lo screenshot degli ultimi 30 giorni: chi spende ancora?', chapter: "pagina", title: "I fan che spendono di più: da sempre",
    path: ["Menu", "Statistics", "Overview", "Top fans"], period: "Da sempre",
    look: ["Imposta il periodo su «All time» (da sempre): devono vedersi i primi 10 e quanto ha speso ciascuno.", "Copri i nomi dei fan prima di caricare: ci servono solo le cifre."],
    tip: "Ci dice se i tuoi guadagni dipendono da pochissime persone. Se la lista non è in Overview, prova nella scheda Fans.",
    mock: "topfans",
  },
  {
    id: "of_topfans_30", read: 'Gli stessi fan negli ultimi 30 giorni: se i grandi di sempre qui mancano, hanno smesso di spendere.', chapter: "pagina", title: "I fan che spendono di più: ultimi 30 giorni",
    path: ["Menu", "Statistics", "Overview", "Top fans"], period: "Ultimi 30 giorni",
    look: ["Stessa schermata di prima, ma cambia il periodo su «Last 30 days».", "Copri i nomi dei fan prima di caricare: ci servono solo le cifre."],
    tip: "È un secondo screenshot, diverso dal precedente: ci dice se chi spendeva tanto spende ancora oggi.",
    mock: "topfans_30",
  },
  {
    id: "of_links", read: 'Da quale social arrivano gli iscritti che pagano, non solo quelli che cliccano.', chapter: "pagina", title: "Da dove arrivano i tuoi iscritti",
    path: ["Menu", "Statistics", "Reach", "Tracking links"], period: "Da sempre",
    look: ["Devono vedersi tutti i link che usi (Instagram, TikTok, Telegram, Reddit…).", "Per ognuno: clic, iscritti e guadagno."],
    tip: "L'elenco si trova anche in Settings › Profile › Tracking links. Se non li hai mai creati segna «Non ce l'ho»: va bene lo stesso.",
    mock: "links",
  },
  {
    id: "ig_overview", read: 'Conta più la copertura delle visualizzazioni che i follower: un profilo che gira porta traffico anche se è piccolo.', chapter: "social", title: "Instagram: quanta gente vede i tuoi contenuti",
    path: ["Profilo", "Dashboard professionale", "Vedi tutti gli insight"], period: "Ultimi 90 giorni",
    look: ["In alto scegli 90 giorni (se non c'è, il periodo più lungo che trovi).", "Devono vedersi visualizzazioni, account raggiunti, interazioni e follower."],
    tip: "Contano più le visualizzazioni dei follower: un profilo piccolo con reel che girano vale più di uno grande che nessuno vede.",
    mock: "ig_overview",
  },
  {
    id: "ig_link", read: 'Tocchi sul link rispetto alle visite al profilo: se sono pochi, il funnel verso la pagina va sistemato.', chapter: "social", title: "Instagram: quanti cliccano il link in bio",
    path: ["Insight", "Visualizzazioni", "Attività del profilo"], period: "Ultimi 90 giorni",
    look: ["Stesso periodo: 90 giorni.", "Devono vedersi visite al profilo e tocchi sul link esterno."],
    tip: "È il ponte tra Instagram e la tua pagina: ci dice quanta gente passa davvero dall'altra parte.",
    mock: "ig_link",
  },
  {
    id: "ig_audience", read: 'Paese e genere del pubblico: un pubblico italiano e uno americano spendono in modo diverso.', chapter: "social", title: "Instagram: chi è il tuo pubblico",
    path: ["Insight", "Follower"], period: "Com'è oggi",
    look: ["Scorri fino in fondo: devono vedersi paesi, fasce d'età e genere.", "Se servono due screenshot va benissimo."],
    tip: "Il paese conta molto: pubblici diversi spendono in modo diverso. Instagram mostra questi dati da 100 follower in su.",
    mock: "audience",
  },
  {
    id: "tt_overview", read: 'Visualizzazioni dei video rispetto alle visite al profilo: dice quanto il traffico di TikTok si trasforma in interesse per lei.', chapter: "social", title: "TikTok: quanto girano i tuoi video",
    path: ["Profilo", "☰", "TikTok Studio", "Analisi"], period: "Ultimi 60 giorni",
    look: ["Scegli 60 giorni.", "Devono vedersi visualizzazioni dei video, visualizzazioni del profilo e follower."],
    tip: "Se non usi TikTok segna «Non lo uso».",
    mock: "tt_overview",
  },
  {
    id: "tt_audience", chapter: "social", title: "TikTok: chi ti guarda",
    path: ["Analisi", "Follower"], period: "Com'è oggi",
    look: ["Devono vedersi genere, età e paesi dei follower."],
    tip: null,
    mock: "tt_audience",
  },
  {
    id: "altro", chapter: "domande", title: "Altro che vuoi farci vedere",
    path: [], period: "Facoltativo",
    look: ["Qualsiasi screenshot che secondo te racconta bene il tuo lavoro: un post andato forte, un mese record, un altro social."],
    tip: null, mock: null, optional: true,
  },
];
export const STEP_BY_ID = Object.fromEntries(SHOT_STEPS.map((s) => [s.id, s]));

// ── Contenuti: cosa fa già, cosa farebbe, cosa no ──────────────────────────
export const CONTENT_TYPES = [
  { id: "lifestyle", label: "Foto e video vestita, lifestyle" },
  { id: "lingerie", label: "Lingerie e costume" },
  { id: "vedononvedo", label: "Vedo non vedo (nudo coperto)" },
  { id: "topless", label: "Topless" },
  { id: "nudo", label: "Nudo completo" },
  { id: "esplicito_solo", label: "Contenuti espliciti da sola" },
  { id: "esplicito_partner", label: "Contenuti espliciti con partner" },
  { id: "nicchie", label: "Nicchie (piedi, cosplay, dominazione…)" },
  { id: "custom", label: "Contenuti su richiesta" },
  { id: "vocali", label: "Vocali" },
  { id: "videochiamate", label: "Videochiamate" },
  { id: "live", label: "Dirette" },
];
export const CONTENT_LEVELS = [
  { id: "si", label: "Lo faccio già", short: "Già" },
  { id: "farei", label: "Lo farei", short: "Farei" },
  { id: "no", label: "No", short: "No" },
];
export const FACE_OPTIONS = ["Sì", "A volte", "No"];
export const PLATFORM_OPTIONS = ["OnlyFans", "Fanvue", "Altra piattaforma", "Non ho ancora una pagina"];
export const PAGE_KIND_OPTIONS = ["A pagamento", "Gratuita", "Ne ho una per tipo"];
export const EARN_BANDS = ["Meno di 500 $", "500 – 2.000 $", "2.000 – 5.000 $", "5.000 – 10.000 $", "10.000 – 25.000 $", "Più di 25.000 $", "Preferisco non dirlo"];
export const YES_NO = ["Sì", "No"];

// Campi di testo: chiave → lunghezza massima. Tutto il resto viene scartato.
export const TEXT_FIELDS = {
  stageName: 80, realName: 80, city: 80, contact: 120,
  ig: 200, tiktok: 200, x: 200, telegram: 200, onlyfans: 200, fanvue: 200, otherSocial: 300,
  subPrice: 40, since: 40, languages: 120,
  readyContent: 400, perWeek: 400, chatToday: 600, agency: 1000, timeGoal: 1000, banDetail: 600, notes: 2000,
};
const CHOICE_FIELDS = {
  face: FACE_OPTIONS, platform: PLATFORM_OPTIONS, pageKind: PAGE_KIND_OPTIONS, earnBand: EARN_BANDS, banned: YES_NO,
};
const BOOL_FIELDS = ["adult", "privacy"];

const clip = (v, n) => String(v ?? "").replace(/\u0000/g, "").slice(0, n);

/** Risposte pulite: solo campi noti, testo tagliato, scelte ammesse. Mai lancia. */
export function sanitizeAnswers(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const [k, n] of Object.entries(TEXT_FIELDS)) if (a[k] != null && a[k] !== "") out[k] = clip(a[k], n);
  for (const [k, opts] of Object.entries(CHOICE_FIELDS)) if (opts.includes(a[k])) out[k] = a[k];
  for (const k of BOOL_FIELDS) if (a[k] === true) out[k] = true;
  const levels = new Set(CONTENT_LEVELS.map((l) => l.id));
  const content = {};
  for (const t of CONTENT_TYPES) if (levels.has(a.content?.[t.id])) content[t.id] = a.content[t.id];
  if (Object.keys(content).length) out.content = content;
  const skip = {};
  for (const s of SHOT_STEPS) if (a.skip?.[s.id] === true) skip[s.id] = true;
  if (Object.keys(skip).length) out.skip = skip;
  return out;
}

export const SOCIAL_KEYS = ["ig", "tiktok", "x", "telegram", "onlyfans", "fanvue", "otherSocial"];

/**
 * Cosa manca per inviare. Solo il minimo: nome, 18 anni, privacy, almeno un social.
 * Gli screenshot non sono obbligatori (chi non ha ancora una pagina non li ha).
 * @returns {Array<{key, chapter, msg}>}
 */
export function missingForSubmit(answers) {
  const a = answers || {};
  const out = [];
  if (!a.stageName?.trim()) out.push({ key: "stageName", chapter: "chi", msg: "Scrivi il nome con cui lavori." });
  if (!SOCIAL_KEYS.some((k) => a[k]?.trim())) out.push({ key: "ig", chapter: "chi", msg: "Metti almeno un link ai tuoi social." });
  if (a.adult !== true) out.push({ key: "adult", chapter: "chi", msg: "Conferma di avere almeno 18 anni." });
  if (a.privacy !== true) out.push({ key: "privacy", chapter: "domande", msg: "Serve il consenso al trattamento dei dati." });
  return out;
}

/** Stato del link: "invalid" | "expired" | "open" | "submitted". */
export function linkState(rec, now = Date.now()) {
  if (!rec || !TOKEN_RE.test(String(rec.token || ""))) return "invalid";
  if (rec.submittedAt) return "submitted";
  if (Number(rec.expiresAt || 0) < now) return "expired";
  return "open";
}

/** Passo dello screenshot "fatto": almeno un file oppure segnato come non disponibile. */
export function stepDone(stepId, filesByStep, skip) {
  return (filesByStep?.[stepId]?.length || 0) > 0 || skip?.[stepId] === true;
}

/** Screenshot fatti / da fare (il passo facoltativo non conta). */
export function shotProgress(filesByStep, skip, platform) {
  const noPage = platform === "Non ho ancora una pagina";
  const steps = SHOT_STEPS.filter((s) => !s.optional && !(noPage && s.chapter === "pagina"));
  const done = steps.filter((s) => stepDone(s.id, filesByStep, skip)).length;
  return { done, total: steps.length };
}

/** File raggruppati per passo, in ordine di caricamento. */
export function groupFiles(files) {
  const by = {};
  for (const f of files || []) {
    if (!f || !STEP_BY_ID[f.step]) continue;
    (by[f.step] ||= []).push(f);
  }
  for (const k of Object.keys(by)) by[k].sort((x, y) => (x.at || 0) - (y.at || 0));
  return by;
}

/** Pathname deciso dal server: casuale, senza dati personali. */
export function newUploadPathname(randomHex, contentType) {
  const ext = UPLOAD_TYPES[contentType];
  if (!ext || !TOKEN_RE.test(String(randomHex || ""))) return null;
  return `${UPLOAD_PREFIX}${randomHex}.${ext}`;
}
export function isUploadPathname(p) {
  return typeof p === "string" && /^creator-numeri\/[a-f0-9]{32}\.(jpg|png)$/.test(p);
}

/** Controlli della richiesta di caricamento (oltre allo stato del link). */
export function checkUploadRequest({ step, contentType, size }, countInStep = 0) {
  if (!STEP_BY_ID[step]) return { status: 400, error: "Passo non previsto." };
  if (!UPLOAD_TYPES[contentType]) return { status: 415, error: "Carica una foto o uno screenshot (JPG o PNG)." };
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return { status: 400, error: "File vuoto." };
  if (n > UPLOAD_MAX_BYTES) return { status: 413, error: "File troppo grande (massimo 15 MB)." };
  if (countInStep >= MAX_FILES_PER_STEP) return { status: 429, error: `Qui puoi caricare al massimo ${MAX_FILES_PER_STEP} screenshot.` };
  return null;
}

/** Tipo reale dai primi byte (non da quello dichiarato). */
export function sniffImage(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", ext: "png" };
  return null;
}
