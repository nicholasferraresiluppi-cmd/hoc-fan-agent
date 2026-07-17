/**
 * GET /api/admin/ops-alerts
 * Lista alert operativi + esito ultimo run (ADR: docs/ALERT_OPERATIVI.md).
 * authorizeAll(SCORES_VIEW): i finding espongono dati denaro (wage, fee, score).
 */
import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { listAlerts } from "@/lib/ops-alerts";

export async function GET() {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const { alerts, last_run } = await listAlerts();
  return Response.json({ alerts, last_run });
}
