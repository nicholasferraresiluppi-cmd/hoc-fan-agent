// Ads · Studio bio-funnel — API (SEED).
// GET = ritorna lo studio completo (meta, rubrica, metodologia, pattern, template,
// classifica piattaforme, e le 112 landing con voti/verdetto/fix).
//
// GATE: SEED (admin-only). L'area Ads è materiale strategico interno di acquisizione;
// non espone dati denaro/PII operatore ma resta admin-first come le altre superfici admin.

export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { buildFunnelStudy } from "@/lib/ads-funnel-study";

export async function GET() {
  const auth = await authorize(CAPABILITIES.SEED);
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  return Response.json(buildFunnelStudy());
}
