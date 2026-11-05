/**
 * Presenze Discord (03/11/2026, Nicholas): «un'interfaccia dove possono avere accesso solamente alcune persone».
 * Stessa logica della Contabilità e di Creator AI: NON è una capability RBAC (l'admin le riceve tutte e la
 * vedrebbe chiunque sia admin). Entrano il titolare (env HOC_ACCOUNTING_OWNER_IDS) e le persone elencate in
 * env HOC_PRESENZE_VIEWER_IDS (userId Clerk separati da virgola). Mai in «Vedi come».
 */
import { auth } from "@clerk/nextjs/server";
import { viewAsFor } from "@/lib/view-as";
import { isAccountingOwner } from "@/lib/compensi-access";

const viewers = () => String(process.env.HOC_PRESENZE_VIEWER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

export const hasPresenzeAccess = (userId) => Boolean(userId) && (isAccountingOwner(userId) || viewers().includes(userId));

export async function requirePresenze() {
  const deny = (status, error) => ({ ok: false, response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) });
  const { userId } = await auth();
  if (!userId) return deny(401, "Sessione scaduta o assente.");
  if (!hasPresenzeAccess(userId)) return deny(403, "Sezione riservata.");
  if (await viewAsFor(userId).catch(() => null)) return deny(403, "Non disponibile in modalità «Vedi come».");
  return { ok: true, userId };
}
