import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";

/**
 * Admin gate unificato. Un utente è admin se:
 *  1. è elencato in env HOC_ADMIN_USER_IDS (bootstrap/fallback)
 *  2. ha publicMetadata.role === "admin" su Clerk (gestibile da Clerk dashboard)
 *  3. è presente nel Redis set KV "admins:set" (gestibile in-app)
 */

export async function getAdminSources() {
  const envIds = (process.env.HOC_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const kvIds = (await kv.smembers("admins:set")) || [];
  return { envIds, kvIds };
}

export async function isUserIdAdmin(userId) {
  if (!userId) return false;
  const { envIds, kvIds } = await getAdminSources();
  if (envIds.includes(userId)) return true;
  if (kvIds.includes(userId)) return true;
  // Clerk metadata check
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(userId);
    if (u?.publicMetadata?.role === "admin" || u?.privateMetadata?.role === "admin") return true;
  } catch { /* silent */ }
  return false;
}

export async function isAdmin() {
  try {
    const { userId } = await auth();
    return await isUserIdAdmin(userId);
  } catch { return false; }
}

/** Ritorna la lista unificata di admin (env + kv + metadata), deduplicata, con sorgente. */
export async function listAdmins() {
  const { envIds, kvIds } = await getAdminSources();
  const all = new Map();

  for (const id of envIds) all.set(id, { userId: id, sources: ["env"] });
  for (const id of kvIds) {
    if (all.has(id)) all.get(id).sources.push("kv");
    else all.set(id, { userId: id, sources: ["kv"] });
  }

  // Resolve names + scan for metadata role=admin among known users
  try {
    const cc = await clerkClient();
    // Get names for known ids
    const ids = [...all.keys()];
    if (ids.length) {
      const users = await cc.users.getUserList({ userId: ids });
      const list = users?.data || users || [];
      for (const u of list) {
        if (all.has(u.id)) {
          const entry = all.get(u.id);
          entry.name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.emailAddresses?.[0]?.emailAddress || u.id;
          entry.email = u.emailAddresses?.[0]?.emailAddress;
          if (u.publicMetadata?.role === "admin" || u.privateMetadata?.role === "admin") {
            if (!entry.sources.includes("clerk_metadata")) entry.sources.push("clerk_metadata");
          }
        }
      }
    }
    // Scan first 100 users for role=admin set via Clerk dashboard (not yet in env/kv)
    const scan = await cc.users.getUserList({ limit: 100 });
    const scanList = scan?.data || scan || [];
    for (const u of scanList) {
      if (u.publicMetadata?.role === "admin" || u.privateMetadata?.role === "admin") {
        if (!all.has(u.id)) {
          all.set(u.id, {
            userId: u.id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.emailAddresses?.[0]?.emailAddress || u.id,
            email: u.emailAddresses?.[0]?.emailAddress,
            sources: ["clerk_metadata"],
          });
        }
      }
    }
  } catch { /* silent */ }

  return [...all.values()];
}
