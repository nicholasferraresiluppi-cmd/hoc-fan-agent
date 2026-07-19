/**
 * /api/admin/qa-reviews — QA conversazionale (CAREER_LADDER §8.1).
 *
 * Capability: authorizeAll(SCORES_VIEW) — admin, sales manager, qa_reviewer.
 * Il team_lead ha scope "team" e riceve 403: il TL diretto non valuta da solo
 * chi poi propone per promozione (stesso principio delle contestazioni).
 *
 * GET  ?employee=NAME → review di un operatore; senza param → ultime 300.
 * POST { employee, period_id, conversation_ref, scores: {compliance, brand_voice,
 *        sales_technique, retention, writing} (interi 1-4), notes? }
 *      → crea la review; pass/fail calcolati server-side (mai dal client).
 *
 * Le review sono definitive: niente PUT/DELETE. Un errore di valutazione si
 * corregge con una nuova review e una nota — mai riscrivendo la storia.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { createReview, listAllReviews, listReviewsForEmployee, QA_DIMENSIONS } from "@/lib/qa-reviews";

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const { searchParams } = new URL(request.url);
  const employee = searchParams.get("employee");
  const reviews = employee ? await listReviewsForEmployee(employee) : await listAllReviews();
  return Response.json({ reviews, dimensions: QA_DIMENSIONS });
}

export async function POST(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { employee, period_id, conversation_ref, scores, notes } = body || {};
  if (!employee || typeof employee !== "string") {
    return Response.json({ error: "employee richiesto." }, { status: 400 });
  }
  if (!period_id || !/^\d{4}-\d{2}$/.test(period_id)) {
    return Response.json({ error: "period_id richiesto (formato YYYY-MM)." }, { status: 400 });
  }
  if (!conversation_ref || String(conversation_ref).trim().length < 5) {
    return Response.json({ error: "conversation_ref richiesto: identifica la conversazione valutata (creator, fan, data)." }, { status: 400 });
  }

  try {
    const review = await createReview({
      employee: employee.trim(),
      periodId: period_id,
      reviewerId: az.userId || "",
      conversationRef: conversation_ref,
      scores: scores || {},
      notes,
    });
    return Response.json({ ok: true, review });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
