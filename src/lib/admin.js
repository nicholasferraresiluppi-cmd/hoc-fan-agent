import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { viewAsFor } from "@/lib/view-as";

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

/** Admin per sorgenti (env / KV / metadata), SENZA il controllo 2FA. */
export async function isUserIdAdminRaw(userId) {
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

/* ------------------------------------------------------------------ */
/* Verifica in due passaggi per gli admin (25/09/2026)                 */
/* ------------------------------------------------------------------ */
// Un admin vede compensi e dati di tutta l'org: con la sola password rubata
// entra chiunque. Quando `security:admin_mfa_required` è attivo, un admin
// SENZA 2FA su Clerk perde i poteri da admin (resta un utente normale) finché
// non la attiva. L'interruttore lo accende solo un admin che ha già la 2FA
// (vedi /api/admin/security): impossibile chiudersi fuori per sbaglio.
export const MFA_FLAG_KEY = "security:admin_mfa_required";

export async function adminMfaRequired() {
  return (await kv.get(MFA_FLAG_KEY).catch(() => null)) === true;
}

/** true se l'utente ha la verifica in due passaggi attiva su Clerk (cache 10 min). */
export async function userHasMfa(userId) {
  if (!userId) return false;
  const ck = `mfa:ok:${userId}`;
  const cached = await kv.get(ck).catch(() => null);
  if (cached === 1 || cached === 0) return cached === 1;
  let ok = false;
  try {
    const cc = await clerkClient();
    const u = await cc.users.getUser(userId);
    ok = !!u?.twoFactorEnabled;
  } catch { return false; }
  await kv.set(ck, ok ? 1 : 0, { ex: 600 }).catch(() => {});
  return ok;
}

/** L'utente, se admin, può esercitare i poteri da admin? */
export async function adminMfaOk(userId) {
  if (!(await adminMfaRequired())) return true;
  return userHasMfa(userId);
}

export async function isUserIdAdmin(userId) {
  if (!(await isUserIdAdminRaw(userId))) return false;
  // "Vedi come…": un admin in anteprima è admin solo se lo è il ruolo simulato
  const va = await viewAsFor(userId);
  if (va) return va.roles.includes("admin");
  return adminMfaOk(userId);
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
