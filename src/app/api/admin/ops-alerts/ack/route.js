/**
 * POST /api/admin/ops-alerts/ack — presa in carico di un alert.
 * Body: { fingerprint, name? } (name = display name, l'identità vera è az.userId).
 * Stato globale di team: chiunque con SCORES_VIEW "all" vede chi l'ha in carico.
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { ackAlert } from "@/lib/ops-alerts";

export async function POST(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  let body = {};
  try { body = await request.json(); } catch { /* body vuoto */ }
  const fingerprint = String(body.fingerprint || "");
  if (!fingerprint) return Response.json({ error: "fingerprint richiesto" }, { status: 400 });

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : null;
  const res = await ackAlert(fingerprint, { userId: az.userId, name });
  if (!res.ok) return Response.json({ error: res.message }, { status: res.status });
  return Response.json({ ok: true, alert: res.alert });
}
