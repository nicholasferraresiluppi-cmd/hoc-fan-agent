// Coda film aggregata (SEED): quanti momenti NUOVI da giudicare, per operatore
// seguito. Alimenta il pannello d'ingresso su /admin/operator-signals — il
// rituale del coach parte da qui, non dal ricordarsi di aprire N pagine.

export const runtime = "nodejs";

import { authorize, CAPABILITIES } from "@/lib/rbac";
import { queueSummaries } from "@/lib/film-library";

export async function GET() {
  const az = await authorize(CAPABILITIES.SEED);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    return Response.json(await queueSummaries());
  } catch (e) {
    return Response.json({ error: e.message || "Coda non disponibile" }, { status: 500 });
  }
}
