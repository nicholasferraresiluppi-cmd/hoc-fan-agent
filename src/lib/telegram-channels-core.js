// Canali Telegram delle creator — logica pura (testata in tests/telegram-channels.mjs).
//
// Nato il 14/10/2026 da una richiesta di Nicholas: mappare i canali Telegram delle creator (i sales
// li inseriscono) e capire chi entra, da dove arriva e quanti passano a OnlyFans.
// Cosa si può sapere e cosa no (Bot API):
// - con il bot HOC amministratore del canale arrivano in tempo reale le entrate e le uscite
//   (update chat_member) e, per chi entra da un link d'invito creato dal bot, QUALE link ha usato;
// - l'elenco degli iscritti che c'erano prima del bot NON si recupera (la Bot API non lo dà);
// - il passaggio a OnlyFans non si vede da Telegram: si misura col link di tracciamento OF
//   pubblicato nel canale (clic e abbonati da onlyfans.links_stats).
// Privacy: degli iscritti si tiene solo un HMAC dell'id Telegram (serve ad attribuire l'uscita al
// link da cui la persona era entrata). Niente username, niente nomi: i numeri escono aggregati.

export const TG_VERSION = "tg-1";

// Fonti da cui si crea un link d'invito. Il nome del link su Telegram ha un tetto di 32 caratteri.
export const SOURCES = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  reddit: "Reddit",
  onlyfans: "OnlyFans",
  s4s: "S4S",
  ads: "Pubblicità",
  altro: "Altro",
};
// Entrate non da un nostro link: chiavi riservate nelle statistiche
export const NO_LINK = "_diretto"; // dal nome pubblico (@canale) o senza link
export const OTHER_LINK = "_altro"; // da un link d'invito che non ha creato il bot (es. quello principale)
export const FOLDER = "_cartella"; // da una cartella condivisa
export const BEFORE_BOT = "_prima"; // uscita di chi era entrato prima del bot: senza fonte
export const RESERVED_LABELS = { [NO_LINK]: "Senza link (ricerca o @nome)", [OTHER_LINK]: "Altri link d'invito", [FOLDER]: "Cartella condivisa" };

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

/**
 * Cosa ha incollato il sales: https://t.me/nome, t.me/nome, @nome, nome, t.me/+HASH, t.me/joinchat/HASH,
 * tg://resolve?domain=nome. → { handle } per i canali pubblici, { invite } per quelli privati, null se illeggibile.
 */
export function parseChannelInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let m = /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/(?:\+|joinchat\/)([A-Za-z0-9_-]{8,})\/?$/i.exec(s);
  if (m) return { invite: m[1] };
  m = /^tg:\/\/resolve\?domain=([A-Za-z0-9_]{4,32})/i.exec(s);
  if (m) return { handle: m[1].toLowerCase() };
  m = /^(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/(?:s\/)?([A-Za-z0-9_]{4,32})\/?(?:\?.*)?$/i.exec(s);
  if (m && !/^(joinchat|addstickers|share|proxy|socks)$/i.test(m[1])) return { handle: m[1].toLowerCase() };
  m = /^@?([A-Za-z][A-Za-z0-9_]{3,31})$/.exec(s);
  if (m) return { handle: m[1].toLowerCase() };
  return null;
}

export const channelUrl = (p) => (p?.handle ? `https://t.me/${p.handle}` : p?.invite ? `https://t.me/+${p.invite}` : null);
export const sameChannel = (a, b) => Boolean((a?.handle && a.handle === b?.handle) || (a?.invite && a.invite === b?.invite));

/** Valida i campi del form. → { ok, value } | { ok:false, error } */
export function cleanChannel(body) {
  const creator = clip(body?.creator, 80);
  if (!creator) return { ok: false, error: "Scegli la creator" };
  const parsed = parseChannelInput(body?.url);
  if (!parsed) return { ok: false, error: "Il link del canale non si legge: incolla t.me/nome, @nome o il link d'invito t.me/+…" };
  const kind = body?.kind === "gruppo" ? "gruppo" : "canale";
  return {
    ok: true,
    value: {
      creator,
      handle: parsed.handle || null,
      invite: parsed.invite || null,
      url: channelUrl(parsed),
      kind,
      manager: clip(body?.manager, 80),
      note: clip(body?.note, 300),
      of_link: clip(body?.of_link, 200),
    },
  };
}

/** Nome del link d'invito su Telegram (max 32): "Instagram · bio" → visibile agli admin del canale. */
export function inviteLinkName(source, label) {
  const base = SOURCES[source] || SOURCES.altro;
  const extra = clip(label, 40);
  return (extra ? `${base} · ${extra}` : base).slice(0, 32);
}

const isIn = (m) => {
  if (!m) return false;
  if (m.status === "restricted") return m.is_member !== false;
  return m.status === "member" || m.status === "administrator" || m.status === "creator";
};

/**
 * Un update chat_member → { type: "join" | "leave", key } o null se non è un'entrata/uscita
 * (es. promozione ad admin). `ourLinks` = [{ key, url }] dei link creati dal bot per quel canale.
 */
export function classifyMemberUpdate(cm, ourLinks = []) {
  if (!cm?.old_chat_member || !cm?.new_chat_member) return null;
  const was = isIn(cm.old_chat_member);
  const now = isIn(cm.new_chat_member);
  if (was === now) return null;
  if (!now) return { type: "leave", key: null };
  if (cm.via_chat_folder_invite_link) return { type: "join", key: FOLDER };
  const url = cm.invite_link?.invite_link;
  if (!url) return { type: "join", key: NO_LINK };
  const hit = ourLinks.find((l) => l.url === url);
  return { type: "join", key: hit ? hit.key : OTHER_LINK };
}

/** Stato del bot nel canale da un update my_chat_member / getChatMember. */
export function botStatusOf(member) {
  if (!member) return { status: "fuori", can_invite: false };
  if (member.status === "administrator" || member.status === "creator") return { status: "admin", can_invite: member.can_invite_users !== false };
  if (member.status === "left" || member.status === "kicked") return { status: "fuori", can_invite: false };
  return { status: "membro", can_invite: false };
}

/** Giorno di Roma (YYYY-MM-DD) di un timestamp unix in secondi. */
export function romeDay(unixSec) {
  return new Date(unixSec * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

/**
 * Statistiche del canale dall'hash KV piatto: j:{key} entrate, l:{key} uscite, jd:{giorno}, ld:{giorno}.
 * → { bySource: [{ key, label, joins, leaves, stay, stay_rate }], days: [{ d, joins, leaves }], totals }
 * `links` = [{ key, name }] per dare il nome alle chiavi; giorni = ultimi `dayCount` fino a `today`.
 */
export function summarizeStats(hash, links = [], { today, dayCount = 30 } = {}) {
  const h = hash || {};
  const n = (k) => Number(h[k]) || 0;
  const keys = new Set();
  for (const f of Object.keys(h)) {
    const m = /^(j|l):(.+)$/.exec(f);
    if (m && m[2] !== BEFORE_BOT) keys.add(m[2]);
  }
  for (const l of links) keys.add(l.key);
  const nameOf = (k) => RESERVED_LABELS[k] || links.find((l) => l.key === k)?.name || "Link tolto";
  const bySource = [...keys].map((key) => {
    const joins = n(`j:${key}`);
    const leaves = Math.min(n(`l:${key}`), joins);
    return { key, label: nameOf(key), joins, leaves, stay: joins - leaves, stay_rate: joins ? (joins - leaves) / joins : null };
  }).sort((a, b) => b.joins - a.joins || a.label.localeCompare(b.label));
  const days = [];
  if (today) {
    const t = Date.parse(`${today}T12:00:00Z`);
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(t - i * 86400e3).toISOString().slice(0, 10);
      days.push({ d, joins: n(`jd:${d}`), leaves: n(`ld:${d}`) });
    }
  }
  const joins = bySource.reduce((s, r) => s + r.joins, 0);
  // le uscite di chi era entrato prima del bot non hanno una fonte: contano nel totale, non nelle righe
  const leaves = n(`l:${BEFORE_BOT}`);
  const tracked = bySource.reduce((s, r) => s + r.leaves, 0);
  return { bySource, days, totals: { joins, leaves: tracked + leaves, leaves_before_bot: leaves } };
}

/** Serie degli iscritti (un punto al giorno, l'ultimo vince), tenuta a 120 giorni. */
export function pushMemberCount(hist, day, count) {
  const list = (Array.isArray(hist) ? hist : []).filter((p) => p.d !== day);
  list.push({ d: day, n: count });
  return list.sort((a, b) => a.d.localeCompare(b.d)).slice(-120);
}

/** Variazione degli iscritti su N giorni dalla serie (null se manca il punto di partenza). */
export function memberDelta(hist, days) {
  if (!Array.isArray(hist) || hist.length < 2) return null;
  const last = hist[hist.length - 1];
  const target = new Date(Date.parse(`${last.d}T12:00:00Z`) - days * 86400e3).toISOString().slice(0, 10);
  const start = [...hist].reverse().find((p) => p.d <= target);
  return start ? last.n - start.n : null;
}
