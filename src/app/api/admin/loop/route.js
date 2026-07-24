/**
 * /api/admin/loop — lettura del loop azione→esito (dati denaro + LTV fan).
 *
 * GET  → lista date snapshot | (?day) creator del giorno | (?day&creator_id) esito
 * POST → cattura manuale ora (SEED)
 *
 * Gate: authorizeAll(SCORES_VIEW) in lettura (scope "all", come le altre route
 * con venduto/LTV), SEED per la cattura. Tenant HOC by construction.
 */
import { authorize, authorizeAll, CAPABILITIES } from "@/lib/rbac";
import {
  listSnapshotDates, snapshotCreators, readSnapshot, computeOutcomes, captureAllSnapshots, bigQueryConfigured,
} from "@/lib/loop-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });

  const url = new URL(request.url);
  const day = url.searchParams.get("day");
  const cid = url.searchParams.get("creator_id");

  try {
    if (day && cid) {
      return Response.json({ snapshot: await computeOutcomes(cid, day) });
    }
    if (day) {
      const cids = await snapshotCreators(day);
      const snaps = (await Promise.all(cids.map((c) => readSnapshot(c, day)))).filter(Boolean);
      snaps.sort((a, b) => (b.waiting + b.cooling) - (a.waiting + a.cooling));
      return Response.json({
        day,
        creators: snaps.map((s) => ({
          creator_id: s.creator_id, creator_name: s.creator_name,
          waiting: s.waiting, cooling: s.cooling, fans: (s.fans || []).length,
        })),
      });
    }
    return Response.json({ dates: await listSnapshotDates() });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  try {
    return Response.json(await captureAllSnapshots());
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
