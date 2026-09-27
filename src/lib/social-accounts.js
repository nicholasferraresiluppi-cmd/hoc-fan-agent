/**
 * Account social (Twitter/Reddit/Instagram/TikTok ecc.) usati per la
 * promozione ufficiale dei creator HOC — CRUD su Vercel KV, namespace
 * `social:*` condiviso con social-proxies.js.
 *
 * Modello volutamente minimale: solo i campi necessari a provare
 * l'assegnazione/isolamento del proxy. Non è una feature di social media
 * management completa (non richiesta).
 */
import { kv } from "@vercel/kv";
import { randomUUID } from "node:crypto";
import { listActiveProxiesRaw } from "@/lib/social-proxies";
import {
  pickLeastLoadedProxy,
  ACCOUNT_INDEX_KEY,
  accountKey,
  byProxyIndexKey,
} from "@/lib/social-proxies-core";

export const PLATFORMS = ["twitter", "reddit", "instagram", "tiktok", "other"];
export const ACCOUNT_STATUSES = ["active", "inactive"];

function validateAccountInput(input) {
  const errors = [];
  const name = (input?.name || "").toString().trim();
  const platform = (input?.platform || "").toString().trim();
  if (!name) errors.push("name richiesto");
  if (!PLATFORMS.includes(platform)) errors.push(`platform deve essere uno tra: ${PLATFORMS.join(", ")}`);
  return { ok: errors.length === 0, errors };
}

async function persist(rec) {
  await kv.set(accountKey(rec.id), rec);
}

async function countsByProxyId(proxyIds) {
  const counts = {};
  await Promise.all(
    proxyIds.map(async (id) => {
      const members = (await kv.smembers(byProxyIndexKey(id))) || [];
      counts[id] = members.length;
    })
  );
  return counts;
}

/** Sceglie il proxy attivo con meno account associati. Ritorna null se non c'è nessun proxy attivo. */
async function autoAssignProxy() {
  const proxies = await listActiveProxiesRaw();
  if (!proxies.length) return null;
  const counts = await countsByProxyId(proxies.map((p) => p.id));
  return pickLeastLoadedProxy(proxies, counts);
}

export async function listAccounts() {
  const ids = (await kv.zrange(ACCOUNT_INDEX_KEY, 0, -1, { rev: true })) || [];
  if (!ids.length) return [];
  const recs = (await Promise.all(ids.map((id) => kv.get(accountKey(id))))).filter(Boolean);
  return recs;
}

export async function getAccount(id) {
  if (!id) return null;
  return (await kv.get(accountKey(id))) || null;
}

/** Fetch minimale {id,name} per un set di id — usato dalla route proxy per mostrare l'account associato. */
export async function getAccountsByIds(ids) {
  if (!ids?.length) return [];
  const recs = (await Promise.all(ids.map((id) => kv.get(accountKey(id))))).filter(Boolean);
  return recs.map((r) => ({ id: r.id, name: r.name, status: r.status }));
}

export async function createAccount(input) {
  const { ok, errors } = validateAccountInput(input);
  if (!ok) return { ok: false, status: 400, errors };

  let proxyId = input.proxyId ? input.proxyId.toString().trim() : null;
  if (!proxyId) {
    proxyId = await autoAssignProxy();
  }

  const now = Date.now();
  const rec = {
    id: randomUUID(),
    name: input.name.toString().trim(),
    platform: input.platform,
    handle: (input.handle || "").toString().trim() || null,
    proxyId: proxyId || null,
    status: ACCOUNT_STATUSES.includes(input.status) ? input.status : "active",
    createdAt: now,
    updatedAt: now,
  };
  await persist(rec);
  await kv.zadd(ACCOUNT_INDEX_KEY, { score: now, member: rec.id });
  if (rec.proxyId) await kv.sadd(byProxyIndexKey(rec.proxyId), rec.id);
  return { ok: true, account: rec };
}

/** Aggiorna un account, inclusa l'eventuale riassegnazione di proxy (mantiene gli indici by-proxy coerenti). */
export async function updateAccount(id, input) {
  const rec = await kv.get(accountKey(id));
  if (!rec) return { ok: false, status: 404, errors: ["account non trovato"] };

  const merged = {
    name: input.name != null ? input.name.toString().trim() : rec.name,
    platform: input.platform || rec.platform,
  };
  const { ok, errors } = validateAccountInput(merged);
  if (!ok) return { ok: false, status: 400, errors };

  rec.name = merged.name;
  rec.platform = merged.platform;
  if (input.handle != null) rec.handle = input.handle.toString().trim() || null;
  if (input.status != null && ACCOUNT_STATUSES.includes(input.status)) rec.status = input.status;

  if (Object.prototype.hasOwnProperty.call(input, "proxyId")) {
    const nextProxyId = input.proxyId ? input.proxyId.toString().trim() : null;
    if (nextProxyId !== rec.proxyId) {
      if (rec.proxyId) await kv.srem(byProxyIndexKey(rec.proxyId), rec.id);
      if (nextProxyId) await kv.sadd(byProxyIndexKey(nextProxyId), rec.id);
      rec.proxyId = nextProxyId;
    }
  }

  rec.updatedAt = Date.now();
  await persist(rec);
  return { ok: true, account: rec };
}

export async function deleteAccount(id) {
  const rec = await kv.get(accountKey(id));
  if (!rec) return { ok: false, status: 404, errors: ["account non trovato"] };

  if (rec.proxyId) await kv.srem(byProxyIndexKey(rec.proxyId), rec.id);
  await kv.del(accountKey(id));
  await kv.zrem(ACCOUNT_INDEX_KEY, id);
  return { ok: true };
}
