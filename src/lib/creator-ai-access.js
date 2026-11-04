/**
 * Creator AI (01/11/2026, Nicholas): "teniamolo privato tra me e me". Stessa logica della
 * Contabilità: NON è una capability RBAC, altrimenti la vedrebbero tutti gli admin.
 * Entra solo il titolare (env HOC_ACCOUNTING_OWNER_IDS), mai in "Vedi come".
 */
import { auth } from "@clerk/nextjs/server";
import { viewAsFor } from "@/lib/view-as";
import { isAccountingOwner } from "@/lib/compensi-access";

export async function requireCreatorAi() {
  const deny = (status, error) => ({ ok: false, response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) });
  const { userId } = await auth();
  if (!userId) return deny(401, "Sessione scaduta o assente.");
  if (!isAccountingOwner(userId)) return deny(403, "Sezione privata.");
  if (await viewAsFor(userId).catch(() => null)) return deny(403, "Non disponibile in modalità «Vedi come».");
  return { ok: true, userId };
}
