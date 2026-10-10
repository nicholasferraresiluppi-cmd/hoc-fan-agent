// GET /api/admin/qualita — i tre controlli in una risposta: coerenza (calcolata ora), ultimo giro del
// robot con i compiti, «pronto per…» per persona (lib/qualita). Solo admin (SEED).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { listMembers, coherenceReport, getGiroReport, readiness, GIRO_STALE_DAYS } from "@/lib/qualita";
import { TASKS } from "@/lib/qualita-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const members = await listMembers();
  const [coherence, giro] = await Promise.all([coherenceReport(members), getGiroReport()]);
  const stale = !giro.last || Date.now() - giro.last.at > GIRO_STALE_DAYS * 86400000;
  return Response.json({
    members: members.length,
    coherence,
    giro: { ...giro, stale, staleDays: GIRO_STALE_DAYS },
    readiness: readiness(giro.last, coherence),
    tasks: TASKS.map(({ id, for: f, title, why }) => ({ id, for: f, title, why })),
  });
}
