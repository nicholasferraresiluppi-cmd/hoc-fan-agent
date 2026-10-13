// Supervisor account social — logica pura (niente I/O): modello, normalizzazione,
// conteggi della panoramica, anomalie, mappatura delle colonne per l'import CSV.
// Sostituisce lo strumento "Automation › Supervisor" esterno (ott 2026): account
// social per creator e alterego, telefoni dei publisher, caselle mail.
//
// Regola dei segreti: password, PIN, PUK ecc. vivono SOLO cifrati nello store
// (supervisor-store.js) e non escono mai nelle liste: qui la logica vede soltanto
// `secrets: { campo: true }` (= impostato), mai il valore.

export const PLATFORMS = ["instagram", "tiktok", "twitter", "reddit", "threads", "facebook", "other"];
export const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok", twitter: "X / Twitter", reddit: "Reddit", threads: "Threads", facebook: "Facebook", other: "Altro" };
export const PLATFORM_SHORT = { instagram: "IG", tiktok: "TT", twitter: "X", reddit: "RD", threads: "TH", facebook: "FB", other: "—" };

export const ENUMS = {
  platformStatus: { ok: "OK", suspended: "Sospeso", not_recommended: "Non raccomandato" },
  schedulingStatus: { active: "Attivo", paused: "In pausa" },
  creationStatus: { done: "Creato", to_do: "Da creare", in_progress: "In creazione", warming: "In riscaldamento" },
  ownerType: { agency: "Agenzia", creator: "Creator" },
  postingType: { manual: "Manuale", automatic: "Automatico" },
  deviceUsage: { physical: "Fisico", remote: "Remoto" },
  contentType: { original: "Originale", manual: "Manuale", ai: "AI" },
  deviceType: { iphone: "iPhone", android: "Android", other: "Altro" },
};

// Campi segreti per tipo di record (cifrati a riposo, rivelati uno alla volta e registrati)
export const SECRET_FIELDS = {
  account: { password: "Password account", emailPassword: "Password email" },
  device: { icloudPassword: "Password iCloud", pin: "PIN", puk: "PUK", phonePassword: "Codice telefono" },
  mailbox: { password: "Password" },
};

export const KINDS = ["account", "device", "mailbox"];

const str = (v) => (v == null ? "" : String(v).trim());
const nullable = (v) => str(v) || null;
const bool = (v) => v === true || /^(1|true|yes|si|sì|x|✓|checked|y)$/i.test(str(v));
export const normEmail = (v) => str(v).toLowerCase() || null;
export const normHandle = (v) => str(v).replace(/^@/, "").toLowerCase();
export const normPhone = (v) => {
  const s = str(v);
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (digits.replace(/\D/g, "").length < 6) return s; // non un numero: lascia il testo com'è
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (/^3\d{8,9}$/.test(digits)) return "+39" + digits; // cellulare italiano senza prefisso
  return digits;
};

// Riconosce un valore enum da etichette varie ("Not Recommended", "Suspended", "IG"…)
const ALIASES = {
  platform: { ig: "instagram", insta: "instagram", instagram: "instagram", tt: "tiktok", tiktok: "tiktok", "tik tok": "tiktok", x: "twitter", twitter: "twitter", reddit: "reddit", threads: "threads", fb: "facebook", facebook: "facebook" },
  platformStatus: { ok: "ok", active: "ok", attivo: "ok", suspended: "suspended", sospeso: "suspended", banned: "suspended", ban: "suspended", "not recommended": "not_recommended", "non raccomandato": "not_recommended", "not_recommended": "not_recommended", shadowban: "not_recommended" },
  schedulingStatus: { active: "active", attivo: "active", paused: "paused", inactive: "paused", "in pausa": "paused", pausa: "paused" },
  creationStatus: { done: "done", created: "done", creato: "done", "to do": "to_do", todo: "to_do", "da creare": "to_do", "in progress": "in_progress", "in creazione": "in_progress", warming: "warming", "in riscaldamento": "warming" },
  ownerType: { agency: "agency", agenzia: "agency", creator: "creator" },
  postingType: { manual: "manual", manuale: "manual", automatic: "automatic", automatico: "automatic", auto: "automatic", scheduled: "automatic" },
  deviceUsage: { physical: "physical", fisico: "physical", remote: "remote", remoto: "remote" },
  contentType: { original: "original", originale: "original", manual: "manual", manuale: "manual", ai: "ai" },
  deviceType: { iphone: "iphone", ios: "iphone", android: "android" },
};
export function enumValue(field, raw, fallback = null) {
  const s = str(raw).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!s) return fallback;
  const hit = ALIASES[field]?.[s];
  if (hit) return hit;
  const valid = field === "platform" ? PLATFORMS : Object.keys(ENUMS[field] || {});
  const key = s.replace(/ /g, "_");
  if (valid.includes(key)) return key;
  return field === "platform" ? "other" : fallback;
}

/** Lingua: codice a 2 lettere maiuscolo ("it", "🇮🇹", "Italiano" → IT) */
const FLAG_LANG = { "🇮🇹": "IT", "🇬🇧": "EN", "🇺🇸": "EN", "🇪🇸": "ES", "🇩🇪": "DE", "🇫🇷": "FR" };
const NAME_LANG = { italiano: "IT", italian: "IT", inglese: "EN", english: "EN", spagnolo: "ES", spanish: "ES", tedesco: "DE", german: "DE", francese: "FR", french: "FR" };
export function normLang(raw) {
  const s = str(raw);
  if (!s) return null;
  for (const [f, l] of Object.entries(FLAG_LANG)) if (s.includes(f)) return l;
  const low = s.toLowerCase();
  if (NAME_LANG[low]) return NAME_LANG[low];
  return /^[a-z]{2}$/i.test(s) ? s.toUpperCase() : s.slice(0, 12);
}

const list = (v) => (Array.isArray(v) ? v : str(v).split(/[,;\n]+/)).map(str).filter(Boolean);
const uniq = (a) => [...new Set(a)];

/**
 * Normalizza un record in arrivo dal form o dall'import. `prev` = record esistente
 * (in modifica): i campi assenti dall'input restano quelli di prima.
 * I segreti NON passano di qui (li gestisce lo store).
 */
export function normalizeRecord(kind, input = {}, prev = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const pick = (k, fn) => (has(k) ? fn(input[k]) : prev[k] ?? fn(undefined));
  if (kind === "account") {
    const rec = {
      username: pick("username", (v) => normHandle(v)),
      platform: pick("platform", (v) => enumValue("platform", v, "instagram")),
      url: pick("url", nullable),
      language: pick("language", normLang),
      creator: pick("creator", nullable),
      alterego: pick("alterego", nullable),
      ownerType: pick("ownerType", (v) => enumValue("ownerType", v, "agency")),
      postingType: pick("postingType", (v) => enumValue("postingType", v, "manual")),
      deviceUsage: pick("deviceUsage", (v) => enumValue("deviceUsage", v, null)),
      platformStatus: pick("platformStatus", (v) => enumValue("platformStatus", v, "ok")),
      schedulingStatus: pick("schedulingStatus", (v) => enumValue("schedulingStatus", v, "active")),
      creationStatus: pick("creationStatus", (v) => enumValue("creationStatus", v, "done")),
      contentType: pick("contentType", (v) => enumValue("contentType", v, null)),
      deviceId: pick("deviceId", nullable),
      linkedAccountId: pick("linkedAccountId", nullable),
      linkInBio: pick("linkInBio", nullable),
      email: pick("email", normEmail),
      phone: pick("phone", normPhone),
      onlyfansUsername: pick("onlyfansUsername", (v) => normHandle(v) || null),
      scrapingEnabled: pick("scrapingEnabled", bool),
      schedulingEnabled: pick("schedulingEnabled", bool),
      retired: pick("retired", bool),
      notes: pick("notes", nullable),
    };
    if (!rec.url && rec.username) rec.url = profileUrl(rec.platform, rec.username);
    return rec;
  }
  if (kind === "device") {
    return {
      name: pick("name", str),
      type: pick("type", (v) => enumValue("deviceType", v, "iphone")),
      usageMode: pick("usageMode", (v) => enumValue("deviceUsage", v, "physical")),
      publishers: pick("publishers", (v) => uniq(list(v))),
      imei: pick("imei", (v) => nullable(v)?.replace(/\s+/g, "") || null),
      icloudEmail: pick("icloudEmail", nullable),
      phone: pick("phone", normPhone),
      model: pick("model", nullable),
      notes: pick("notes", nullable),
    };
  }
  if (kind === "mailbox") {
    return {
      email: pick("email", normEmail),
      phone: pick("phone", normPhone),
      placements: pick("placements", (v) => uniq(list(v))),
      notes: pick("notes", nullable),
    };
  }
  throw new Error(`tipo sconosciuto: ${kind}`);
}

export function profileUrl(platform, username) {
  const u = normHandle(username);
  if (!u) return null;
  return {
    instagram: `https://www.instagram.com/${u}/`,
    tiktok: `https://www.tiktok.com/@${u}`,
    twitter: `https://x.com/${u}`,
    reddit: `https://www.reddit.com/user/${u}`,
    threads: `https://www.threads.net/@${u}`,
  }[platform] || null;
}

/** Errori bloccanti (array di frasi). `all` = gli altri record dello stesso tipo, per i doppioni. */
export function validateRecord(kind, rec, all = [], selfId = null) {
  const e = [];
  const others = all.filter((r) => r.id !== selfId);
  if (kind === "account") {
    if (!rec.username) e.push("Serve il nome utente dell'account");
    if (rec.username && others.some((r) => r.platform === rec.platform && r.username === rec.username)) {
      e.push(`Esiste già un account ${PLATFORM_LABEL[rec.platform]} @${rec.username}`);
    }
    if (rec.linkedAccountId && rec.linkedAccountId === selfId) e.push("Un account non può essere collegato a se stesso");
  }
  if (kind === "device") {
    if (!rec.name) e.push("Serve il nome del telefono (es. iph-pub3)");
    if (rec.name && others.some((r) => r.name.toLowerCase() === rec.name.toLowerCase())) e.push(`Esiste già un telefono «${rec.name}»`);
  }
  if (kind === "mailbox") {
    if (!rec.email || !rec.email.includes("@")) e.push("Serve un indirizzo email valido");
    if (rec.email && others.some((r) => r.email === rec.email)) e.push(`La casella ${rec.email} c'è già`);
  }
  return e;
}

// ── Viste derivate ──────────────────────────────────────────────────────────

/** Credenziali che un telefono deve avere (come "Missing credentials" dell'originale). */
export const DEVICE_REQUIRED = [
  ["imei", "IMEI"], ["model", "modello"], ["icloudEmail", "email iCloud"], ["phone", "numero"], ["icloudPassword", "password iCloud", true],
];
export function deviceMissing(d) {
  return DEVICE_REQUIRED.filter(([k, , secret]) => (secret ? !d.secrets?.[k] : !d[k])).map(([, label]) => label);
}

/** Un account conta come "attivo" se non è ritirato e la creazione è finita. */
export const isLive = (a) => !a.retired && (a.creationStatus || "done") === "done";

/**
 * Arricchisce i record con le relazioni calcolate (mai salvate: una sola fonte):
 * account → publisher dal telefono, casella mail abbinata; telefono → account; mail → account.
 */
export function buildView({ accounts = [], devices = [], mailboxes = [] }) {
  const devById = new Map(devices.map((d) => [d.id, d]));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const mailByEmail = new Map(mailboxes.map((m) => [m.email, m]));
  const accsByDevice = new Map();
  const accsByEmail = new Map();
  for (const a of accounts) {
    if (a.deviceId) accsByDevice.set(a.deviceId, [...(accsByDevice.get(a.deviceId) || []), a]);
    if (a.email) accsByEmail.set(a.email, [...(accsByEmail.get(a.email) || []), a]);
  }
  const ref = (a) => ({ id: a.id, username: a.username, platform: a.platform, language: a.language, retired: a.retired });
  const dupKey = (a) => `${a.platform}:${a.username}`;
  const dupCount = new Map();
  for (const a of accounts) dupCount.set(dupKey(a), (dupCount.get(dupKey(a)) || 0) + 1);

  const A = accounts.map((a) => {
    const dev = a.deviceId ? devById.get(a.deviceId) : null;
    const linked = a.linkedAccountId ? accById.get(a.linkedAccountId) : null;
    return {
      ...a,
      device: dev ? { id: dev.id, name: dev.name, usageMode: dev.usageMode } : null,
      publishers: dev?.publishers || [],
      linkedAccount: linked ? ref(linked) : null,
      mailboxId: a.email ? mailByEmail.get(a.email)?.id || null : null,
      duplicate: dupCount.get(dupKey(a)) > 1,
    };
  });
  const D = devices.map((d) => {
    const accs = (accsByDevice.get(d.id) || []).filter((a) => !a.retired);
    return {
      ...d,
      accounts: accs.map(ref),
      accountCount: accs.length,
      countByPlatform: accs.reduce((m, a) => ({ ...m, [a.platform]: (m[a.platform] || 0) + 1 }), {}),
      missing: deviceMissing(d),
    };
  });
  const M = mailboxes.map((m) => ({ ...m, accounts: (accsByEmail.get(m.email) || []).map(ref) }));
  return { accounts: A, devices: D, mailboxes: M };
}

/** Numeri della panoramica: totali + griglia piattaforma × proprietario × stato. */
export function overviewStats(view) {
  const acc = view.accounts;
  const live = acc.filter(isLive);
  const grid = {};
  for (const a of live) {
    const k = `${a.platform}|${a.ownerType}|${a.platformStatus}`;
    grid[k] = (grid[k] || 0) + 1;
  }
  const platforms = PLATFORMS.filter((p) => live.some((a) => a.platform === p));
  return {
    activeTotal: live.filter((a) => a.platformStatus === "ok").length,
    liveTotal: live.length,
    creation: {
      to_do: acc.filter((a) => !a.retired && a.creationStatus === "to_do").length,
      in_progress: acc.filter((a) => !a.retired && a.creationStatus === "in_progress").length,
      warming: acc.filter((a) => !a.retired && a.creationStatus === "warming").length,
    },
    duplicates: acc.filter((a) => a.duplicate).length,
    retired: acc.filter((a) => a.retired).length,
    platforms,
    grid,
    devices: {
      total: view.devices.length,
      assigned: view.devices.filter((d) => d.publishers.length > 0).length,
      unassigned: view.devices.filter((d) => d.publishers.length === 0).length,
      missingCredentials: view.devices.filter((d) => d.missing.length > 0).length,
    },
    mailboxes: view.mailboxes.length,
  };
}

/**
 * Cose da sistemare, trovate dal sistema (non da chi guarda): ognuna con quante
 * righe tocca e il filtro che le mostra. Ordine = gravità.
 */
export function findIssues(view) {
  const live = view.accounts.filter(isLive);
  const out = [];
  const add = (code, severity, title, items, target) => { if (items.length) out.push({ code, severity, title, count: items.length, ids: items.map((x) => x.id), target }); };

  add("dup", "critical", "Account doppi (stessa piattaforma e nome utente)", view.accounts.filter((a) => a.duplicate), "account");
  add("no-device", "warning", "Account attivi gestiti dall'agenzia senza telefono assegnato",
    live.filter((a) => a.ownerType === "agency" && a.platformStatus === "ok" && a.deviceUsage !== "remote" && !a.deviceId), "account");
  add("no-password", "warning", "Account attivi senza password salvata", live.filter((a) => a.platformStatus === "ok" && !a.secrets?.password), "account");
  add("no-creator", "warning", "Account senza creator", view.accounts.filter((a) => !a.retired && !a.creator), "account");
  add("suspended-scheduled", "warning", "Account sospesi ma ancora in programmazione",
    live.filter((a) => a.platformStatus === "suspended" && a.schedulingStatus === "active"), "account");
  const emailUse = new Map();
  for (const a of live) if (a.email) emailUse.set(a.email, [...(emailUse.get(a.email) || []), a]);
  add("shared-email", "info", "Account che condividono la stessa email sulla stessa piattaforma",
    [...emailUse.values()].flatMap((g) => {
      const byPlat = new Map();
      for (const a of g) byPlat.set(a.platform, [...(byPlat.get(a.platform) || []), a]);
      return [...byPlat.values()].filter((x) => x.length > 1).flat();
    }), "account");
  add("no-mailbox", "info", "Account con un'email che non è tra le caselle", live.filter((a) => a.email && !a.mailboxId), "account");
  add("dev-missing", "warning", "Telefoni con credenziali mancanti", view.devices.filter((d) => d.missing.length), "device");
  add("dev-idle", "info", "Telefoni assegnati a un publisher ma senza account", view.devices.filter((d) => d.publishers.length && !d.accountCount), "device");
  add("dev-orphan", "info", "Telefoni con account ma senza publisher", view.devices.filter((d) => !d.publishers.length && d.accountCount), "device");
  const phoneUse = new Map();
  for (const m of view.mailboxes) if (m.phone) phoneUse.set(m.phone, [...(phoneUse.get(m.phone) || []), m]);
  add("mail-shared-phone", "info", "Caselle mail registrate con lo stesso numero", [...phoneUse.values()].filter((g) => g.length > 1).flat(), "mailbox");
  add("mail-unused", "info", "Caselle mail non usate da nessun account", view.mailboxes.filter((m) => !m.accounts.length), "mailbox");
  return out;
}

/** Link in bio: chi punta dove (raggruppati per dominio+percorso, senza query). */
export function linkGroups(view) {
  const groups = new Map();
  for (const a of view.accounts.filter(isLive)) {
    const key = a.linkInBio ? cleanLink(a.linkInBio) : "";
    if (!groups.has(key)) groups.set(key, { link: key || null, raw: a.linkInBio || null, accounts: [] });
    groups.get(key).accounts.push(a);
  }
  return [...groups.values()].sort((x, y) => (x.link ? 0 : 1) - (y.link ? 0 : 1) || y.accounts.length - x.accounts.length);
}
export function cleanLink(u) {
  const s = str(u);
  if (!s) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return (url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch { return s.toLowerCase(); }
}

// ── Import CSV ──────────────────────────────────────────────────────────────
// Le intestazioni dello strumento di prima (in inglese) e quelle italiane mappano
// sui campi. Le colonne non riconosciute si ignorano e si dichiarano.

const HEADER_MAP = {
  account: {
    username: ["name", "username", "nome", "nome utente", "account", "handle"],
    platform: ["platform", "piattaforma", "social"],
    url: ["account url", "url", "link account", "profilo"],
    language: ["language", "lingua", "f", "flag", "lang"],
    creator: ["creator", "creator name", "onlyfans profiles", "modella"],
    alterego: ["alteregos", "alterego", "alter ego"],
    ownerType: ["owner type", "proprietario", "owner"],
    postingType: ["posting type", "tipo pubblicazione"],
    deviceUsage: ["device usage mode", "device usage", "uso telefono"],
    platformStatus: ["platform status", "stato piattaforma", "stato"],
    schedulingStatus: ["scheduling status", "stato programmazione"],
    creationStatus: ["creation status", "stato creazione"],
    contentType: ["content type", "tipo contenuto", "content"],
    deviceId: ["assigned device", "device", "telefono", "telefono assegnato"],
    linkedAccountId: ["ig linked account", "linked account", "account collegato"],
    linkInBio: ["link in bio", "link bio"],
    email: ["email", "mail", "e-mail"],
    phone: ["phone number", "phone", "numero", "telefono numero", "numero di telefono"],
    onlyfansUsername: ["onlyfans username", "of username"],
    scrapingEnabled: ["scraping enabled", "scraping"],
    schedulingEnabled: ["scheduling enable", "scheduling enabled"],
    retired: ["retired", "ritirato"],
    notes: ["notes", "note"],
    "secret:password": ["account password (plaintext)", "account password", "password", "password account"],
    "secret:emailPassword": ["email password (plaintext)", "email password", "password email"],
  },
  device: {
    name: ["name", "nome", "name & info", "device"],
    type: ["device type", "tipo", "type"],
    usageMode: ["usage mode", "uso", "device usage mode"],
    publishers: ["assigned publisher", "publisher", "publishers"],
    imei: ["imei"],
    icloudEmail: ["icloud email", "icloud mail", "email icloud"],
    phone: ["phone number", "numero", "phone"],
    model: ["model", "modello"],
    notes: ["notes", "note"],
    "secret:icloudPassword": ["icloud password", "icloud psw", "password icloud"],
    "secret:pin": ["pin"],
    "secret:puk": ["puk"],
    "secret:phonePassword": ["phone password", "codice telefono", "password telefono"],
  },
  mailbox: {
    email: ["email", "mail", "e-mail", "indirizzo"],
    phone: ["numero", "phone", "phone number", "telefono"],
    placements: ["placement 1", "placement 2", "placement 3", "placements", "placement"],
    notes: ["notes", "note"],
    "secret:password": ["password", "psw"],
  },
};
const normHeader = (h) => str(h).toLowerCase().replace(/\s+/g, " ").replace(/[ⓘ]/g, "").trim();

/** { mapping: {colonna → campo}, ignored: [colonne] } */
export function mapHeaders(kind, headers) {
  const map = HEADER_MAP[kind];
  const mapping = {};
  const ignored = [];
  for (const h of headers) {
    const n = normHeader(h);
    const field = Object.keys(map).find((f) => map[f].includes(n));
    if (field) mapping[h] = field; else if (n) ignored.push(h);
  }
  return { mapping, ignored };
}

/**
 * Righe del foglio → { fields, secrets, refs } pronte per lo store.
 * `refs` sono i riferimenti per nome (telefono, account collegato) che lo store
 * risolve in id dopo aver caricato tutto.
 */
export function rowsToInputs(kind, rows, mapping) {
  return rows.map((row) => {
    const fields = {};
    const secrets = {};
    const refs = {};
    for (const [col, field] of Object.entries(mapping)) {
      const v = row[col];
      if (v == null || str(v) === "" || str(v) === "–" || str(v) === "-") continue;
      if (field.startsWith("secret:")) { secrets[field.slice(7)] = str(v); continue; }
      if (field === "placements" || field === "publishers") { fields[field] = [...(fields[field] || []), ...list(v)]; continue; }
      if (field === "deviceId") { refs.device = str(v).replace(/\s*\((manual|auto\w*)\)\s*$/i, "").replace(/^[^\w]+/u, ""); continue; }
      if (field === "linkedAccountId") {
        // "🇮🇹😊 mikyvibess(IG)" → nome + piattaforma dal suffisso
        const s = str(v);
        const hint = s.match(/\((\w+)\)\s*$/)?.[1];
        refs.linked = { username: normHandle(s.replace(/\(.*?\)/g, "").replace(/^[^\w.]+/u, "")), platform: hint ? enumValue("platform", hint) : null };
        continue;
      }
      if (field === "language" && kind === "account") { fields.language = v; continue; }
      fields[field] = v;
    }
    // l'URL del profilo dice anche la piattaforma se manca la colonna
    if (kind === "account" && !fields.platform && fields.url) {
      const u = str(fields.url).toLowerCase();
      fields.platform = u.includes("tiktok") ? "tiktok" : u.includes("instagram") ? "instagram" : u.includes("x.com") || u.includes("twitter") ? "twitter" : u.includes("reddit") ? "reddit" : undefined;
    }
    if (kind === "device" && fields.name) fields.name = str(fields.name).replace(/\s*\((manual|auto\w*)\)\s*$/i, "").replace(/^[^\w]+/u, "");
    return { fields, secrets, refs };
  });
}

/** Chiave naturale per riconoscere un record già presente durante l'import (aggiorna invece di duplicare). */
export function naturalKey(kind, rec) {
  if (kind === "account") return rec.username ? `${rec.platform}:${rec.username}` : null;
  if (kind === "device") return rec.name ? rec.name.toLowerCase() : null;
  if (kind === "mailbox") return rec.email || null;
  return null;
}
