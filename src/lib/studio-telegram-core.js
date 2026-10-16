// Studio social — canale Telegram e landing del profilo (logica pura, niente KV né rete).
//
// Il percorso (decisione di Nicholas, 16/10/2026):
//   bio e storie in evidenza → LANDING (pagina nostra, conta le visite) → canale TELEGRAM
//   (link d'invito del bot HOC, conta chi entra) → link di tracciamento ONLYFANS (conta abbonati).
// OnlyFans si nomina SOLO su Telegram, mai sul profilo social.
//
// Un POST Telegram è un messaggio programmato nel canale della creator: testo, 0-10 foto, un
// pulsante (di solito il link di tracciamento OF). Parte da solo all'ora scelta, ma solo se una
// persona l'ha approvato e i revisori conformità + qualità sono "ok". Niente "attenzione" sulla
// qualità: quello che esce deve essere perfetto.

export const TG_VERSION = "studio-tg-1";

export const TG_STATUSES = [
  { key: "bozza", label: "Bozza" },
  { key: "programmato", label: "Programmato" },
  { key: "inviato", label: "Inviato" },
  { key: "errore", label: "Non partito" },
  { key: "annullato", label: "Annullato" },
];
const TG_STATUS_KEYS = TG_STATUSES.map((s) => s.key);

export const TG_REVIEWERS = [
  { key: "conformita", label: "Conformità", hint: "Regole Telegram e adult: niente nudo esplicito nel canale, nessuna persona reale, link solo di tracciamento" },
  { key: "qualita", label: "Qualità", hint: "Foto perfette: è lei, identica, niente errori o pelle di plastica; testo senza refusi" },
];
const OUTCOMES = ["ok", "attenzione", "blocca"];

export const TG_TEXT_MAX_PHOTO = 1024; // didascalia di una foto (limite Telegram)
export const TG_TEXT_MAX = 4096;       // messaggio di solo testo
export const TG_MAX_PHOTOS = 10;       // album (sendMediaGroup)
export const LATE_LIMIT_MS = 6 * 3600e3; // oltre 6 ore di ritardo non si manda: si segnala

const str = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
const isHttps = (u) => /^https:\/\/[^\s]+$/i.test(String(u || ""));

// ── Ora di Roma ↔ istante ───────────────────────────────────────────────────
/** "2026-10-17T21:30" letto come ora di Roma → millisecondi (gestisce ora legale/solare). */
export function romeLocalToMs(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ""));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // offset di Roma in quel momento: provo con l'istante UTC e correggo una volta (basta per CET/CEST)
  const offsetAt = (t) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(t)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  return t;
}

/** millisecondi → "2026-10-17T21:30" in ora di Roma (per il campo datetime-local). */
export function msToRomeLocal(ms) {
  if (!Number.isFinite(ms)) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ── Post ────────────────────────────────────────────────────────────────────
/** Post pulito dall'input. Lo stato "programmato" NON si imposta da qui: serve l'approvazione. */
export function normalizeTgPost(input, prev = null) {
  const errors = [];
  const photoIds = Array.isArray(input?.photoIds) ? [...new Set(input.photoIds.map(String).filter((x) => /^[a-f0-9]{16}$/.test(x)))].slice(0, TG_MAX_PHOTOS) : prev?.photoIds || [];
  const max = photoIds.length ? TG_TEXT_MAX_PHOTO : TG_TEXT_MAX;
  const rawText = String(input?.text ?? "");
  const text = str(rawText, TG_TEXT_MAX);
  // sondaggio (il canale non permette risposte: l'interazione è questa)
  let poll = input?.poll === undefined ? prev?.poll || null : input.poll;
  if (poll) {
    const question = str(poll.question, 300);
    const options = (Array.isArray(poll.options) ? poll.options : []).map((o) => str(o, 100)).filter(Boolean).slice(0, 10);
    if (!question || options.length < 2) { if (question || options.length) errors.push("Il sondaggio vuole una domanda e almeno 2 risposte"); poll = null; }
    else poll = { question, options };
  }
  if (!text && !photoIds.length && !poll) errors.push("Scrivi un testo, scegli una foto o prepara un sondaggio");
  if (text.length > max) errors.push(`Con le foto il testo può avere al massimo ${TG_TEXT_MAX_PHOTO} caratteri (ora ${text.length})`);
  const buttonUrl = str(input?.buttonUrl, 500);
  const buttonLabel = str(input?.buttonLabel, 40);
  if (buttonUrl && !isHttps(buttonUrl)) errors.push("Il link del pulsante deve iniziare con https://");
  if (buttonUrl && !buttonLabel) errors.push("Dai un nome al pulsante (es. «Vieni a trovarmi»)");
  let sendAt = Number.isFinite(input?.sendAt) ? input.sendAt : romeLocalToMs(input?.sendAtLocal);
  if (sendAt == null) sendAt = prev?.sendAt ?? null;
  const reviews = {};
  for (const r of TG_REVIEWERS) {
    const src = input?.reviews?.[r.key] ?? prev?.reviews?.[r.key];
    if (src && OUTCOMES.includes(src.outcome)) reviews[r.key] = { outcome: src.outcome, note: str(src.note, 400), at: src.at || null };
  }
  // Stato: "programmato" si ottiene solo con l'approvazione (approveTgPost), "inviato"/"errore"
  // solo da chi manda. Ogni modifica riporta il post in bozza: va riapprovato. Un inviato resta tale.
  const status = prev?.status === "inviato" ? "inviato" : input?.status === "annullato" ? "annullato" : "bozza";
  const post = {
    id: str(input?.id, 40) || prev?.id || null,
    text,
    photoIds,
    buttonUrl: buttonUrl || "",
    buttonLabel: buttonUrl ? buttonLabel : "",
    sendAt,
    ai: input?.ai === undefined ? !!prev?.ai : !!input.ai,
    poll,
    pin: input?.pin === undefined ? !!prev?.pin : !!input.pin, // fissato in alto nel canale (il benvenuto)
    // Editoriale: a quale storia della settimana appartiene, in che momento del giorno, con che ruolo
    arcId: str(input?.arcId ?? prev?.arcId, 40) || null,
    slot: ["mattina", "pomeriggio", "sera"].includes(input?.slot) ? input.slot : input?.slot === null ? null : prev?.slot || null,
    role: str(input?.role ?? prev?.role, 20) || null,
    reviews,
    status,
  };
  return { ok: errors.length === 0, errors, post };
}

/** Si può approvare (→ programmato)? Ora futura, conformità e qualità "ok", nessun blocco. */
export function canApproveTg(post, now = Date.now()) {
  if (!post) return { ok: false, reason: "Post non trovato" };
  if (post.status === "inviato") return { ok: false, reason: "Già inviato" };
  if (!Number.isFinite(post.sendAt)) return { ok: false, reason: "Manca l'ora di uscita" };
  if (post.sendAt < now - 60e3) return { ok: false, reason: "L'ora di uscita è già passata: scegline una futura" };
  const blocks = TG_REVIEWERS.filter((r) => post.reviews?.[r.key]?.outcome === "blocca").map((r) => r.label);
  if (blocks.length) return { ok: false, reason: `Bloccato da: ${blocks.join(", ")}` };
  const notOk = TG_REVIEWERS.filter((r) => post.reviews?.[r.key]?.outcome !== "ok").map((r) => r.label);
  if (notOk.length) return { ok: false, reason: `Serve «ok» da: ${notOk.join(", ")}` };
  return { ok: true, reason: null };
}

/** Post da mandare adesso: programmati, approvati, ora arrivata. I troppo in ritardo vanno a parte. */
export function duePosts(posts, now = Date.now()) {
  const due = [];
  const late = [];
  for (const p of posts || []) {
    if (p?.status !== "programmato" || !p.approvedBy || !Number.isFinite(p.sendAt) || p.sendAt > now) continue;
    (now - p.sendAt > LATE_LIMIT_MS ? late : due).push(p);
  }
  due.sort((a, b) => a.sendAt - b.sendAt);
  return { due, late };
}

/**
 * Come mandarlo con la Bot API:
 *  - 0 foto  → sendMessage (+ pulsante)
 *  - 1 foto  → sendPhoto con didascalia (+ pulsante)
 *  - 2+ foto → sendMediaGroup (didascalia sulla prima; Telegram non mette pulsanti sugli album,
 *              quindi il pulsante parte come messaggio subito dopo)
 */
export function sendPlan(post) {
  const n = (post?.photoIds || []).length;
  const button = post?.buttonUrl ? { inline_keyboard: [[{ text: post.buttonLabel || "Apri", url: post.buttonUrl }]] } : null;
  const steps = [];
  if (n === 0 && post?.text) steps.push({ method: "sendMessage", text: post.text, button: post.poll ? null : button });
  else if (n === 1) steps.push({ method: "sendPhoto", photo: post.photoIds[0], caption: post.text, button: post.poll ? null : button });
  else if (n > 1) steps.push({ method: "sendMediaGroup", photos: post.photoIds, caption: post.text });
  // il sondaggio parte dopo il testo/foto; i sondaggi dei canali sono sempre anonimi
  if (post?.poll) steps.push({ method: "sendPoll", question: post.poll.question, options: post.poll.options });
  // pulsante a parte quando non può stare sul messaggio (album o sondaggio)
  if (button && (n > 1 || post?.poll)) steps.push({ method: "sendMessage", text: post.buttonLabel || "Apri", button });
  return steps;
}

/** Riepilogo per la pagina: quanti post per stato, prossimo in uscita, ultimi errori. */
export function tgSummary(posts, now = Date.now()) {
  const counts = Object.fromEntries(TG_STATUS_KEYS.map((k) => [k, 0]));
  for (const p of posts || []) counts[TG_STATUS_KEYS.includes(p.status) ? p.status : "bozza"]++;
  const next = (posts || []).filter((p) => p.status === "programmato" && p.sendAt >= now).sort((a, b) => a.sendAt - b.sendAt)[0] || null;
  return { counts, next };
}

// ── Landing ─────────────────────────────────────────────────────────────────
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Landing pulita: slug, testi, foto, destinazione (link d'invito Telegram del bot). */
export function normalizeLanding(input) {
  const errors = [];
  const slug = String(input?.slug || "").toLowerCase().trim();
  if (!SLUG_RE.test(slug)) errors.push("Indirizzo della landing: 3-40 caratteri, solo lettere minuscole, numeri e trattini");
  const target = str(input?.target, 300);
  if (target && !/^https:\/\/t\.me\/\S+$/i.test(target)) errors.push("La destinazione deve essere un link https://t.me/…");
  const landing = {
    slug,
    title: str(input?.title, 60),
    subtitle: str(input?.subtitle, 160),
    buttonLabel: str(input?.buttonLabel, 40) || "Entra nel canale",
    photoId: /^[a-f0-9]{16}$/.test(String(input?.photoId || "")) ? String(input.photoId) : null,
    target: target || "",
    active: !!input?.active,
  };
  if (landing.active && !landing.target) errors.push("Per attivarla serve la destinazione (link d'invito del canale)");
  return { ok: errors.length === 0, errors, landing };
}

/** Conteggi della landing dall'hash KV piatto v:{giorno} visite, c:{giorno} clic sul pulsante. */
export function landingStats(hash, today, days = 7) {
  const h = hash || {};
  const t = Date.parse(`${today}T12:00:00Z`);
  let visits = 0; let clicks = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(t - i * 86400e3).toISOString().slice(0, 10);
    visits += Number(h[`v:${d}`]) || 0;
    clicks += Number(h[`c:${d}`]) || 0;
  }
  return { visits, clicks, rate: visits ? clicks / visits : null, days };
}
