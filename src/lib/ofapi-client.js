// Client minimo di OnlyFansAPI.com (fornitore terzo di API OnlyFans).
//
// PERCHÉ (9/10/2026): pilota di indipendenza dei dati — leggere gli account
// OnlyFans senza la piattaforma che alimenta il warehouse. Vedi
// docs/INDIPENDENZA_DATI.md e src/lib/ofapi-pilot.js.
//
// SOLO LETTURA by design: nessuna funzione qui scrive su OnlyFans (niente
// messaggi, post, like). Ogni chiamata che arriva a OnlyFans costa 1 credito,
// anche se OnlyFans risponde con un errore (docs.onlyfansapi.com/.../credits).
//
// Nota: il loro bordo rifiuta (403) i client senza User-Agent riconoscibile.

const BASE = "https://app.onlyfansapi.com/api";

// RITMO (9/10/2026): sull'elenco dei 259 link di Elisa Vimercati OnlyFans stesso
// ha risposto 429 "OnlyFans-Native Rate limit exceeded" a pagine chieste una
// dietro l'altra. È il segnale da rispettare per il rischio ban: pausa fissa tra
// le chiamate e, se OnlyFans frena, UNA sola attesa lunga poi si rinuncia
// (la notte dopo si riprova). Mai martellare.
const PACE_MS = 1500;
const BACKOFF_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

export function ofapiConfigured() {
  return Boolean(process.env.ONLYFANSAPI_KEY);
}

async function ofapiGet(path, query = {}) {
  const key = process.env.ONLYFANSAPI_KEY;
  if (!key) throw new Error("ONLYFANSAPI_KEY non configurata");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const call = async () => {
    const wait = lastCall + PACE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    return fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "hoc-pro/1.0" },
    });
  };
  let res = await call();
  if (res.status === 429) {
    await sleep(BACKOFF_MS);
    res = await call();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`OnlyFansAPI ${path} (${res.status}): ${data?.message || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Account collegati, con lo stato di autenticazione (il campanello del rischio ban). */
export async function listOfapiAccounts() {
  const list = await ofapiGet("/accounts");
  return (Array.isArray(list) ? list : []).map((a) => ({
    id: a.id,
    name: a.display_name,
    username: a.onlyfans_username,
    onlyfansId: Number(a.onlyfans_id),
    authenticated: Boolean(a.is_authenticated),
    authProgress: a.authentication_progress ?? null,
  }));
}

/**
 * Transazioni di un account da `startDate` (UTC, "YYYY-MM-DD HH:MM:SS") a oggi,
 * più recenti per prime. Paginazione a marker, tetto di pagine come fusibile.
 */
export async function listOfapiTransactions(accountId, startDate, { limit = 50, maxPages = 40 } = {}) {
  const out = [];
  let marker;
  let credits = 0;
  for (let page = 0; page < maxPages; page++) {
    const r = await ofapiGet(`/${accountId}/transactions`, { startDate, limit, marker });
    credits += Number(r?._meta?._credits?.used || 0);
    const d = r?.data || {};
    out.push(...(d.list || []));
    if (!d.hasMore || !d.nextMarker) return { list: out, credits, truncated: false };
    marker = d.nextMarker;
  }
  return { list: out, credits, truncated: true };
}

/**
 * Tracking link (`kind: "tracking"`) o trial link (`kind: "trial"`) di un account,
 * con i contatori cumulativi (click, abbonati, revenue). Paginazione a offset.
 * La revenue può arrivare "in calcolo" (`revenue.isLoading`): la si salva come tale.
 */
export async function listOfapiLinks(accountId, kind, { limit = 50, maxPages = 20 } = {}) {
  const path = kind === "trial" ? "trial-links" : "tracking-links";
  const out = [];
  let credits = 0;
  for (let page = 0; page < maxPages; page++) {
    const r = await ofapiGet(`/${accountId}/${path}`, { limit, offset: page * limit });
    credits += Number(r?._meta?._credits?.used || 0);
    const d = r?.data || {};
    out.push(...(d.list || []));
    if (!d.hasMore) return { list: out, credits, truncated: false };
  }
  return { list: out, credits, truncated: true };
}
