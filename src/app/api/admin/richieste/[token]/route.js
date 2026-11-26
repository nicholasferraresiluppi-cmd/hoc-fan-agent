/**
 * /api/admin/richieste/[token] — una richiesta, lato app (26/11/2026). Permesso social.manage.
 * GET                                            riprese con file (link firmati), giudizi, stato
 * PATCH { action: "update", data }               modifica titolo, scadenza, nota, riprese
 * PATCH { action: "sent" }                       segna che il link è stato mandato alla modella
 * PATCH { action: "review", shotId, verdict: "ok"|"redo", note }   approva o chiede di rifare
 * PATCH { action: "removeMedia", shotId, kind: "ref"|"voce" }      toglie riferimento o nota vocale
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getForApp, updateRequest, markSent, reviewShot, removeShotMedia, validToken } from "@/lib/richieste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, props) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { token } = await props.params;
  if (!validToken(token)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  const out = await getForApp(token);
  if (!out) return Response.json({ error: "Richiesta non trovata." }, { status: 404 });
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request, props) {
  const az = await authorize(CAPABILITIES.SOCIAL_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const { token } = await props.params;
  if (!validToken(token)) return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  let r;
  if (body?.action === "update") r = await updateRequest(token, body.data || {}, az.userId);
  else if (body?.action === "sent") r = await markSent(token);
  else if (body?.action === "review") r = await reviewShot(token, String(body.shotId || ""), body.verdict, body.note, az.userId);
  else if (body?.action === "removeMedia") r = await removeShotMedia(token, String(body.shotId || ""), body.kind);
  else r = { ok: false, status: 400, error: "Richiesta non valida." };
  return Response.json(r.ok ? r : { error: r.error, errors: r.errors }, { status: r.ok ? 200 : r.status });
}
