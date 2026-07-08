/**
 * HOC Fan Agent — Infloww API client (beta v1.2).
 *
 * Base: https://openapi.infloww.com  · endpoint sotto /v1/
 * Auth: header Authorization = <API key GREZZA> (no "Bearer") + x-oid = <agency OID>
 * Risposta standard: { data: { list: [...], cursor, hasMore } } (paginazione a cursore)
 * Rate limit: 1000 QPM/agency, 20 QPS/key.
 *
 * NB (scoperta giu 2026): l'API beta espone anagrafica/assegnazioni/transazioni/
 * mass-messages — NON i KPI di chat per operatore (golden ratio, msg/h, CVR,
 * caratteri): quelli restano dall'import dashboard finché Infloww non rilascia
 * l'endpoint statistiche.
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

/**
 * GET grezzo con auth Infloww. Ritorna il JSON (o lancia con messaggio chiaro).
 */
export async function inflowwGet(path, { query = null, timeoutMs = 20000 } = {}) {
  const { baseUrl, key, oid } = getEnv();
  const url = new URL(`${baseUrl}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
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
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`Infloww ${path} (${res.status}): ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return data;
}

/**
 * Probe non-throwing per discovery: prova un path e ritorna {status, ok, shape}.
 */
export async function inflowwProbe(path, query = null) {
  try {
    const { baseUrl, key, oid } = getEnv();
    const url = new URL(`${baseUrl}${path}`);
    if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
    const ctrl = new AbortController();
    const tt = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(url.toString(), { headers: { "Accept": "application/json", "Authorization": key, "x-oid": oid }, signal: ctrl.signal });
    } finally { clearTimeout(tt); }
    const textBody = await res.text();
    let json; try { json = textBody ? JSON.parse(textBody) : null; } catch { json = { _raw: textBody.slice(0, 200) }; }
    // riassunto shape senza dumpare tutto
    let shape = null;
    const d = json?.data ?? json;
    if (d && typeof d === "object") {
      if (Array.isArray(d.list)) {
        shape = { envelope: "data.list", count: d.list.length, has_more: d.hasMore ?? null, item_keys: d.list[0] ? Object.keys(d.list[0]) : [] };
      } else if (Array.isArray(d)) {
        shape = { type: "array", count: d.length, item_keys: d[0] ? Object.keys(d[0]) : [] };
      } else {
        shape = { type: "object", keys: Object.keys(d).slice(0, 20) };
      }
    }
    return { status: res.status, ok: res.ok, error: res.ok ? undefined : (typeof json?.message === "string" ? json.message : undefined), shape };
  } catch (e) {
    return { status: 0, ok: false, error: String(e?.message || e) };
  }
}

/* Endpoint wrappers (v1) — confermati/ipotizzati dal pattern /v1/<resource>. */
export async function fetchInflowwEmployees({ limit = 100, cursor } = {}) {
  return inflowwGet("/v1/employees", { query: { limit, cursor } });
}
