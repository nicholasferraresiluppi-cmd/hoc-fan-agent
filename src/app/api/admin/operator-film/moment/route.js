// Transcript on-demand di un momento della libreria (SEED) — apre anche i
// momenti fuori dal top-8 del payload ("come arrivo alle altre 22"). Il record
// libreria porta lo user_id server-side; la card risponde SOLO con l'alias.

export const runtime = "nodejs";
export const maxDuration = 30;

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { getMomentInternal } from "@/lib/film-library";
import { getMomentCard, bigQueryConfigured } from "@/lib/operator-game-film";

export async function GET(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  if (!bigQueryConfigured()) return Response.json({ error: "BigQuery non configurato" }, { status: 503 });
  const url = new URL(request.url);
  const operator = (url.searchParams.get("operator") || "").slice(0, 120).trim();
  const key = (url.searchParams.get("key") || "").slice(0, 200);
  if (!operator || !key) return Response.json({ error: "operator e key obbligatori" }, { status: 400 });
  try {
    const meta = await getMomentInternal(operator, key);
    if (!meta) return Response.json({ error: "Momento non in libreria" }, { status: 404 });
    const card = await getMomentCard(meta);
    if (meta.judgment) card.judgment = meta.judgment;
    return Response.json({ ok: true, moment: card });
  } catch (e) {
    return Response.json({ error: e.message || "Transcript non disponibile" }, { status: 500 });
  }
}
