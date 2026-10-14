// S4S — cosa aspetta chi guarda: richieste da accettare, S4S di oggi da programmare, kit
// mancanti (14/10/2026, punto 4: notifiche in app). Badge nel menu, riquadro nella home,
// numero sulla scheda Oggi. Leggero (niente BigQuery). Chi non ha accesso al calendario
// riceve count 0 e nessun errore: il menu lo chiede solo a chi vede la voce.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { authorizeScoped, allowsCreator } from "@/lib/creator-scope";
import { CAPABILITIES } from "@/lib/rbac";
import { listSplits, getNames } from "@/lib/s4s";
import { inboxFor } from "@/lib/s4s-view";

export async function GET() {
  const az = await authorizeScoped(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ count: 0, access: false });
  const all = Boolean(az.creatorScope.all);
  const names = await getNames();
  const mineOf = (split) => split.creator_ids.map(Number).filter((id) => all || allowsCreator(az.creatorScope, names[String(id)]));
  try {
    const out = await inboxFor(await listSplits(), mineOf);
    return Response.json({ ...out, access: true, all }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ count: 0, access: true, error: e.message || "Calcolo non riuscito" });
  }
}
