// Ruoli e permessi della dashboard Clipping — archivio (KV) e permessi della richiesta corrente.
// Logica in clipping-access-core.js.
//
// Chiave:  clipping:roles  { active: bool, roles: [{ id, name, grants: {accountId: [finestre]}, users: [userId], updatedAt, by }], updatedAt }
import { kv } from "@vercel/kv";
import { isUserIdAdmin } from "@/lib/admin";
import { accessFor } from "@/lib/clipping-access-core";

// CLIPPING_ROLES_KEY solo per le prove in locale (il KV di sviluppo è quello di produzione): in produzione non si imposta
const KEY = process.env.CLIPPING_ROLES_KEY || "clipping:roles";

export async function loadRoles() {
  const d = await kv.get(KEY);
  return { active: Boolean(d?.active), roles: Array.isArray(d?.roles) ? d.roles : [], updatedAt: d?.updatedAt || null };
}

export async function saveRoles(doc) {
  const out = { active: Boolean(doc.active), roles: doc.roles || [], updatedAt: Date.now() };
  await kv.set(KEY, out);
  return out;
}

/** Permessi di chi fa la richiesta. `admin` già noto evita una seconda lettura. */
export async function accessOf(userId, admin) {
  const isAdmin = admin ?? (await isUserIdAdmin(userId).catch(() => false));
  if (isAdmin) return { all: true };
  return accessFor(userId, { admin: false, doc: await loadRoles() });
}

export const NO_ACCESS = "Non hai accesso a questa sezione";
export const noAccess = () => Response.json({ error: NO_ACCESS, noAccess: true }, { status: 403 });
