/**
 * HOC Fan Agent — CreatorsPro API client (v2).
 *
 * v2: paginazione + detail parallelizzati. PAGE_LIMIT ridotto a 25 perché
 * l'API CP timeout-a su limit=100. Aggiunta funzione fetchWageDetailBatch
 * per chunking server-side che resta sotto Vercel Hobby 60s limit.
 */

const DEFAULT_BASE = "https://api.houseofcreators.com";
const PAGE_LIMIT = 25;
const DETAIL_CONCURRENCY = 20;
const LIST_PAGES_CONCURRENCY = 10;

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
  _tokenCache = { token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

async function apiFetch(path, { method = "GET", query = null, body = null, retries = 1, timeoutMs = 30000 } = {}) {
  const { baseUrl } = getEnv();
  const token = await login();
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const ctrl = new AbortController();
  const tt = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(tt);
  }
  if (res.status === 401 && retries > 0) {
    await login(true);
    return apiFetch(path, { method, query, body, retries: retries - 1, timeoutMs });
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

export async function fetchWages({ startedAt, endedAt, page = 1, limit = PAGE_LIMIT, status, memberId, groupId }) {
  if (!startedAt || !endedAt) throw new Error("startedAt + endedAt required");
  return apiFetch("/v1/sellers-wage/wages", {
    query: { startedAt, endedAt, page, limit, status, memberId, groupId },
  });
}

export async function fetchWageDetail(wageId) {
  const r = await apiFetch(`/v1/sellers-wage/wages/${encodeURIComponent(wageId)}`);
  return r?.data || r;
}

export async function fetchDistinctMembersCount({ startedAt, endedAt }) {
  const r = await apiFetch("/v1/sellers-wage/distinct-members-count", { query: { startedAt, endedAt } });
  return r?.data || r;
}

export async function fetchWagesStatusCounts({ startedAt, endedAt, memberId, groupId }) {
  const r = await apiFetch("/v1/sellers-wage/wages-status-counts", { query: { startedAt, endedAt, memberId, groupId } });
  return r?.data || r;
}

/* ============================================================
 * High-level helpers
 * ============================================================ */

/**
 * Fetcha tutte le pagine LISTA (solo stub, niente shifts).
 * Paginazione parallelizzata: prima pagina seriale per scoprire totalPages,
 * poi tutte le restanti in parallelo a concurrency LIST_PAGES_CONCURRENCY.
 *
 * Su un mese tipico (~554 wage / PAGE_LIMIT=25 = ~22 pagine) richiede
 * ~10-15s totali — sicuramente sotto qualsiasi function timeout.
 */
export async function fetchAllWageStubs({ startedAt, endedAt }) {
  const first = await fetchWages({ startedAt, endedAt, page: 1, limit: PAGE_LIMIT });
  const stubs = [...(first.data || [])];
  const pagination = first.pagination || {};
  const totalCount = pagination.dataCount || stubs.length;
  const pageCount = pagination.pageCount || Math.ceil(totalCount / PAGE_LIMIT) || 1;
  if (pageCount <= 1) return { stubs, totalCount };

  // Fetcha pagine 2..N in parallelo a chunks di LIST_PAGES_CONCURRENCY
  const pages = [];
  for (let p = 2; p <= pageCount; p++) pages.push(p);
  const others = new Array(pages.length);
  for (let i = 0; i < pages.length; i += LIST_PAGES_CONCURRENCY) {
    const slice = pages.slice(i, i + LIST_PAGES_CONCURRENCY);
    const results = await Promise.all(slice.map((p) =>
      fetchWages({ startedAt, endedAt, page: p, limit: PAGE_LIMIT }).catch((e) => ({ data: [], _err: String(e?.message || e) }))
    ));
    for (let j = 0; j < results.length; j++) others[i + j] = results[j];
  }
  for (const r of others) {
    if (r?.data) stubs.push(...r.data);
  }
  return { stubs, totalCount };
}

/**
 * Fetcha detail per un BATCH di wage IDs. Parallelismo aggressivo
 * (DETAIL_CONCURRENCY) per stare sotto il timeout.
 *
 * @returns {object[]} array di wage detail (o {_error, _id} se fallisce singolarmente)
 */
export async function fetchWageDetailBatch(wageIds) {
  if (!Array.isArray(wageIds) || wageIds.length === 0) return [];
  const out = new Array(wageIds.length);
  for (let i = 0; i < wageIds.length; i += DETAIL_CONCURRENCY) {
    const slice = wageIds.slice(i, i + DETAIL_CONCURRENCY);
    const results = await Promise.all(slice.map((id) =>
      fetchWageDetail(id).catch((e) => ({ _error: String(e?.message || e), _id: id }))
    ));
    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
  }
  return out;
}

/**
 * Bucketizza orario in fascia: After / Morning / Afternoon / Evening / Night.
 * Convenzioni UTC:
 *   02-06 → After
 *   06-12 → Morning
 *   12-18 → Afternoon
 *   18-22 → Evening
 *   22-02 → Night
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
  return "Night";
}
