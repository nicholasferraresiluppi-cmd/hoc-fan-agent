/**
 * Logica pura (no I/O) del modulo proxy per account social — isolata per
 * essere testabile senza KV, stesso pattern di creator-difficulty-core.js.
 */

export const PROXY_TYPES = ["socks5", "http"];
export const PROXY_STATUSES = ["active", "inactive", "error"];

/**
 * Chiavi KV condivise tra social-proxies.js e social-accounts.js. Centralizzate
 * qui (modulo puro, senza I/O) per evitare un import ciclico tra i due moduli
 * — entrambi possono dipendere da questo file senza dipendere l'uno dall'altro
 * per la sola costruzione delle chiavi.
 */
export const NS_PROXY = "social:proxy";
export const NS_ACCOUNT = "social:account";
export const PROXY_INDEX_KEY = `${NS_PROXY}:index`; // ZSET createdAt → proxyId
export const ACCOUNT_INDEX_KEY = `${NS_ACCOUNT}:index`; // ZSET createdAt → accountId

export const proxyKey = (id) => `${NS_PROXY}:${id}`;
export const accountKey = (id) => `${NS_ACCOUNT}:${id}`;
export const byProxyIndexKey = (proxyId) => `${NS_ACCOUNT}:by-proxy:${proxyId}`; // SET di account id

/**
 * Valida l'input di creazione/modifica di un proxy. Ritorna { ok, errors }.
 * `errors` è un array di stringhe (italiano, coerente col resto delle API).
 */
export function validateProxyInput(input) {
  const errors = [];
  const host = (input?.host || "").toString().trim();
  const port = Number(input?.port);
  const type = (input?.type || "").toString().trim();

  if (!host) errors.push("host richiesto");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("port deve essere un intero tra 1 e 65535");
  }
  if (!PROXY_TYPES.includes(type)) {
    errors.push(`type deve essere uno tra: ${PROXY_TYPES.join(", ")}`);
  }
  if (input?.username != null && typeof input.username !== "string") {
    errors.push("username deve essere una stringa");
  }
  if (input?.password != null && typeof input.password !== "string") {
    errors.push("password deve essere una stringa");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Auto-assegnazione: tra i proxy ATTIVI, sceglie quello con meno account
 * associati (bilanciamento del carico). Pareggio → il proxy creato prima
 * (createdAt asc), per un risultato deterministico e testabile.
 *
 * @param {Array<{id:string,status:string,createdAt:number}>} proxies
 * @param {Record<string, number>} countByProxyId
 * @returns {string|null} id del proxy scelto, o null se non ce n'è nessuno attivo
 */
export function pickLeastLoadedProxy(proxies, countByProxyId = {}) {
  const active = (proxies || []).filter((p) => p?.status === "active");
  if (!active.length) return null;

  let best = null;
  let bestCount = Infinity;
  for (const p of active) {
    const count = countByProxyId[p.id] || 0;
    if (
      count < bestCount ||
      (count === bestCount && (p.createdAt || 0) < (best.createdAt || 0))
    ) {
      best = p;
      bestCount = count;
    }
  }
  return best ? best.id : null;
}

/**
 * Statistiche aggregate per la dashboard proxy: totali, per status, per provider.
 */
export function computeProxyStats(proxies) {
  const list = proxies || [];
  const byStatus = { active: 0, inactive: 0, error: 0 };
  const byProvider = {};

  for (const p of list) {
    if (byStatus[p.status] != null) byStatus[p.status] += 1;
    const provider = p.provider || "altro";
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  }

  return {
    total: list.length,
    active: byStatus.active,
    inactive: byStatus.inactive,
    error: byStatus.error,
    byProvider,
  };
}
