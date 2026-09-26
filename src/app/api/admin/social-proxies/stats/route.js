/**
 * /api/admin/social-proxies/stats — statistiche aggregate proxy (SEED).
 * GET → { total, active, inactive, error, byProvider }
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProxyStats } from "@/lib/social-proxies";

export const runtime = "nodejs";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const stats = await getProxyStats();
  return Response.json(stats);
}
