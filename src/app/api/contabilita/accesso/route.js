/**
 * /api/contabilita/accesso — chi vede la contabilità. SOLO TITOLARE
 * (env HOC_ACCOUNTING_OWNER_IDS): nemmeno chi ha già l'accesso può darlo ad altri.
 * GET    → { owners, members, audit }
 * POST   { email } → dà l'accesso all'utente HOC Pro con quella email
 * DELETE ?userId=… → toglie l'accesso
 */
import { clerkClient } from "@clerk/nextjs/server";
import { requireAccounting, accountingOwnerIds, listMembers, grantAccess, revokeAccess, readAudit } from "@/lib/compensi-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET() {
  const az = await requireAccounting({ ownerOnly: true, action: "accesso" });
  if (!az.ok) return az.response;
  return Response.json({ owners: accountingOwnerIds(), members: await listMembers(), audit: await readAudit(150) }, { headers: NS });
}

export async function POST(request) {
  const az = await requireAccounting({ ownerOnly: true, action: "accesso" });
  if (!az.ok) return az.response;
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Email non valida" }, { status: 400, headers: NS });
  const list = await (await clerkClient()).users.getUserList({ emailAddress: [email], limit: 2 });
  const user = (list?.data || list || [])[0];
  if (!user) return Response.json({ error: "Nessun utente HOC Pro con questa email (va prima invitato da Membri)." }, { status: 404, headers: NS });
  try {
    const members = await grantAccess({ targetUserId: user.id, by: az.userId });
    return Response.json({ members }, { headers: NS });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400, headers: NS });
  }
}

export async function DELETE(request) {
  const az = await requireAccounting({ ownerOnly: true, action: "accesso" });
  if (!az.ok) return az.response;
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return Response.json({ error: "userId mancante" }, { status: 400, headers: NS });
  const members = await revokeAccess({ targetUserId: userId, by: az.userId });
  return Response.json({ members }, { headers: NS });
}
