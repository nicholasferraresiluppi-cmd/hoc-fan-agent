/**
 * GET /api/admin/referral/inbox — badge di «Porta un collega» per l'HR: premi sbloccati da
 * pagare + mesi senza cambio. Leggero (cache 10 min, lib/referral getInbox). Chi non ha il
 * permesso riceve count 0 (il menu lo chiede per chi vede la voce, nessun errore in console).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getInbox } from "@/lib/referral";

export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.REFERRAL_MANAGE);
  if (!az.ok) return Response.json({ count: 0 });
  try {
    return Response.json(await getInbox());
  } catch {
    return Response.json({ count: 0 });
  }
}
