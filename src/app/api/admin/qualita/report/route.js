// POST /api/admin/qualita/report — il robot del giro consegna il rapporto (lib/qualita.saveGiroReport),
// poi si riallineano subito gli alert del giro. Solo admin (SEED); in «Vedi come» il middleware blocca le scritture.
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { saveGiroReport } from "@/lib/qualita";
import { runChecks } from "@/lib/ops-alerts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.personas)) return Response.json({ error: "Rapporto non valido." }, { status: 400 });
  const report = await saveGiroReport(body);
  const alerts = await runChecks({ trigger: "giro", only: ["qa-giro"] }).catch((e) => ({ error: String(e?.message || e) }));
  return Response.json({ ok: true, summary: report.summary, alerts });
}
