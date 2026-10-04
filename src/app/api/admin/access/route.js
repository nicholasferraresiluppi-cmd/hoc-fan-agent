import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { listAdmins } from "@/lib/admin";
import { authorize, authorizeAdmin, auditAccess, CAPABILITIES, getStoredRoles, setUserRoles } from "@/lib/rbac";
import { forgetClerkUser } from "@/lib/clerk-user";

export async function GET() {
  const a = await authorize(CAPABILITIES.ACCESS_MGMT);
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  try {
    const admins = await listAdmins();
    return Response.json({ admins });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}

// POST { action: "add" | "remove", userId?: string, email?: string }
// Permette di aggiungere/rimuovere admin via userId o via email (risolta da Clerk).
export async function POST(request) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    let targetId = body?.userId?.trim();
    const email = body?.email?.trim();

    if (!targetId && email) {
      try {
        const cc = await clerkClient();
        const res = await cc.users.getUserList({ emailAddress: [email] });
        const list = res?.data || res || [];
        if (!list.length) return Response.json({ error: `Nessun utente con email ${email}` }, { status: 404 });
        targetId = list[0].id;
      } catch (e) {
        return Response.json({ error: `Impossibile cercare email: ${e?.message}` }, { status: 500 });
      }
    }

    if (!targetId) return Response.json({ error: "Fornisci userId o email." }, { status: 400 });

    if (action === "add") {
      await kv.sadd("admins:set", targetId);
      await auditAccess(a.userId, "admin_add", { target: targetId });
      return Response.json({ ok: true, action, userId: targetId });
    }
    if (action === "remove") {
      // Nota: non possiamo rimuovere utenti definiti via env o via Clerk metadata da qui.
      const envIds = (process.env.HOC_ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (envIds.includes(targetId)) {
        return Response.json({
          error: "Questo admin è definito via env HOC_ADMIN_USER_IDS. Rimuovilo da Vercel Settings.",
        }, { status: 400 });
      }
      // Rimuovi dal set KV
      if (targetId === a.userId) return Response.json({ error: "Non puoi rimuovere te stesso dagli admin: chiedilo a un altro admin." }, { status: 400 });
      await kv.srem("admins:set", targetId);
      await auditAccess(a.userId, "admin_remove", { target: targetId });
      // Revoca COMPLETA (27/09/2026, Nicholas): l'admin può venire anche dai metadata Clerk
      // (role / roles) e dai ruoli in KV. Prima si toglieva solo dal set KV e restava admin via Clerk.
      try {
        // ruoli SALVATI: getUserRoles per un admin dà solo ["admin"] e il filtro cancellava gli altri ruoli
        const roles = await getStoredRoles(targetId);
        if (roles.includes("admin")) await setUserRoles(targetId, roles.filter((r) => r !== "admin"));
      } catch { /* ruoli KV: best-effort */ }
      try {
        const cc = await clerkClient();
        const u = await cc.users.getUser(targetId);
        const pub = { ...(u?.publicMetadata || {}) }, priv = { ...(u?.privateMetadata || {}) };
        let changed = false;
        for (const m of [pub, priv]) {
          if (m.role === "admin") { delete m.role; changed = true; }
          if (Array.isArray(m.roles) && m.roles.includes("admin")) { m.roles = m.roles.filter((r) => r !== "admin"); changed = true; }
        }
        if (changed) await cc.users.updateUserMetadata(targetId, { publicMetadata: { role: pub.role ?? null, roles: pub.roles ?? null }, privateMetadata: { role: priv.role ?? null, roles: priv.roles ?? null } });
        await forgetClerkUser(targetId); // la revoca vale subito, non dopo la cache del profilo
      } catch (e) {
        return Response.json({ ok: true, action, userId: targetId, warning: `Tolto dagli admin di HOC Pro, ma non sono riuscito ad aggiornare Clerk (${e?.message || "errore"}): riprova.` });
      }
      return Response.json({ ok: true, action, userId: targetId });
    }

    return Response.json({ error: "action deve essere 'add' o 'remove'" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}
