// La città — API (SEED). GET = ultima fotografia di ClickUp; POST = carica una fotografia nuova.
// GATE: SEED (admin) — nomi di persone, carichi di lavoro e ritardi di tutta l'azienda.
export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getCitySnapshot, saveCitySnapshot } from "@/lib/citta";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const snap = await getCitySnapshot();
  return Response.json(snap || { spaces: [], generated: null });
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 1_000_000) return Response.json({ error: "Fotografia troppo grande (max 1 MB)." }, { status: 413 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "JSON non valido." }, { status: 400 }); }
  try {
    const snap = await saveCitySnapshot(body);
    return Response.json({ ok: true, generated: snap.generated, spaces: snap.spaces.length });
  } catch (e) {
    return Response.json({ error: e?.message || "Fotografia non valida." }, { status: 400 });
  }
}
