// Studio social — EDITORIALE (logica pura, 16/10/2026).
//
// Decisione di Nicholas: «dobbiamo avere sempre un editoriale davanti, che porti sempre degli
// storytelling». Ogni settimana è UNA storia (arco): premessa → svolta → finale aperto. Instagram è la
// faccia pubblica (i reel e le storie), Telegram il dietro le quinte («quello che su IG non posso
// raccontare»), OnlyFans il pezzo più privato della stessa storia. Ogni reel e ogni messaggio del canale
// è un pezzo dell'arco, con un giorno e un ruolo: la continuità non dipende dalla memoria di nessuno.
//
// Regole che lo strumento controlla:
//  - almeno UN messaggio Telegram al giorno con il link OnlyFans (decisione di Nicholas, 16/10);
//  - il canale è un broadcast: chi legge non risponde → l'interazione è fatta di sondaggi e reazioni.

export const EDITORIAL_VERSION = "edit-1";

export const ARC_STATUSES = [
  { key: "bozza", label: "Bozza" },
  { key: "approvata", label: "Approvata" },
];

// Momenti del canale (orari di partenza, si cambiano sul singolo post). Frequenza di partenza decisa il
// 16/10: 3 al giorno in settimana, 2 nel weekend; poi la decidono i numeri del report del lunedì.
export const TG_SLOTS = [
  { key: "mattina", label: "Mattina", time: "09:30", hint: "Vita vera: una foto non da set, una frase" },
  { key: "pomeriggio", label: "Pomeriggio", time: "15:00", hint: "Un pezzo della storia della settimana, o un sondaggio" },
  { key: "sera", label: "Sera", time: "21:30", hint: "Il contenuto più caldo e il link OnlyFans" },
];
export const TG_ROLES = [
  { key: "vita", label: "Vita vera" },
  { key: "storia", label: "Pezzo di storia" },
  { key: "sondaggio", label: "Sondaggio" },
  { key: "dietro", label: "Dietro le quinte" },
  { key: "richiamo", label: "Richiamo OnlyFans" },
  { key: "riassunto", label: "Riassunto" },
  { key: "benvenuto", label: "Benvenuto (fissato)" },
];
export const IG_ROLES = [
  { key: "apertura", label: "Apre la storia" },
  { key: "svolta", label: "Svolta" },
  { key: "finale", label: "Finale aperto" },
  { key: "ricorrente", label: "Appuntamento fisso" },
];

const str = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** Lunedì della settimana di un giorno YYYY-MM-DD. */
export function weekStartOf(day) {
  if (!isDay(day)) return null;
  const d = new Date(`${day}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // 0 = lunedì
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

export function weekDays(monday) {
  if (!isDay(monday)) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${monday}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function normalizeArc(input, prev = null) {
  const errors = [];
  const weekStart = weekStartOf(input?.weekStart || prev?.weekStart);
  if (!weekStart) errors.push("Scegli la settimana");
  const title = str(input?.title ?? prev?.title, 80);
  if (!title) errors.push("Dai un titolo alla storia della settimana");
  const arc = {
    id: str(input?.id, 40) || prev?.id || null,
    weekStart,
    title,
    premessa: str(input?.premessa ?? prev?.premessa, 600),
    svolta: str(input?.svolta ?? prev?.svolta, 600),
    finale: str(input?.finale ?? prev?.finale, 600),
    ponte: str(input?.ponte ?? prev?.ponte, 600), // cosa lega Instagram → Telegram → OnlyFans questa settimana
    status: ARC_STATUSES.some((s) => s.key === input?.status) ? input.status : prev?.status || "bozza",
  };
  return { ok: errors.length === 0, errors, arc };
}

/** Il post porta il link OnlyFans? (pulsante o link nel testo). */
export function hasOfLink(post) {
  const re = /https:\/\/(www\.)?onlyfans\.com\/\S+/i;
  return re.test(post?.buttonUrl || "") || re.test(post?.text || "");
}

/** Giorno di Roma (YYYY-MM-DD) di un istante in millisecondi. */
export function romeDayOf(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

/**
 * Giorni senza link OnlyFans su Telegram. Contano i post non annullati (bozza, programmato, inviato):
 * una bozza col link vale come «previsto», e la pagina dice se è ancora da approvare.
 * → [{ day, planned: bool }]  (planned = c'è almeno un post quel giorno, ma nessuno col link)
 */
export function dailyLinkGaps(posts, days) {
  const byDay = new Map(days.map((d) => [d, []]));
  for (const p of posts || []) {
    if (p.status === "annullato" || p.status === "errore") continue;
    const d = romeDayOf(p.sendAt);
    if (byDay.has(d)) byDay.get(d).push(p);
  }
  return days.filter((d) => !byDay.get(d).some(hasOfLink)).map((d) => ({ day: d, planned: byDay.get(d).length > 0 }));
}

/** Momento del giorno di un post dall'ora di Roma (per metterlo nella riga giusta della griglia). */
export function slotOfTime(ms) {
  if (!Number.isFinite(ms)) return null;
  const h = Number(new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }));
  return h < 12 ? "mattina" : h < 18 ? "pomeriggio" : "sera";
}

/**
 * Griglia della settimana: per ogni giorno i contenuti Instagram e i post Telegram per momento.
 * I post con `slot` esplicito vanno lì; gli altri dove cade l'ora.
 */
export function editorialGrid(days, items, posts) {
  return days.map((day) => ({
    day,
    ig: (items || []).filter((it) => it.day === day && it.status !== "scartato"),
    tg: Object.fromEntries(TG_SLOTS.map((s) => [s.key, (posts || []).filter((p) => p.status !== "annullato" && romeDayOf(p.sendAt) === day && (p.slot || slotOfTime(p.sendAt)) === s.key)])),
  }));
}
