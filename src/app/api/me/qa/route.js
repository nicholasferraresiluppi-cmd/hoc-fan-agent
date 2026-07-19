/**
 * GET /api/me/qa — le mie review di qualità (scope own, docs/VISIBILITY_POLICY.md).
 * L'operatore vede i propri esiti QA con rubrica ed evidenze; mai quelli altrui.
 * Identità risolta server-side.
 */
import { resolveEmployeeForUser } from "@/lib/me";
import { listReviewsForEmployee, qaStatusForGate, QA_DIMENSIONS } from "@/lib/qa-reviews";

export async function GET() {
  const who = await resolveEmployeeForUser();
  if (who.reason === "unauthenticated") return Response.json({ error: "Non autenticato." }, { status: 401 });
  if (!who.employee) return Response.json({ linked: false, reason: who.reason || "no_match" });

  const reviews = await listReviewsForEmployee(who.employee);
  // Il reviewer resta anonimo verso l'operatore (rotazione §8.1): niente reviewer_id.
  const safe = reviews.map(({ reviewer_id, ...r }) => r);
  return Response.json({
    linked: true,
    employee: who.employee,
    dimensions: QA_DIMENSIONS,
    gate_status: qaStatusForGate(reviews, { windowMonths: 3 }),
    reviews: safe,
  });
}
