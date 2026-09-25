/**
 * Analytics d'uso — storage KV. Logica e report in usage-core.js.
 *
 *   usage:d:{YYYY-MM-DD}   HASH  "{userId}\t{pagina}" → aperture   (TTL 400g)
 *
 * Una HINCRBY per pagina aperta: costo trascurabile, nessun dato personale oltre
 * (chi, quale pagina, che giorno).
 */
import { kv } from "@vercel/kv";
import { dayId, lastDays, matchRoute } from "@/lib/usage-core";
import ROUTES from "@/lib/app-routes.generated.json";

const TTL = 400 * 24 * 3600;
const key = (d) => `usage:d:${d}`;

export async function recordView(userId, path) {
  const page = matchRoute(path, ROUTES);
  if (!userId || !page) return { ok: false };
  const d = dayId(Date.now());
  const n = await kv.hincrby(key(d), `${userId}\t${page}`, 1);
  if (n === 1) await kv.expire(key(d), TTL);
  return { ok: true, page };
}

export async function getUsageDays(n = 60) {
  const ds = lastDays(n);
  const rows = await Promise.all(ds.map((d) => kv.hgetall(key(d)).catch(() => null)));
  return Object.fromEntries(ds.map((d, i) => [d, rows[i] || {}]));
}
