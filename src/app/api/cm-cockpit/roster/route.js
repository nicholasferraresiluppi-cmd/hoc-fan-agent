/**
 * GET /api/cm-cockpit/roster?startedAt=ISO&endedAt=ISO
 *
 * Vista 1 del cockpit: operatori con turno assegnato in TIMELINE nella
 * finestra (regola decisa da Nicholas: si supervisiona solo chi risulta
 * in turno; i fuori programma passano dal flag off_schedule in apertura).
 * Cache KV 60s (la timeline è per-creator: ~30-40 chiamate CP).
 */
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getTimelineRoster } from "@/lib/cm-cockpit";

export const maxDuration = 60;

export async function GET(request) {
  const az = await authorize(CAPABILITIES.CM_COCKPIT);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  const url = new URL(request.url);
  const startedAt = url.searchParams.get("startedAt");
  const endedAt = url.searchParams.get("endedAt");
  if (!startedAt || !endedAt || Number.isNaN(Date.parse(startedAt)) || Number.isNaN(Date.parse(endedAt))) {
    return Response.json({ error: "startedAt + endedAt (ISO) richiesti" }, { status: 400 });
  }
  const spanH = (Date.parse(endedAt) - Date.parse(startedAt)) / 3600000;
  if (spanH <= 0 || spanH > 24) {
    return Response.json({ error: "Finestra non valida (max 24h)" }, { status: 400 });
  }

  try {
    const roster = await getTimelineRoster({ startedAt, endedAt });
    return Response.json({ startedAt, endedAt, count: roster.length, roster });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
