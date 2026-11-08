// KV finto in memoria per i test dei flussi server (mai la base dati vera).
const H = new Map(), S = new Map(), L = new Map();
const h = (k) => { if (!H.has(k)) H.set(k, new Map()); return H.get(k); };
export const kv = {
  async hgetall(k) { const m = H.get(k); return m && m.size ? Object.fromEntries(m) : null; },
  async hget(k, f) { return H.get(k)?.get(f) ?? null; },
  async hset(k, obj) { for (const [f, v] of Object.entries(obj)) h(k).set(f, v); return 1; },
  async hsetnx(k, f, v) { if (h(k).has(f)) return 0; h(k).set(f, v); return 1; },
  async hdel(k, ...fs) { for (const f of fs) H.get(k)?.delete(f); return 1; },
  async get(k) { return S.get(k) ?? null; },
  async set(k, v) { S.set(k, v); return "OK"; },
  async del(k) { S.delete(k); H.delete(k); return 1; },
  async lpush(k, ...vs) { const l = L.get(k) || []; l.unshift(...vs); L.set(k, l); return l.length; },
  async ltrim(k, a, b) { const l = L.get(k) || []; L.set(k, l.slice(a, b + 1)); return "OK"; },
  async lrange(k, a, b) { return (L.get(k) || []).slice(a, b === -1 ? undefined : b + 1); },
  async incr(k) { const n = (S.get(k) || 0) + 1; S.set(k, n); return n; },
  async expire() { return 1; },
  async zscore() { return null; },
  async zrange() { return []; },
};
export function createClient() { return kv; }
