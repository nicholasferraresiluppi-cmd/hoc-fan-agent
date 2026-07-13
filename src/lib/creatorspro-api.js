/**
 * HOC Fan Agent — CreatorsPro API client (v2.1).
 *
 * v2: paginazione + detail parallelizzati. PAGE_LIMIT ridotto a 25 perché
 * l'API CP timeout-a su limit=100. Aggiunta funzione fetchWageDetailBatch
 * per chunking server-side che resta sotto Vercel Hobby 60s limit.
 *
 * v2.1 (gen 2026): RETRY con backoff esponenziale su tutte le chiamate batch
 * (fetchAllWageStubs, fetchWageDetailBatch). Le pagine/id che falliscono
 * dopo 3 tentativi vengono RITORNATE come failed_pages / failed_ids invece
 * di essere silenziate. Risolve il caso 'wage record mancante dopo sync
 * apparentemente riuscito' (es. Francesco Casti Aprile 2026).
 */

// NB (lug 2026): CreatorsPro ha dismesso il sottodominio white-label
// api.houseofcreators.com (ora 404 su tutto) e migrato l'API sull'host
// principale. Verificato: POST /v1/auth/login su api.creatorspro.com risponde
// con lo stesso contratto {email,password}. Override via CREATORSPRO_API_BASE_URL.
const DEFAULT_BASE = "https://api.creatorspro.com";
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

/**
 * Probe non-throwing: GET grezzo contro un path candidato, ritorna
 * {status, ok, sample} senza mai lanciare. Per scoprire endpoint nuovi
 * (pattern usato per /v1/payment-profiles). baseOverride permette di
 * testare host diversi da quello bot di default (es. social su altro host).
 */
export async function probeGet(path, { query = null, baseOverride = null, noAuth = false } = {}) {
  try {
    const { baseUrl } = getEnv();
    const base = baseOverride || baseUrl;
    const url = new URL(`${base}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers = {};
    if (!noAuth) headers["Authorization"] = `Bearer ${await login()}`;
    const ctrl = new AbortController();
    const tt = setTimeout(() => ctrl.abort(), 12000);
    let res;
    try {
      res = await fetch(url.toString(), { headers, signal: ctrl.signal });
    } finally {
      clearTimeout(tt);
    }
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text.slice(0, 200) }; }
    return { status: res.status, ok: res.ok, sample: data };
  } catch (e) {
    return { status: 0, ok: false, error: String(e?.message || e) };
  }
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
 * Timeline events per creator — endpoint scoperto via cp-timeline-probe
 * (lug 2026). Ogni event = slot turno programmato con shift.member,
 * shift.paymentProfile (nome + cosellersCount) e shift.checkin LIVE
 * (checkin.endedAt null finché l'operatore è al lavoro).
 */
export async function fetchTimelineEvents({ creatorId, startedAt, endedAt }) {
  if (!creatorId || !startedAt || !endedAt) throw new Error("creatorId + startedAt + endedAt required");
  const r = await apiFetch("/v1/timeline/events", { query: { creatorId, startedAt, endedAt } });
  return r?.data || [];
}

export async function fetchWages({ startedAt, endedAt, page = 1, limit = PAGE_LIMIT, status, memberId, groupId, timeoutMs }) {
  if (!startedAt || !endedAt) throw new Error("startedAt + endedAt required");
  return apiFetch("/v1/sellers-wage/wages", {
    query: { startedAt, endedAt, page, limit, status, memberId, groupId },
    ...(timeoutMs ? { timeoutMs } : {}),
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

/**
 * Payment Profiles — endpoint scoperto via probe (lug 2026, tool poi rimosso).
 * Path: /v1/payment-profiles
 * Shape per record: { id, name, hourlyRate, cosellersCount, tag,
 *   paymentProfileThresholds: [{ id, threshold, percentage }],
 *   creatorPaymentProfiles: [...] }
 */
/* ─── Social Analytics (modulo talent di CP, scoperto lug 2026) ─────────
 * Endpoint sniffati da app.creatorspro.com e verificati col BOT (200):
 * - /v1/social-metrics/talents → anagrafica talent {id, name, creators[]}
 * - /v1/social-metrics/overview/talents/timeframe → revenue per talent
 *   nel range date, {totals, talents[]}. Date in ISO UTC.
 */
export async function fetchSocialTalents() {
  return apiFetch("/v1/social-metrics/talents", { timeoutMs: 20000 });
}

export async function fetchSocialTalentRevenue({ startDate, endDate, page = 1, limit = 100, orderBy = "revenueOf", orderDirection = "desc" } = {}) {
  return apiFetch("/v1/social-metrics/overview/talents/timeframe", {
    query: { startDate, endDate, page, limit, orderBy, orderDirection },
    timeoutMs: 25000,
  });
}

export async function fetchPaymentProfiles({ page = 1, limit = 100 } = {}) {
  return apiFetch("/v1/payment-profiles", { query: { page, limit } });
}

/**
 * Fetcha TUTTI i payment profiles ciclando la paginazione.
 * Su Hobby resta ampiamente sotto 60s anche con 250+ profili.
 */
export async function fetchAllPaymentProfiles() {
  const all = [];
  let page = 1;
  const limit = 100;
  let safety = 0;
  while (safety++ < 20) {
    const r = await fetchPaymentProfiles({ page, limit });
    const data = r?.data || [];
    all.push(...data);
    const pagination = r?.pagination || {};
    const pageCount = pagination.pageCount || 1;
    if (page >= pageCount || data.length === 0) break;
    page++;
  }
  return all;
}

/* ============================================================
 * Retry helper (esponenziale + jitter)
 * ============================================================ */

/**
 * Esegue fn con max N tentativi e backoff esponenziale (+jitter).
 * Ritorna il risultato di fn se riesce, oppure { _failed: true, _error }.
 * NON throwa, così possiamo collezionare i fallimenti senza interrompere
 * il batch principale.
 */
async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 500 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        const jitter = Math.random() * 200;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  return { _failed: true, _error: String(lastErr?.message || lastErr) };
}

/* ============================================================
 * High-level helpers
 * ============================================================ */

/**
 * Fetcha tutte le pagine LISTA (solo stub, niente shifts).
 * Paginazione parallelizzata: prima pagina seriale per scoprire totalPages,
 * poi tutte le restanti in parallelo a concurrency LIST_PAGES_CONCURRENCY.
 *
 * v2.1: ogni pagina ha 3 tentativi (backoff esponenziale + jitter). Le
 * pagine che falliscono dopo i retry vengono RITORNATE in `failedPages[]`
 * invece di essere silenziate. Il chiamante può decidere se ritentarle.
 *
 * Su un mese tipico (~554 wage / PAGE_LIMIT=25 = ~22 pagine) richiede
 * ~10-15s totali (più qualche secondo di backoff in caso di errori).
 */
export async function fetchAllWageStubs({ startedAt, endedAt }) {
  const first = await fetchWages({ startedAt, endedAt, page: 1, limit: PAGE_LIMIT });
  const stubs = [...(first.data || [])];
  const pagination = first.pagination || {};
  const totalCount = pagination.dataCount || stubs.length;
  const pageCount = pagination.pageCount || Math.ceil(totalCount / PAGE_LIMIT) || 1;
  const failedPages = [];
  if (pageCount <= 1) return { stubs, totalCount, pageCount, failedPages };

  // Fetcha pagine 2..N in parallelo a chunks di LIST_PAGES_CONCURRENCY, con retry
  const pages = [];
  for (let p = 2; p <= pageCount; p++) pages.push(p);
  for (let i = 0; i < pages.length; i += LIST_PAGES_CONCURRENCY) {
    const slice = pages.slice(i, i + LIST_PAGES_CONCURRENCY);
    const results = await Promise.all(slice.map(async (p) => {
      const r = await withRetry(() => fetchWages({ startedAt, endedAt, page: p, limit: PAGE_LIMIT }));
      return { page: p, result: r };
    }));
    for (const { page, result } of results) {
      if (result?._failed) {
        failedPages.push({ page, error: result._error });
        // Log server-side per visibilità in Vercel logs
        // eslint-disable-next-line no-console
        console.warn(`[CP_SYNC] page ${page} FAILED after 3 retries:`, result._error);
      } else if (result?.data) {
        stubs.push(...result.data);
      }
    }
  }
  return { stubs, totalCount, pageCount, failedPages };
}

/**
 * Retry mirato: ri-pesca SOLO le pagine specifiche (es. quelle che erano in
 * `failedPages` del run precedente). Utile per un "retry button" UI dopo che
 * il sync iniziale ha lasciato alcune pagine fallite.
 */
export async function fetchWageStubsForPages({ startedAt, endedAt, pages }) {
  const stubs = [];
  const failedPages = [];
  for (let i = 0; i < pages.length; i += LIST_PAGES_CONCURRENCY) {
    const slice = pages.slice(i, i + LIST_PAGES_CONCURRENCY);
    const results = await Promise.all(slice.map(async (p) => {
      const r = await withRetry(() => fetchWages({ startedAt, endedAt, page: p, limit: PAGE_LIMIT }), { maxAttempts: 4, baseDelayMs: 800 });
      return { page: p, result: r };
    }));
    for (const { page, result } of results) {
      if (result?._failed) failedPages.push({ page, error: result._error });
      else if (result?.data) stubs.push(...result.data);
    }
  }
  return { stubs, failedPages };
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
    const results = await Promise.all(slice.map(async (id) => {
      const r = await withRetry(() => fetchWageDetail(id));
      if (r?._failed) {
        // eslint-disable-next-line no-console
        console.warn(`[CP_SYNC] wage detail ${id} FAILED after 3 retries:`, r._error);
        return { _error: r._error, _id: id };
      }
      return r;
    }));
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
