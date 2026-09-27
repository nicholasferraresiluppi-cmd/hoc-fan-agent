/**
 * Proxy per account social — CRUD su Vercel KV.
 *
 * Namespace isolato `social:*` (stessa regola di disciplina di `candidate:*`,
 * `content:*`): un proxy non è un dato di score/comp, vive nel suo namespace.
 *
 * La password è sempre cifrata a riposo (AES-256-GCM, social-proxy-crypto.js)
 * e non esce mai in chiaro dalle funzioni di lettura pensate per le API/UI
 * (`toPublicProxy`) — solo `getProxyWithSecret`, usata unicamente dal test di
 * connessione, la decifra.
 */
import { kv } from "@vercel/kv";
import { randomUUID } from "node:crypto";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/social-proxy-crypto";
import {
  validateProxyInput,
  computeProxyStats,
  PROXY_INDEX_KEY,
  proxyKey,
  accountKey,
  byProxyIndexKey,
} from "@/lib/social-proxies-core";

function toPublicProxy(rec) {
  if (!rec) return null;
  const { passwordEnc, ...rest } = rec;
  return {
    ...rest,
    hasPassword: !!passwordEnc,
    passwordMasked: passwordEnc ? maskSecret(decryptSecret(passwordEnc)) : null,
  };
}

async function persist(rec) {
  await kv.set(proxyKey(rec.id), rec);
}

/** Elenco proxy con filtri status/provider + paginazione offset/limit. Più recenti prima. */
export async function listProxies({ status, provider, offset = 0, limit = 50 } = {}) {
  const ids = (await kv.zrange(PROXY_INDEX_KEY, 0, -1, { rev: true })) || [];
  if (!ids.length) return { items: [], total: 0 };

  const recs = (await Promise.all(ids.map((id) => kv.get(proxyKey(id))))).filter(Boolean);

  let filtered = recs;
  if (status) filtered = filtered.filter((r) => r.status === status);
  if (provider) filtered = filtered.filter((r) => (r.provider || "altro") === provider);

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  const withCounts = await Promise.all(
    page.map(async (r) => {
      const accountIds = (await kv.smembers(byProxyIndexKey(r.id))) || [];
      return { ...toPublicProxy(r), accountIds, accountCount: accountIds.length };
    })
  );

  return { items: withCounts, total };
}

export async function getProxy(id) {
  if (!id) return null;
  const rec = await kv.get(proxyKey(id));
  if (!rec) return null;
  const accountIds = (await kv.smembers(byProxyIndexKey(id))) || [];
  return { ...toPublicProxy(rec), accountIds, accountCount: accountIds.length };
}

/** Come getProxy, ma con la password decifrata IN CHIARO — solo per il test di connessione. */
export async function getProxyWithSecret(id) {
  if (!id) return null;
  const rec = await kv.get(proxyKey(id));
  if (!rec) return null;
  return {
    ...rec,
    password: rec.passwordEnc ? decryptSecret(rec.passwordEnc) : null,
  };
}

export async function createProxy(input) {
  const { ok, errors } = validateProxyInput(input);
  if (!ok) return { ok: false, status: 400, errors };

  const now = Date.now();
  const rec = {
    id: randomUUID(),
    host: input.host.toString().trim(),
    port: Number(input.port),
    username: (input.username || "").toString().trim() || null,
    passwordEnc: input.password ? encryptSecret(input.password.toString()) : null,
    type: input.type,
    provider: (input.provider || "").toString().trim() || null,
    status: "inactive", // diventa active/error solo dopo un test riuscito/fallito
    lastCheckedAt: null,
    lastError: null,
    lastLatencyMs: null,
    createdAt: now,
    updatedAt: now,
  };
  await persist(rec);
  await kv.zadd(PROXY_INDEX_KEY, { score: now, member: rec.id });
  return { ok: true, proxy: toPublicProxy(rec) };
}

export async function updateProxy(id, input) {
  const rec = await kv.get(proxyKey(id));
  if (!rec) return { ok: false, status: 404, errors: ["proxy non trovato"] };

  const merged = {
    host: input.host != null ? input.host.toString().trim() : rec.host,
    port: input.port != null ? Number(input.port) : rec.port,
    type: input.type || rec.type,
  };
  const { ok, errors } = validateProxyInput(merged);
  if (!ok) return { ok: false, status: 400, errors };

  rec.host = merged.host;
  rec.port = merged.port;
  rec.type = merged.type;
  if (input.username != null) rec.username = input.username.toString().trim() || null;
  if (input.provider != null) rec.provider = input.provider.toString().trim() || null;
  // Password: stringa vuota/assente = mantieni quella esistente (non forzare un re-inserimento ad ogni edit).
  if (input.password != null && input.password.toString().length > 0) {
    rec.passwordEnc = encryptSecret(input.password.toString());
  }
  rec.updatedAt = Date.now();

  await persist(rec);
  return { ok: true, proxy: toPublicProxy(rec) };
}

/** Registra l'esito di un test di connessione (chiamato dalla route /test). */
export async function recordProxyTest(id, { success, publicIp, latencyMs, error }) {
  const rec = await kv.get(proxyKey(id));
  if (!rec) return { ok: false, status: 404, errors: ["proxy non trovato"] };

  rec.status = success ? "active" : "error";
  rec.lastCheckedAt = Date.now();
  rec.lastLatencyMs = Number.isFinite(latencyMs) ? latencyMs : null;
  rec.lastError = success ? null : (error || "test fallito");
  rec.lastPublicIp = success ? publicIp || null : rec.lastPublicIp || null;
  rec.updatedAt = Date.now();

  await persist(rec);
  return { ok: true, proxy: toPublicProxy(rec) };
}

/**
 * Elimina un proxy — bloccato se referenziato da almeno un account ATTIVO
 * ("solo se non assegnato a nessun account attivo"). Gli account inattivi
 * che referenziano il proxy vengono ripuliti (proxyId → null) in cascata,
 * perché KV non ha vincoli FK a farlo per noi.
 */
export async function deleteProxy(id) {
  const rec = await kv.get(proxyKey(id));
  if (!rec) return { ok: false, status: 404, errors: ["proxy non trovato"] };

  const accountIds = (await kv.smembers(byProxyIndexKey(id))) || [];
  const accounts = (await Promise.all(accountIds.map((aid) => kv.get(accountKey(aid))))).filter(Boolean);
  const activeAccounts = accounts.filter((a) => a.status === "active");

  if (activeAccounts.length > 0) {
    return {
      ok: false,
      status: 409,
      errors: [
        `Proxy assegnato a ${activeAccounts.length} account attivi (${activeAccounts.map((a) => a.name).join(", ")}) — riassegnali prima di eliminare.`,
      ],
    };
  }

  // Cascade cleanup: gli account inattivi che puntavano qui perdono il riferimento.
  for (const acc of accounts) {
    acc.proxyId = null;
    acc.updatedAt = Date.now();
    await kv.set(accountKey(acc.id), acc);
  }

  await kv.del(byProxyIndexKey(id));
  await kv.del(proxyKey(id));
  await kv.zrem(PROXY_INDEX_KEY, id);
  return { ok: true };
}

export async function getProxyStats() {
  const ids = (await kv.zrange(PROXY_INDEX_KEY, 0, -1)) || [];
  const recs = (await Promise.all(ids.map((id) => kv.get(proxyKey(id))))).filter(Boolean);
  return computeProxyStats(recs);
}

/** Elenco proxy attivi grezzi (id/status/createdAt) — usato dall'auto-assign in social-accounts.js. */
export async function listActiveProxiesRaw() {
  const ids = (await kv.zrange(PROXY_INDEX_KEY, 0, -1)) || [];
  const recs = (await Promise.all(ids.map((id) => kv.get(proxyKey(id))))).filter(Boolean);
  return recs.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt }));
}
