// Curatela degli esempi reali: approva (→ visibile agli operatori in
// /academy/vendere), togli approvazione, nascondi. È anche il gate PII: il
// testo libero passa da un umano prima di arrivare agli operatori.
// Gate: authorizeAll(SCORES_VIEW).
export const runtime = "nodejs";

import { authorizeAll, CAPABILITIES } from "@/lib/rbac";
import { getSalesCoachingData, approveExample, unapproveExample, hideExample, listApproved } from "@/lib/sales-coaching";

export async function POST(request) {
  const az = await authorizeAll(CAPABILITIES.SCORES_VIEW);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  const { action, id, note } = body || {};
  if (!id || typeof id !== "string") return Response.json({ error: "id mancante" }, { status: 400 });
  try {
    if (action === "approve") {
      const data = await getSalesCoachingData();
      const ex = data?.examples?.find((e) => e.id === id) || (await listApproved()).find((e) => e.id === id);
      if (!ex) return Response.json({ error: "Esempio non più disponibile: ricarica la pagina" }, { status: 404 });
      const creatorName = data?.meta?.names?.[String(ex.creator_id)] || ex.creator || "";
      await approveExample(ex, { note, creatorName }, az.userId);
    } else if (action === "unapprove") {
      await unapproveExample(id);
    } else if (action === "hide") {
      await hideExample(id);
    } else {
      return Response.json({ error: "Azione non valida" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message || "Operazione fallita" }, { status: 400 });
  }
}
