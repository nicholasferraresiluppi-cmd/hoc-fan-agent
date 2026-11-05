// Radar creator — OnlyFans cercato su Google (SEED). GET = stato; POST { action: "start" | "stop" }.
// L'avvio accende la catena /api/cron/scouting-webcheck. Costo: ~0,35 centesimi a ricerca su
// Apify, tetto 15 $ a giro (lib/scouting-webcheck).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { kickEndpoint } from "@/lib/cron-chain";
import { getWebCheck, startWebCheck, stopWebCheck, webCheckSummary } from "@/lib/scouting-webcheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ state: webCheckSummary(await getWebCheck()) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "stop") return Response.json({ state: webCheckSummary(await stopWebCheck()) });
    if (body.action !== "start") return Response.json({ error: "azione non valida" }, { status: 400 });
    const st = await startWebCheck({ by: az.userId });
    const kicked = st.status === "in_corso" ? await kickEndpoint(request, "/api/cron/scouting-webcheck") : null;
    return Response.json({ state: webCheckSummary(st), kicked });
  } catch (e) {
    return Response.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
