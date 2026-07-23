// Qualità turni · GET — vista turno×operatore per creator×giorno.
// Dati denaro (venduto per turno) → gate scope "all" come le altre viste money.

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { getCreators, getShiftQualityDay, isHocCreator, bigQueryConfigured } from "@/lib/shift-quality";
import { readAnalysis } from "@/lib/shift-quality-llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get("creator_id");
  const day = searchParams.get("day");
  const force = searchParams.get("force") === "1";

  try {
    const creators = await getCreators(); // già tenant-scoped (org HOC)
    if (!creatorId || !day) return Response.json({ creators });

    if (!(await isHocCreator(creatorId))) {
      return Response.json({ error: "Creator fuori dal perimetro HOC" }, { status: 403 });
    }
    const [dayData, content] = await Promise.all([
      getShiftQualityDay(creatorId, day, { force }),
      readAnalysis(creatorId, day),
    ]);
    const creator_name = creators.find((c) => c.creator_id === String(creatorId))?.creator_name || `#${creatorId}`;
    return Response.json({ creators, creator_name, ...dayData, ...content });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
