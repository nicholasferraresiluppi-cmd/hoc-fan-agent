/**
 * /api/contabilita/quadro — tutto quello che serve al Quadro dell'impresa (18/11/2026):
 * accordi, tutti i mesi del Conto dello split e il registro spese. Il quadro si calcola nel
 * browser con spese-core (stessa funzione dei test).
 * Accesso: lib/compensi-access (titolari + chi ha l'accesso contabilità; admin no).
 */
import { requireAccounting, audit } from "@/lib/compensi-access";
import { getSplitConfig, getAllSplitMonths, getSplitExpenses } from "@/lib/split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET() {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const [config, months, expenses] = await Promise.all([getSplitConfig(), getAllSplitMonths(), getSplitExpenses()]);
  await audit(az.userId, "quadro impresa aperto");
  return Response.json({ config, months, expenses, owner: az.owner, today: new Date().toISOString().slice(0, 10) }, { headers: NS });
}
