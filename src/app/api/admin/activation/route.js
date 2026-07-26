/**
 * GET /api/admin/activation
 *
 * Coorte di attivazione operatore (leading indicator "gap diagnosticato +
 * allenato", cfr src/lib/activation.js). SEED (admin-only): la vista mostra la
 * coorte di operatori, non solo il proprio dato.
 *
 * VINCOLO onesto: finché nessun operatore è onboardato, la coorte è vuota e
 * l'activation rate è null — la superficie è strumentata, in attesa di dati.
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getActivationCohort, ACTIVATION_THRESHOLDS } from "@/lib/activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) {
    return Response.json({ error: az.message || "Non autorizzato." }, { status: az.status || 403 });
  }
  try {
    const cohort = await getActivationCohort();
    return Response.json(cohort);
  } catch (e) {
    return Response.json(
      { error: "Coorte non disponibile.", config: ACTIVATION_THRESHOLDS, cohortSize: 0, members: [] },
      { status: 200 }
    );
  }
}
