/**
 * HOC Fan Agent — Infloww API client (beta v1.2).
 *
 * Base: https://openapi.infloww.com  · endpoint sotto /v1/
 * Auth: header Authorization = <API key GREZZA> (no "Bearer") + x-oid = <agency OID>
 * Envelope: { data: { list: [...], ... }, cursor, hasMore }  (cursor + hasMore a
 *           livello ROOT, siblings di `data`). Paginazione a cursore, limit <= 100.
 * Rate limit: 1000 QPM/agency, 20 QPS/key.
 *
 * MAPPA ENDPOINT (verificata sulla doc Stoplight, lug 2026):
 *   /v1/employees                     — roster operatori          (no param obbligatori)
 *   /v1/creators                      — creator connessi          (id = creatorId)
 *   /v1/employees/assigned-creators   — join operatore↔creator    (employeeId)
 *   /v1/transactions                  — revenue fan-level          (creatorId)
 *   /v1/refunds                       — chargeback fan-level       (creatorId)
 *   /v1/automated-messages            — perf messaggi automatici   (creatorId)
 *   /v1/priority-mass-messages        — perf mass message          (creatorId)
 *   /v1/links                         — campagne/trial/tracking    (creatorId, linkType)
 *   /v1/linkfans                      — fan per link (LTV)         (creatorId, linkId, linkType)
 *
 * NB (giu-lug 2026): l'API espone anagrafica, assegnazioni, revenue fan-level,
 * refund, performance dei messaggi automatici/mass e attribuzione marketing.
 * NON espone i KPI di chat 1:1 per operatore (golden ratio, msg/h, CVR, caratteri):
 * quelli restano dall'import dashboard. La perf dei messaggi automatici/mass è il
 * segnale operatore più vicino disponibile via API.
 *
 * Unità importi (attenzione, disomogenee):
 *   transactions: amount/fee/net in CENTESIMI, come stringa ("7400" = $74.00)
 *   refunds:      paymentAmount in CENTESIMI ("1000" = $10.00) — la doc
 *                 mostrava "29.99" decimale, ma i dati reali sono cent interi
 *                 (verificato live 19 lug 2026, coerente con centsToUsd usato
 *                 da infloww-revenue sui dati veri)
 *   messages:     price/revenue in CENTESIMI (numero)
 *
 * Schema record VERIFICATO live (probe 19 lug 2026):
 *   transazione: id, transactionId (uuid 32-hex STABILE), fanId, fanName,
 *                createdTime (ms string), type, tipSource, status, amount/fee/net, currency
 *   refund:      id, transactionId (= transazione originale → join ESATTO),
 *                fanId, paymentTime, refundTime, paymentStatus ("undo"),
 *                paymentAmount, transactionType
 *   NB: NESSUN campo employee/chatter sulla transazione → l'attribuzione
 *   all'operatore non vive nell'API (la fa payout-match via turni CP).
 *   Storico interrogabile ≥ 12 mesi sulle creator storiche.
 */
const DEFAULT_BASE = "https://openapi.infloww.com";

function getEnv() {
  const baseUrl = process.env.INFLOWW_API_BASE_URL || DEFAULT_BASE;
  const key = process.env.INFLOWW_API_KEY;
  const oid = process.env.INFLOWW_OID;
  if (!key) throw new Error("INFLOWW_API_KEY mancante in env");
  if (!oid) throw new Error("INFLOWW_OID mancante in env");
  return { baseUrl, key, oid };
}

/** Applica i query param all'URL, gestendo array (append ripetuto) e skip null. */
function applyQuery(url, query) {
  if (!query) return;
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item !== undefined && item !== null) url.searchParams.append(k, String(item));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
}

/**
 * GET grezzo con auth Infloww. Ritorna il JSON (o lancia con messaggio chiaro).
 */
export async function inflowwGet(path, { query = null, timeoutMs = 20000 } = {}) {
  const { baseUrl, key, oid } = getEnv();
  const url = new URL(`${baseUrl}${path}`);
  applyQuery(url, query);
  const ctrl = new AbortController();
  const tt = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { "Accept": "application/json", "Authorization": key, "x-oid": oid },
      signal: ctrl.signal,
    });
  } finally { clearTimeout(tt); }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data?.errorMessage || data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`Infloww ${path} (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return data;
}

/**
 * Fetch paginato: segue il cursore finché hasMore è true (o si raggiunge un cap).
 * Ritorna { items, pages, truncated }. `truncated` = c'erano altre pagine ma
 * abbiamo fermato al cap (per non sforare 60s / rate limit).
 */
export async function inflowwPaged(path, { query = {}, limit = 100, maxPages = 20, maxItems = Infinity, timeoutMs = 20000, deadline = null } = {}) {
  const items = [];
  let cursor;
  let pages = 0;
  let hasMore = true;
  // `deadline` (epoch ms): esci con truncated=true invece di sforare il tempo
  // della serverless function — il chiamante degrada nel percorso truncated.
  while (hasMore && pages < maxPages && items.length < maxItems && (!deadline || Date.now() < deadline)) {
    const json = await inflowwGet(path, { query: { ...query, limit, cursor }, timeoutMs });
    const d = json?.data ?? {};
    const list = Array.isArray(d.list) ? d.list : (Array.isArray(d) ? d : []);
    items.push(...list);
    cursor = json?.cursor ?? d?.cursor;
    hasMore = Boolean(json?.hasMore ?? d?.hasMore) && list.length > 0 && cursor != null;
    pages++;
  }
  return { items, pages, truncated: hasMore };
}

/**
 * Probe non-throwing per discovery: prova un path e ritorna {status, ok, shape}.
 * Cattura anche errorMessage (formato Infloww) per capire cosa manca sui 400.
 */
export async function inflowwProbe(path, query = null) {
  try {
    const { baseUrl, key, oid } = getEnv();
    const url = new URL(`${baseUrl}${path}`);
    applyQuery(url, query);
    const ctrl = new AbortController();
    const tt = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(url.toString(), { headers: { "Accept": "application/json", "Authorization": key, "x-oid": oid }, signal: ctrl.signal });
    } finally { clearTimeout(tt); }
    const textBody = await res.text();
    let json; try { json = textBody ? JSON.parse(textBody) : null; } catch { json = { _raw: textBody.slice(0, 200) }; }
    let shape = null;
    const d = json?.data ?? json;
    if (d && typeof d === "object") {
      if (Array.isArray(d.list)) {
        shape = { envelope: "data.list", count: d.list.length, has_more: json?.hasMore ?? null, item_keys: d.list[0] ? Object.keys(d.list[0]) : [] };
      } else if (Array.isArray(d)) {
        shape = { type: "array", count: d.length, item_keys: d[0] ? Object.keys(d[0]) : [] };
      } else {
        shape = { type: "object", keys: Object.keys(d).slice(0, 20) };
      }
    }
    const errMsg = json?.errorMessage || (typeof json?.message === "string" ? json.message : undefined);
    return { status: res.status, ok: res.ok, error: res.ok ? undefined : errMsg, shape };
  } catch (e) {
    return { status: 0, ok: false, error: String(e?.message || e) };
  }
}

/* ─── Endpoint wrappers (v1) ─────────────────────────────────────────────── */

export async function fetchInflowwEmployees({ limit = 100, cursor, employeeIds } = {}) {
  return inflowwGet("/v1/employees", { query: { limit, cursor, employeeIds } });
}

export async function fetchInflowwCreators({ limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/creators", { query: { limit, cursor, platformCode } });
}

export async function fetchInflowwAssignedCreators({ employeeId, limit = 100, cursor } = {}) {
  return inflowwGet("/v1/employees/assigned-creators", { query: { employeeId, limit, cursor } });
}

export async function fetchInflowwTransactions({ creatorId, startTime, endTime, limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/transactions", { query: { creatorId, startTime, endTime, limit, cursor, platformCode } });
}

export async function fetchInflowwRefunds({ creatorId, startTime, endTime, limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/refunds", { query: { creatorId, startTime, endTime, limit, cursor, platformCode } });
}

export async function fetchInflowwAutomatedMessages({ creatorId, employeeIds, startTime, endTime, limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/automated-messages", { query: { creatorId, employeeIds, startTime, endTime, limit, cursor, platformCode } });
}

export async function fetchInflowwPriorityMassMessages({ creatorId, employeeIds, startTime, endTime, limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/priority-mass-messages", { query: { creatorId, employeeIds, startTime, endTime, limit, cursor, platformCode } });
}

export async function fetchInflowwLinks({ creatorId, linkType, startTime, endTime, limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/links", { query: { creatorId, linkType, startTime, endTime, limit, cursor, platformCode } });
}

export async function fetchInflowwLinkFans({ creatorId, linkId, linkType, limit = 100, cursor, platformCode = "OnlyFans" } = {}) {
  return inflowwGet("/v1/linkfans", { query: { creatorId, linkId, linkType, limit, cursor, platformCode } });
}

/* ─── Utility importi ────────────────────────────────────────────────────── */

/** transactions/messages: centesimi (string|number) → dollari. */
export function centsToUsd(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : 0;
}
