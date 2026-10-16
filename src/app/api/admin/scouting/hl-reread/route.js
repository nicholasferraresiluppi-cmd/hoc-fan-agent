// Radar creator — rilettura delle prime storie in evidenza (SEED). GET = stato;
// POST { action: "start" | "stop" }. L'avvio accende la catena /api/cron/scouting-hlreread.
// Costo: ~2,3 centesimi a creator su Apify, tetto 25 $ (lib/scouting-hlreread).
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { kickEndpoint } from "@/lib/cron-chain";
import { getHlReread, startHlReread, stopHlReread, hlRereadSummary } from "@/lib/scouting-hlreread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ state: hlRereadSummary(await getHlReread()) });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "stop") return Response.json({ state: hlRereadSummary(await stopHlReread()) });
    if (body.action !== "start") return Response.json({ error: "azione non valida" }, { status: 400 });
    const st = await startHlReread({ by: az.userId });
    const kicked = st.status === "in_corso" ? await kickEndpoint(request, "/api/cron/scouting-hlreread") : null;
    return Response.json({ state: hlRereadSummary(st), kicked });
  } catch (e) {
    return Response.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
