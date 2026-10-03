// Mansione salvata per membro (03/10/2026). Lato server: segue la persona su ogni dispositivo.
// KV `member:workspace:{userId}` = { id, updated_at, by }. Fallback: `publicMetadata.workspace` scritto
// sull'INVITO Clerk (come le creator visibili, vedi lib/creator-scope), copiato in KV alla prima lettura.
// Senza scelta → la mansione di partenza dal ruolo (lib/workspaces.defaultWorkspace).
import { kv } from "@vercel/kv";
import { clerkClient } from "@clerk/nextjs/server";
import { isWorkspaceId, defaultWorkspace } from "@/lib/workspaces";

const KEY = (userId) => `member:workspace:${userId}`;

/** Solo KV (per gli elenchi: niente chiamata Clerk per riga). */
export async function peekSavedWorkspace(userId) {
  const hit = await kv.get(KEY(userId)).catch(() => null);
  return hit && isWorkspaceId(hit.id) ? hit.id : null;
}

/** Scelta salvata, o null se nessuno l'ha mai scelta. */
export async function getSavedWorkspace(userId) {
  if (!userId) return null;
  const hit = await kv.get(KEY(userId)).catch(() => null);
  if (hit && isWorkspaceId(hit.id)) return hit.id;
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(userId);
    const meta = u?.publicMetadata?.workspace;
    if (isWorkspaceId(meta)) {
      await kv.set(KEY(userId), { id: meta, updated_at: Date.now(), by: "invito" }).catch(() => {});
      return meta;
    }
  } catch { /* Clerk non raggiungibile: nessuna scelta */ }
  return null;
}

/** id valido o "" per tornare alla mansione di partenza (cancella la scelta). */
export async function setSavedWorkspace(userId, id, by) {
  if (!id) { await kv.del(KEY(userId)); return null; }
  if (!isWorkspaceId(id)) throw new Error("Mansione non valida.");
  await kv.set(KEY(userId), { id, updated_at: Date.now(), by: String(by || "").slice(0, 80) });
  return id;
}

/** { id, source: "scelta"|"ruolo"|null } — id null = nessuna mansione (menu personale dell'operatore). */
export async function resolveWorkspace(userId, { admin, roles }) {
  const saved = await getSavedWorkspace(userId).catch(() => null);
  if (saved) return { id: saved, source: "scelta" };
  const d = defaultWorkspace({ admin, roles });
  return { id: d, source: d ? "ruolo" : null };
}
