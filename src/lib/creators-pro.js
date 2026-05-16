// Client per l'API Creators Pro (api.houseofcreators.com).
// Auth: bearer token in env var CREATORS_PRO_TOKEN.

const BASE_URL =
  process.env.CREATORS_PRO_BASE_URL || "https://api.houseofcreators.com";

function getToken() {
  const token = process.env.CREATORS_PRO_TOKEN;
  if (!token) {
    throw new Error("CREATORS_PRO_TOKEN is not set");
  }
  return token;
}

async function request(path, { method = "GET", query, body, signal } = {}) {
  const url = new URL(path.replace(/^\//, ""), BASE_URL.replace(/\/?$/, "/"));
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Creators Pro API ${method} ${url.pathname} failed: ${res.status} ${res.statusText}${
        text ? ` — ${text.slice(0, 300)}` : ""
      }`
    );
  }

  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export function getTalents(opts = {}) {
  return request("/talents", { query: opts.query, signal: opts.signal });
}

export function getOFOverview(opts = {}) {
  return request("/social-metrics/onlyfans/talents/timeframe", {
    query: opts.query,
    signal: opts.signal,
  });
}

export function getInstagramOverview(opts = {}) {
  return request("/social-metrics/instagram/all/talents/timeframe", {
    query: opts.query,
    signal: opts.signal,
  });
}

export function getTikTokOverview(opts = {}) {
  return request("/social-metrics/tiktok/talents/timeframe", {
    query: opts.query,
    signal: opts.signal,
  });
}

export function getSalesCreators(opts = {}) {
  return request("/sales/sales-analytics/creators", {
    query: opts.query,
    signal: opts.signal,
  });
}

export async function getFullSnapshot(opts = {}) {
  const [talents, onlyfans, instagram, tiktok, sales] = await Promise.all([
    getTalents(opts),
    getOFOverview(opts),
    getInstagramOverview(opts),
    getTikTokOverview(opts),
    getSalesCreators(opts),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    talents,
    onlyfans,
    instagram,
    tiktok,
    sales,
  };
}
