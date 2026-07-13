/**
 * GET /api/cm-cockpit/live
 *
 * Vista 2 del cockpit: per la supervisione attiva dell'utente —
 * venduto/turno vs soglie mid/top (pull mirato wage CP), feed take,
 * check-in e coerenza profilo dalla timeline, override shadow §10.3.
 *
 * Freschezza: i take CP sono ingeriti a batch (mediana ~18 min) —
 * `pulled_at` nella risposta è il timestamp da mostrare in UI.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getActiveSupervision, getLiveView } from "@/lib/cm-cockpit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.CM_COCKPIT);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const sup = await getActiveSupervision(az.userId);
  if (!sup) return Response.json({ error: "Nessun turno di supervisione aperto." }, { status: 404 });

  try {
    const view = await getLiveView(sup);
    return Response.json(view);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
