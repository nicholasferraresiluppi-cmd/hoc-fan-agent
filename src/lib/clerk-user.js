// Profilo Clerk di una persona, letto UNA volta e riusato (ott 2026).
//
// Perché: il controllo accessi chiedeva a Clerk lo stesso utente per ogni domanda
// (è admin? che ruoli? quali creator? che mansione?), in sequenza. Con le funzioni
// a Francoforte accanto al KV, ogni viaggio verso l'API Clerk (USA) costava caro:
// /api/whoami passò da ~0,5 s a ~2 s. Qui: memoria dell'istanza 30 s → KV 120 s → Clerk.
//
// Si salva solo il sottoinsieme che serve ai controlli (niente email, niente altro
// privateMetadata). Chi cambia ruoli/admin chiama forgetClerkUser: il cambio vale subito.
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";

const MEM_MS = 30_000;
const KV_TTL_S = 120;
const mem = new Map(); // userId -> { exp, p }
const KEY = (id) => `clerk:u:${id}`;

const slim = (u) => ({
  publicMetadata: {
    role: u?.publicMetadata?.role ?? null,
    roles: Array.isArray(u?.publicMetadata?.roles) ? u.publicMetadata.roles : null,
    creators: u?.publicMetadata?.creators ?? null,
    workspace: u?.publicMetadata?.workspace ?? null,
  },
  privateMetadata: { role: u?.privateMetadata?.role ?? null },
  twoFactorEnabled: Boolean(u?.twoFactorEnabled),
});

async function load(userId) {
  const hit = await kv.get(KEY(userId)).catch(() => null);
  if (hit && typeof hit === "object") return hit;
  const cc = await clerkClient();
  const s = slim(await cc.users.getUser(userId));
  await kv.set(KEY(userId), s, { ex: KV_TTL_S }).catch(() => {});
  return s;
}

/** { publicMetadata:{role,roles,creators,workspace}, privateMetadata:{role}, twoFactorEnabled }. Lancia se Clerk non risponde. */
export async function getClerkUser(userId) {
  const now = Date.now();
  const m = mem.get(userId);
  if (m && m.exp > now) return m.p;
  const p = load(userId);
  mem.set(userId, { exp: now + MEM_MS, p });
  p.catch(() => mem.delete(userId)); // un errore non resta in cache
  if (mem.size > 500) for (const [k, v] of mem) if (v.exp <= now) mem.delete(k);
  return p;
}

/** Da chiamare dopo ogni modifica a ruoli/admin/metadata della persona. */
export async function forgetClerkUser(userId) {
  mem.delete(userId);
  await kv.del(KEY(userId)).catch(() => {});
}
