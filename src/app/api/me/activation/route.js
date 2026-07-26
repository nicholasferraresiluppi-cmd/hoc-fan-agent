/**
 * GET /api/me/activation — il MIO progresso sull'anello (scope own).
 *
 * Alimenta la checklist della /guida operatore: diagnostica → allena → applica,
 * derivato dai propri eventi di attivazione (nessuna PII fan, nessun transcript).
 * Vista lenient (all-time): è il progresso incoraggiante dell'operatore, distinto
 * dalla metrica windowed dell'admin (`/api/admin/activation`).
 *
 * Identità server-side via lo stesso resolver di /me/* (mai dal client).
 */
import { resolveEmployeeForUser } from "@/lib/me";
import { getOperatorGuideProgress, ACTIVATION_THRESHOLDS } from "@/lib/activation";
import { recommendPathForGap } from "@/lib/coaching-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") {
    return Response.json({ error: "Non autenticato." }, { status: 401 });
  }
  if (!who.employee) {
    // Non collegato a un operatore: la checklist non si applica (la /guida
    // ricade sul percorso read-only).
    return Response.json({ linked: false, reason: who.reason || "no_match" });
  }

  const progress = await getOperatorGuideProgress(who.userId);
  // Focus del gap (dal catalogo corrente) per dare un "cosa allenare" concreto.
  let focus = null;
  if (progress.gapKey) {
    try { focus = recommendPathForGap(progress.gapKey)?.focus || null; } catch { focus = null; }
  }

  return Response.json({
    linked: true,
    employee: who.employee,
    progress,
    focus,
    thresholds: ACTIVATION_THRESHOLDS,
  });
}
