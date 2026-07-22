// Priority Queue · Fase 0 — worklist fan per creator (metadata chat + valore da BigQuery).
// Dati fan sensibili (username + LTV) → gate scope "all".

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { getCreators, getPriorityQueue, bigQueryConfigured } from "@/lib/priority-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });

  if (!bigQueryConfigured()) {
    return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get("creator_id");

  try {
    const creators = await getCreators();
    if (!creatorId) return Response.json({ creators, queue: null });
    const q = await getPriorityQueue(creatorId);
    const creator_name = creators.find((c) => c.creator_id === String(creatorId))?.creator_name || `#${creatorId}`;
    return Response.json({ creators, creator_name, ...q });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
