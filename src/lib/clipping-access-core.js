// Ruoli e permessi della dashboard Clipping (/admin/warmup) — logica pura, senza KV (13/11/2026).
//
// Un ruolo = nome + per ogni account (id di Account social) le finestre concesse + le persone (userId Clerk).
// Una persona con più ruoli ha la SOMMA dei permessi. L'admin vede tutto. Finché l'interruttore
// «Ruoli attivi» è spento valgono le regole di prima (chi ha social.manage vede tutto).
// Con i ruoli attivi, chi non è admin e non ha ruoli non vede nessun account.

/** Le finestre (schede) della dashboard che un ruolo può concedere, nell'ordine della barra. */
export const WINDOWS = [
  ["oggi", "Oggi"],
  ["contenuti", "Contenuti"],
  ["acct", "Account"],
  ["dati", "Dati"],
  ["xrefs", "Ispirazioni (X)"],
  ["radar", "Radar clipping"],
  ["trend", "Trend modelle"],
  ["guide", "Guida"],
];
export const WINDOW_KEYS = WINDOWS.map(([k]) => k);
const WSET = new Set(WINDOW_KEYS);

/** Finestre in cui si lavora un account: da qui si possono spuntare task, segnare dati, modificare. */
export const WORK_WINDOWS = ["oggi", "acct", "dati"];
/** Finestre che non sono di un account: si vedono intere se concesse per almeno un account. */
export const GLOBAL_WINDOWS = ["xrefs", "radar", "trend", "guide"];

const str = (v, n) => String(v ?? "").trim().slice(0, n);

/** Ruolo pulito (dal modulo). Restituisce {ok, role} o {ok:false, errors}. */
export function cleanRole(input, { accountIds = null, now = Date.now(), by = null } = {}) {
  const name = str(input?.name, 60);
  const errors = [];
  if (!name) errors.push("Scrivi il nome del ruolo");
  const grants = {};
  const known = accountIds ? new Set(accountIds) : null;
  for (const [id, tabs] of Object.entries(input?.grants || {})) {
    if (known && !known.has(id)) continue;
    const t = [...new Set((Array.isArray(tabs) ? tabs : []).filter((x) => WSET.has(x)))];
    if (t.length) grants[id] = WINDOW_KEYS.filter((k) => t.includes(k));
  }
  const users = [...new Set((Array.isArray(input?.users) ? input.users : []).map((u) => str(u, 80)).filter(Boolean))];
  if (errors.length) return { ok: false, errors };
  const id = str(input?.id, 40) || `r${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { ok: true, role: { id, name, grants, users, updatedAt: now, by } };
}

/**
 * Permessi effettivi di una persona.
 * → { all: true }  oppure  { all: false, accounts: { [accountId]: [finestre] } }
 */
export function accessFor(userId, { admin = false, doc = null } = {}) {
  if (admin || !doc?.active) return { all: true };
  const accounts = {};
  for (const r of doc.roles || []) {
    if (!(r.users || []).includes(userId)) continue;
    for (const [id, tabs] of Object.entries(r.grants || {})) {
      const cur = new Set(accounts[id] || []);
      for (const t of tabs || []) if (WSET.has(t)) cur.add(t);
      accounts[id] = WINDOW_KEYS.filter((k) => cur.has(k));
    }
  }
  return { all: false, accounts };
}

/** L'account è visibile in quella finestra? Senza finestra: in almeno una. */
export function canAccount(access, id, win = null) {
  if (access?.all) return true;
  const t = access?.accounts?.[id];
  if (!t || !t.length) return false;
  return win ? t.includes(win) : true;
}

/** L'account si può lavorare (spunte, timer, dati, modifiche): almeno una finestra di lavoro. */
export const canWork = (access, id) => access?.all || WORK_WINDOWS.some((w) => canAccount(access, id, w));

/** La finestra si vede (per almeno un account). */
export function canWindow(access, win) {
  if (access?.all) return true;
  return Object.values(access?.accounts || {}).some((t) => t.includes(win));
}

/** Solo gli elementi con un id permesso (in quella finestra, o in almeno una). */
export const filterAccounts = (access, list, win = null, idOf = (x) => x.id) =>
  access?.all ? list : (list || []).filter((x) => canAccount(access, idOf(x), win));
