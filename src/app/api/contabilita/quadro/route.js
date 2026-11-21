/**
 * /api/contabilita/quadro — tutto quello che serve al Quadro dell'impresa (18/11/2026):
 * accordi, tutti i mesi del Conto dello split e il registro spese. Il quadro si calcola nel
 * browser con spese-core (stessa funzione dei test).
 * POST {event:"scaricato"}: traccia nel registro accessi il download del file (21/11/2026).
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

/** Il file scaricato si costruisce nel browser: qui resta solo la traccia nel registro accessi. */
export async function POST(req) {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  const body = await req.json().catch(() => ({}));
  if (body?.event !== "scaricato") return Response.json({ error: "evento sconosciuto" }, { status: 400, headers: NS });
  await audit(az.userId, "quadro impresa scaricato");
  return Response.json({ ok: true }, { headers: NS });
}
