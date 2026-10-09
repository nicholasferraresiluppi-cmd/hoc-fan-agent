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

export function ofapiConfigured() {
  return Boolean(process.env.ONLYFANSAPI_KEY);
}

async function ofapiGet(path, query = {}) {
  const key = process.env.ONLYFANSAPI_KEY;
  if (!key) throw new Error("ONLYFANSAPI_KEY non configurata");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "hoc-pro/1.0" },
  });
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
