// Verifica in due passaggi per gli admin: stato e interruttore (vedi lib/admin).
import { clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { authorizeAdmin, auditAccess } from "@/lib/rbac";
import { listAdmins, userHasMfa, adminMfaRequired, MFA_FLAG_KEY } from "@/lib/admin";

export async function GET() {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const admins = await listAdmins();
  const cc = await clerkClient();
  const rows = await Promise.all(admins.map(async (ad) => {
    let mfa = false;
    try { mfa = !!(await cc.users.getUser(ad.userId))?.twoFactorEnabled; } catch {}
    return { userId: ad.userId, name: ad.name || ad.userId, email: ad.email || null, mfa };
  }));
  return Response.json({ required: await adminMfaRequired(), me_mfa: await userHasMfa(a.userId), admins: rows });
}

export async function POST(request) {
  const a = await authorizeAdmin();
  if (!a.ok) return Response.json({ error: a.message }, { status: a.status });
  const body = await request.json().catch(() => ({}));
  const required = body?.required === true;
  if (required) {
    await kv.del(`mfa:ok:${a.userId}`).catch(() => {});
    if (!(await userHasMfa(a.userId))) {
      return Response.json({ error: "Prima attiva la verifica in due passaggi sul tuo account: altrimenti ti chiuderesti fuori." }, { status: 400 });
    }
  }
  if (required) await kv.set(MFA_FLAG_KEY, true); else await kv.del(MFA_FLAG_KEY);
  await auditAccess(a.userId, "admin_mfa_required", { required });
  return Response.json({ ok: true, required });
}
