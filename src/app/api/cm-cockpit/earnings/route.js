/**
 * GET /api/cm-cockpit/earnings?month=YYYY-MM (default: mese corrente)
 *
 * Vista 3 del cockpit: storico supervisioni chiuse del CM nel mese —
 * fisso maturato (€28 × turni), override shadow cumulato, riepiloghi.
 * Scope "own": ogni CM vede i propri turni (SM/admin inclusi, per ora
 * senza vista aggregata cross-CM — quella arriva col report coverage).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getEarnings } from "@/lib/cm-cockpit";

export const maxDuration = 30;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.CM_COCKPIT);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const now = new Date();
  const def = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthId = url.searchParams.get("month") || def;
  if (!/^\d{4}-\d{2}$/.test(monthId)) {
    return Response.json({ error: "month YYYY-MM non valido" }, { status: 400 });
  }

  try {
    const out = await getEarnings({ userId: az.userId, monthId });
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
