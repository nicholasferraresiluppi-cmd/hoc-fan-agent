// Radar creator — API (SEED, admin-only). GET = schede delle creator + proposte di collegamento
// + stato del giro settimanale. Dati di persone esterne raccolti da profili pubblici:
// stesso gate delle superfici con dati personali (vedi docs/SCOUTING_PRIVACY.md).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getProfiles, getCrm, getRefreshState } from "@/lib/scouting-store";
import { buildCreators, stageCounts, suggestLinks, creatorIdOf, STAGES } from "@/lib/scouting-core";
import { apifyConfigured } from "@/lib/scouting-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const [profiles, crm, refresh] = await Promise.all([getProfiles(), getCrm(), getRefreshState()]);
  const creators = buildCreators(profiles, crm);
  const suggestions = suggestLinks(profiles, (h) => creatorIdOf(crm, h), new Set(crm.dismissed || []));
  // i profili viaggiano interi (servono alla scheda), senza bio: la scheda mostra il link al profilo
  const slim = profiles.map(({ bio, ...p }) => p);
  return Response.json({
    stages: STAGES,
    counts: stageCounts(creators),
    creators,
    profiles: slim,
    notes: Object.fromEntries(Object.entries(crm.creators || {}).filter(([, c]) => c.notes?.length).map(([id, c]) => [id, c.notes])),
    suggestions,
    refresh: { ...refresh, configured: apifyConfigured() },
  });
}
