// Giudizio del coach su un momento del film (SEED). Persiste sull'id stabile:
// sopravvive ai ricalcoli (è l'aperto "registro del giudizio" del decision log).
// Tassonomia CHIUSA per "legittima"; su "da_coaching" la risposta porta il
// percorso Academy suggerito dal gap della persa (coaching-paths, read-time).
// Coaching, MAI metrica: questi stati non alimentano score/leaderboard/comp.

export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { judgeMoment } from "@/lib/film-library";
import { lossGapKey, JUDGMENT_STATUSES, LEGIT_REASONS } from "@/lib/film-library-core";
import { recommendPathForGap } from "@/lib/coaching-paths";

export async function POST(request) {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON mancante" }, { status: 400 });
  }
  const operator = String(body?.operator || "").slice(0, 120).trim();
  const key = String(body?.key || "").slice(0, 200);
  const { status, reason, note } = body || {};
  if (!operator || !key) return Response.json({ error: "operator e key obbligatori" }, { status: 400 });
  try {
    const { moment, counts } = await judgeMoment(operator, key, { status, reason, note });
    // percorso suggerito quando la persa va a coaching (dal catalogo corrente)
    let path = null;
    if (status === "da_coaching" && moment?.kind === "loss") {
      const gap = lossGapKey(moment.reason);
      if (gap) path = recommendPathForGap(gap);
    }
    return Response.json({ ok: true, moment, counts, path });
  } catch (e) {
    return Response.json({ error: e.message || "Giudizio fallito" }, { status: 400 });
  }
}

export async function GET() {
  // introspezione tassonomia (per la UI: select motivi sempre allineata)
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  return Response.json({ statuses: JUDGMENT_STATUSES, legit_reasons: LEGIT_REASONS });
}
