import { kv } from "@vercel/kv";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAdmin, listAdmins } from "@/lib/admin";

export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "Non autorizzato." }, { status: 403 });
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
  if (!(await isAdmin())) return Response.json({ error: "Non autorizzato." }, { status: 403 });
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
      await kv.srem("admins:set", targetId);
      // Se ha role=admin via Clerk metadata, mostra avviso
      try {
        const cc = await clerkClient();
        const u = await cc.users.getUser(targetId);
        if (u?.publicMetadata?.role === "admin" || u?.privateMetadata?.role === "admin") {
          return Response.json({
            ok: true,
            action,
            userId: targetId,
            warning: "Rimosso da KV, ma ha ancora role=admin nei metadata Clerk. Rimuovi anche da Clerk dashboard se vuoi revocare completamente.",
          });
        }
      } catch { /* silent */ }
      return Response.json({ ok: true, action, userId: targetId });
    }

    return Response.json({ error: "action deve essere 'add' o 'remove'" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e?.message || "Errore" }, { status: 500 });
  }
}
