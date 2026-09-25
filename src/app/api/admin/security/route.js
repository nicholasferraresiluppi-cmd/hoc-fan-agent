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
  // solo account che esistono davvero (id rimasti da vecchie installazioni = fantasmi, si saltano)
  const rows = (await Promise.all(admins.map(async (ad) => {
    try {
      const u = await cc.users.getUser(ad.userId);
      return { userId: ad.userId, name: ad.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || ad.userId, email: ad.email || u.emailAddresses?.[0]?.emailAddress || null, mfa: !!u?.twoFactorEnabled };
    } catch { return null; }
  }))).filter(Boolean);
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
