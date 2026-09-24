// Esempi di vendita APPROVATI dal sales manager, per gli operatori
// (/academy/vendere). Auth-only come le altre API didattiche Academy: il
// contenuto è materiale formativo già revisionato (fan oscurati, nessun nome
// operatore, nessun id interno — stripExampleForOperators).
export const runtime = "nodejs";

import { auth } from "@clerk/nextjs/server";
import { listApproved } from "@/lib/sales-coaching";
import { stripExampleForOperators } from "@/lib/sales-coaching-core";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const approved = await listApproved();
  return Response.json({ examples: approved.map((e) => stripExampleForOperators(e, e.creator)) });
}
