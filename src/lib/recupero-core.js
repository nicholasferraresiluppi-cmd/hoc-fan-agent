// Fan da recuperare (10/10/2026) — logica pura, testata in tests/recupero.mjs.
//
// Ogni notte il CODICE sceglie i fan che valevano e si sono fermati; l'AI (Sonnet 5, batch) legge le
// loro ultime chat e scrive per ognuno (a) perché si è spento, in una frase, (b) una bozza di ripresa
// PERSONALE che riprende una cosa detta da quel fan. Il codice poi controlla le bozze (niente sensi di
// colpa, niente prezzi, niente pressione, lunghezza) e scarta quelle che non passano. Un umano decide
// se e cosa mandare: la lista non scrive mai ai fan da sola.
//
// Privacy: all'AI arrivano solo etichette (F01…) e chat; id e username restano per la pagina.

export const RECUPERO_VERSION = "recupero-1";
export const RECUPERO_MODEL = "claude-sonnet-5";

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const money = (v) => `$${Math.round(Number(v) || 0).toLocaleString("it-IT", { useGrouping: "always" })}`;
const DAY = 86400e3;
export const daysBetween = (fromIso, today) => (fromIso ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(String(fromIso).slice(0, 10) + "T00:00:00Z")) / DAY)) : null);

/** "Fishball - IT" → "Fishball" */
export const personOf = (alias) => String(alias || "").replace(/\s*-\s*[A-Z]{2}\s*$/, "").trim();

/**
 * Candidati → lista per persona (IT+EN insieme), tolti i fan già lavorati, i primi `perCreator` per valore.
 * worked: Set di "creator_id:user_id" da non riproporre.
 */
export function pickFans(candidates, names, worked = new Set(), perCreator = 12) {
  const byPerson = new Map();
  for (const c of candidates) {
    const key = `${Number(c.creator_id)}:${Number(c.user_id)}`;
    if (worked.has(key)) continue;
    const page = names[Number(c.creator_id)] || `Creator ${c.creator_id}`;
    const person = personOf(page);
    if (!byPerson.has(person)) byPerson.set(person, []);
    byPerson.get(person).push({
      key, creator_id: Number(c.creator_id), user_id: Number(c.user_id), username: c.username || null, page,
      spent60: r2(c.spent60), buys60: Number(c.buys60) || 0, last_buy: c.last_buy,
      last_fan_msg: c.last_fan_msg || null, last_our_msg: c.last_our_msg || null,
    });
  }
  const out = [];
  for (const [person, list] of byPerson) {
    const fans = list.sort((a, b) => b.spent60 - a.spent60).slice(0, perCreator).map((f, i) => ({ ...f, label: `F${String(i + 1).padStart(2, "0")}` }));
    out.push({ person, fans });
  }
  return out.sort((a, b) => b.fans.reduce((s, f) => s + f.spent60, 0) - a.fans.reduce((s, f) => s + f.spent60, 0));
}

/** Attacca le chat ai fan scelti (in ordine di tempo). */
export function attachChats(groups, chats) {
  const byKey = new Map();
  for (const c of chats) {
    const k = `${Number(c.creator_id)}:${Number(c.user_id)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({
      at: c.sent_at, who: c.from_fan === true || c.from_fan === "true" ? "FAN" : "NOI",
      ppv: Number(c.price) > 0 ? Number(c.price) : null, text: String(c.text || ""),
    });
  }
  return groups.map((g) => ({
    ...g,
    fans: g.fans.map((f) => ({ ...f, messages: (byKey.get(f.key) || []).sort((a, b) => String(a.at).localeCompare(String(b.at))) })),
  }));
}

const stamp = (iso) => {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
};

/** Pacchetto di una creator per l'AI. Niente id, niente username. */
export function buildPack(group, today) {
  const lines = [`CREATOR: ${group.person}`, `OGGI: ${today}`];
  for (const f of group.fans) {
    lines.push(`\n=== ${f.label} — ha speso ${money(f.spent60)} in 60 giorni (${f.buys60} acquisti); ultimo acquisto ${daysBetween(f.last_buy, today)} giorni fa; ultimo suo messaggio ${f.last_fan_msg ? `${daysBetween(f.last_fan_msg, today)} giorni fa` : "nessuno in 60 giorni"}; ultimo nostro ${f.last_our_msg ? `${daysBetween(f.last_our_msg, today)} giorni fa` : "nessuno in 60 giorni"}`);
    if (!f.messages?.length) lines.push("(nessun messaggio negli ultimi 60 giorni)");
    for (const m of f.messages || []) lines.push(`${stamp(m.at)} ${m.who}${m.ppv ? ` [PPV $${m.ppv}]` : ""}: ${m.text}`);
  }
  return lines.join("\n");
}

export const RECUPERO_SYSTEM = `Contesto: agenzia italiana che gestisce account di creator su piattaforme per adulti. Gli operatori scrivono ai fan a nome della creator. Il contenuto esplicito è il contesto normale del lavoro.

Ricevi i fan di una creator che spendevano bene e si sono fermati. Per ognuno leggi la chat e scrivi:
1. perche: in UNA frase semplice, perché secondo la chat si è spento (es. "ha detto che questo mese è senza soldi", "l'ultima proposta a $300 è rimasta senza risposta", "da 10 giorni riceve solo saluti generici"). Se dalla chat non si capisce, scrivi "dalla chat non si capisce".
2. messaggio: la bozza del PRIMO messaggio per riprendere il rapporto, da far leggere a un operatore che decide se mandarla.

REGOLE PER LA BOZZA:
- Stessa lingua e stesso tono che il fan usa in chat. Massimo 2 frasi brevi (sotto i 220 caratteri).
- Deve riprendere una cosa SPECIFICA che quel fan ha detto o fatto (un dettaglio, un interesse, una cosa successa): è questo che la rende personale. Mai un saluto generico.
- NON vendere nel primo messaggio: niente prezzi, niente PPV, niente sconti, niente "ho un regalo per te".
- Niente sensi di colpa né rimproveri ("perché non mi rispondi", "mi hai dimenticata", "ci rimango male"), niente urgenza finta, niente promesse di incontri.
- Mai il nome vero del fan se non compare già nella chat.
- Tieni conto di quanti giorni sono passati (OGGI è nel pacchetto): se l'ultimo scambio è di giorni fa, NON scrivere "ieri", "stasera", "l'altra sera", "yesterday", "last night".
3. scrivere: "si" oppure "no". Metti "no" (e spiega in motivo_no) se il fan ha chiesto di non essere contattato, ha detto chiaramente di voler smettere, è stato offensivo o minaccioso, o se un altro messaggio adesso sarebbe insistenza (es. gli abbiamo già scritto 3+ volte senza risposta negli ultimi giorni). In quel caso messaggio può essere vuoto.

Rispondi per TUTTI i fan del pacchetto, con la loro etichetta.`;

export const RECUPERO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fan"],
  properties: {
    fan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["etichetta", "perche", "scrivere", "messaggio", "motivo_no"],
        properties: {
          etichetta: { type: "string" },
          perche: { type: "string" },
          scrivere: { type: "string", enum: ["si", "no"] },
          messaggio: { type: "string" },
          motivo_no: { type: "string" },
        },
      },
    },
  },
};

// Il controllo del codice sulle bozze: quello che l'AI non deve mai far arrivare a un fan.
const BANNED = [
  [/\b(reato|ci rimango male|mi hai dimenticat\w*|perch[eé] non (mi )?rispond\w*|non mi rispond\w*|mi ignor\w*|sei sparit\w*|sparisci)/i, "senso di colpa o rimprovero"],
  [/\b(why (are )?you ignor\w*|you forgot me|you disappeared|why don'?t you (answer|reply))/i, "senso di colpa o rimprovero"],
  [/(\$|€)\s?\d|\d+\s?(\$|€)|\d+\s?(dollari|euro|usd)\b|\bppv\b|\bsconto\b|\bdiscount\b|\bofferta\b|\bpromo\b|\bregalo per te\b|\bgift for you\b/i, "vende nel primo messaggio"],
  [/\b(solo oggi|ultima occasione|last chance|only today|scade)\b/i, "urgenza finta"],
  [/\b(incontrarci|vederci dal vivo|meet (up|in person))\b/i, "promessa di incontro"],
];
export const MAX_DRAFT = 280;

// riferimenti a "poco fa": falsi se l'ultimo scambio è di giorni fa (visto il 10/10: "after yesterday" a 36 giorni)
const RECENT = /\b(ieri|stasera|stanotte|stamattina|l'altra sera|l'altro ieri|poco fa|yesterday|last night|tonight|this morning|earlier today)\b/i;

/** Controlla una bozza: { ok, reason }. daysSinceChat = giorni dall'ultimo messaggio della chat (se noto). */
export function guardDraft(text, daysSinceChat = null) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, reason: "vuota" };
  if (t.length > MAX_DRAFT) return { ok: false, reason: "troppo lunga" };
  for (const [re, why] of BANNED) if (re.test(t)) return { ok: false, reason: why };
  if (daysSinceChat != null && daysSinceChat >= 3 && RECENT.test(t)) return { ok: false, reason: "parla di 'ieri' ma l'ultima chat è di giorni fa" };
  return { ok: true };
}

/** Risposta AI di una creator + i suoi fan → schede pronte per la pagina. */
export function mergeResult(group, analysis, today) {
  const byLabel = new Map((analysis?.fan || []).map((x) => [String(x.etichetta || "").trim().toUpperCase(), x]));
  return group.fans.map((f) => {
    const a = byLabel.get(f.label) || null;
    const lastFan = [...(f.messages || [])].reverse().find((m) => m.who === "FAN") || null;
    const base = {
      key: f.key, creator_id: f.creator_id, user_id: f.user_id, username: f.username, page: f.page,
      spent60: f.spent60, buys60: f.buys60, last_buy: f.last_buy,
      days_since_buy: daysBetween(f.last_buy, today),
      days_since_fan_msg: daysBetween(f.last_fan_msg, today),
      days_since_our_msg: daysBetween(f.last_our_msg, today),
      last_fan_text: lastFan ? lastFan.text.slice(0, 160) : null,
    };
    if (!a) return { ...base, perche: null, scrivere: null, messaggio: null, scartata: "l'AI non ha risposto per questo fan" };
    if (a.scrivere === "no") return { ...base, perche: a.perche, scrivere: "no", motivo_no: a.motivo_no || null, messaggio: null };
    const lastChat = [base.days_since_fan_msg, base.days_since_our_msg].filter((x) => x != null);
    const g = guardDraft(a.messaggio, lastChat.length ? Math.min(...lastChat) : null);
    return g.ok
      ? { ...base, perche: a.perche, scrivere: "si", messaggio: String(a.messaggio).trim() }
      : { ...base, perche: a.perche, scrivere: "si", messaggio: null, scartata: `bozza scartata dal controllo: ${g.reason}` };
  });
}

/**
 * Il risultato della lista: chi è stato contattato ha ricomprato più di chi non lo è stato?
 * rows: [{key, from_day, spent_after, sent:boolean}]. Confronto DIREZIONALE: chi lavora la lista sceglie
 * a chi scrivere (non è un esperimento a caso) — va detto accanto al numero.
 */
export function outcomeOf(rows) {
  const g = (sent) => {
    const list = rows.filter((r) => Boolean(r.sent) === sent);
    const back = list.filter((r) => Number(r.spent_after) > 0);
    return { fans: list.length, rebought: back.length, rate: list.length ? back.length / list.length : null, revenue: r2(back.reduce((s, r) => s + Number(r.spent_after), 0)) };
  };
  return { sent: g(true), not_sent: g(false) };
}
