/**
 * HOC Fan Agent — CreatorsPro API client.
 *
 * Wrapper server-only per chiamare api.houseofcreators.com con bearer
 * token rolling. Auth via email/password (env vars), token cacheato in
 * memoria del worker. Niente persistenza KV del token: rifare login ogni
 * cold start è ok (l'API è veloce).
 *
 * Capabilities richieste sull'account bot CreatorsPro:
 *   - sellersWage.manageWages
 *   - sellersWage.manageAlerts
 *   - timeline.manageShifts
 *
 * Env vars richieste:
 *   CREATORSPRO_API_BASE_URL  (default: https://api.houseofcreators.com)
 *   CREATORSPRO_BOT_EMAIL
 *   CREATORSPRO_BOT_PASSWORD
 *
 * Niente di tutto questo è esposto al client browser — server-only.
 */

const DEFAULT_BASE = "https://api.houseofcreators.com";

// Cache token in memoria del worker, refresh in caso 401
let _tokenCache = { token: null, expiresAt: 0 };

function getEnv() {
  const baseUrl = process.env.CREATORSPRO_API_BASE_URL || DEFAULT_BASE;
  const email = process.env.CREATORSPRO_BOT_EMAIL;
  const password = process.env.CREATORSPRO_BOT_PASSWORD;
  if (!email || !password) {
    throw new Error("CreatorsPro env vars mancanti: CREATORSPRO_BOT_EMAIL + CREATORSPRO_BOT_PASSWORD");
  }
  return { baseUrl, email, password };
}

async function login(force = false) {
  const now = Date.now();
  if (!force && _tokenCache.token && _tokenCache.expiresAt > now + 30000) {
    return _tokenCache.token;
  }
  const { baseUrl, email, password } = getEnv();
  const res = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`CP login failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data?.data?.access_token;
  if (!token) throw new Error("CP login: no access_token in response");
  // Token JWT RSA — non sappiamo la TTL esatta. Cachiamo per 50 min e
  // facciamo refresh proattivo prima della scadenza tipica (1h).
  _tokenCache = { token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

async function apiFetch(path, { method = "GET", query = null, body = null, retries = 1 } = {}) {
  const { baseUrl } = getEnv();
  const token = await login();
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retries > 0) {
    // Token scaduto, force refresh + retry
    await login(true);
    return apiFetch(path, { method, query, body, retries: retries - 1 });
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const msg = data?.message || `HTTP ${res.status}`;
    throw new Error(`CP ${path} failed (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return data;
}

/* ============================================================
 * Endpoint wrappers
 * ============================================================ */

export async function fetchMembers() {
  const r = await apiFetch("/v1/sellers-wage/members");
  return r?.data || [];
}

export async function fetchGroups() {
  const r = await apiFetch("/v1/sellers-wage/groups");
  return r?.data || [];
}

export async function fetchIntervals() {
  const r = await apiFetch("/v1/timeline/intervals");
  return r?.data || [];
}

/**
 * Lista wage paginata. Date in ISO completo (es. "2026-05-01T00:00:00.000Z").
 * Ritorna { data: [...], pagination: {...} }
 */
export async function fetchWages({ startedAt, endedAt, page = 1, limit = 50, status, memberId, groupId }) {
  if (!startedAt || !endedAt) throw new Error("startedAt + endedAt required");
  return apiFetch("/v1/sellers-wage/wages", {
    query: { startedAt, endedAt, page, limit, status, memberId, groupId },
  });
}

/**
 * Dettaglio singolo wage — popola shifts[] (la lista paginata non li ha).
 */
export async function fetchWageDetail(wageId) {
  const r = await apiFetch(`/v1/sellers-wage/wages/${encodeURIComponent(wageId)}`);
  return r?.data || r;
}

export async function fetchDistinctMembersCount({ startedAt, endedAt }) {
  const r = await apiFetch("/v1/sellers-wage/distinct-members-count", {
    query: { startedAt, endedAt },
  });
  return r?.data || r;
}

export async function fetchWagesStatusCounts({ startedAt, endedAt, memberId, groupId }) {
  const r = await apiFetch("/v1/sellers-wage/wages-status-counts", {
    query: { startedAt, endedAt, memberId, groupId },
  });
  return r?.data || r;
}

/* ============================================================
 * Helpers di alto livello
 * ============================================================ */

/**
 * Fetcha TUTTI i wage di un periodo (paginate fino a esaurimento) e per
 * ognuno carica il detail (per avere shifts[]). Concurrency = 5.
 *
 * Attenzione: per un mese con 500+ wage può richiedere 60-120s. Pensato
 * per essere chiamato in route con maxDuration estesa o in cron job.
 *
 * @param {object} opts
 * @param {string} opts.startedAt  ISO timestamp (es. "2026-04-01T00:00:00.000Z")
 * @param {string} opts.endedAt
 * @param {function} [opts.onProgress]  callback({phase, current, total})
 */
export async function fetchAllWagesForPeriod({ startedAt, endedAt, onProgress = null }) {
  const PAGE_LIMIT = 100;
  const DETAIL_CONCURRENCY = 5;

  // 1. Paginate list
  let page = 1;
  let allWageStubs = [];
  while (true) {
    const r = await fetchWages({ startedAt, endedAt, page, limit: PAGE_LIMIT });
    const batch = r.data || [];
    allWageStubs.push(...batch);
    const pg = r.pagination || {};
    if (onProgress) onProgress({ phase: "list", current: allWageStubs.length, total: pg.dataCount || allWageStubs.length });
    if (!pg.hasNextPage || batch.length === 0) break;
    page++;
    if (page > 50) break; // safety
  }

  // 2. Fetch details in parallel batches
  const details = new Array(allWageStubs.length);
  for (let i = 0; i < allWageStubs.length; i += DETAIL_CONCURRENCY) {
    const slice = allWageStubs.slice(i, i + DETAIL_CONCURRENCY);
    const ids = slice.map((w) => w?.info?.id).filter(Boolean);
    const results = await Promise.all(ids.map((id) =>
      fetchWageDetail(id).catch((e) => ({ _error: String(e?.message || e), _id: id }))
    ));
    for (let j = 0; j < results.length; j++) {
      details[i + j] = results[j];
    }
    if (onProgress) onProgress({ phase: "detail", current: i + slice.length, total: allWageStubs.length });
  }

  return { wages: details.filter(Boolean), count: details.filter((d) => !d?._error).length };
}

/**
 * Bucketizza un orario in fascia: After / Morning / Afternoon / Evening / Night.
 * Convenzioni (CET, ma usiamo l'ora UTC del timestamp che è quella già normalizzata):
 *   02-06 → After
 *   06-12 → Morning
 *   12-18 → Afternoon
 *   18-22 → Evening
 *   22-02 → Night
 *
 * Da rivedere se la convenzione HOC è diversa (puoi sovrascrivere con
 * /timeline/intervals.creators[] che ha già start/end per ogni shift).
 */
export function bucketizeIntervalFromHour(isoTimestamp) {
  if (!isoTimestamp) return null;
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return null;
  const h = d.getUTCHours();
  if (h >= 2 && h < 6) return "After";
  if (h >= 6 && h < 12) return "Morning";
  if (h >= 12 && h < 18) return "Afternoon";
  if (h >= 18 && h < 22) return "Evening";
  return "Night"; // 22-02
}
