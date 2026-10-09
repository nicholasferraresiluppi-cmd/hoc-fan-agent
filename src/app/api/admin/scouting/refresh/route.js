// Radar creator — "Aggiorna ora" (SEED): lancia il giro anche se l'ultimo è recente,
// oppure raccoglie quello in corso. Costa ~1 centesimo a profilo su Apify.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { scoutingTick } from "@/lib/scouting-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    return Response.json(await scoutingTick({ force: true }));
  } catch (e) {
    return Response.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
