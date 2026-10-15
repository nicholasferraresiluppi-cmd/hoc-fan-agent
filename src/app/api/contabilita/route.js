/**
 * /api/contabilita — elenco mesi + chi sei (titolare o membro). Accesso: lib/compensi-access.
 */
import { requireAccounting } from "@/lib/compensi-access";
import { listMonths } from "@/lib/compensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NS = { "Cache-Control": "no-store" };

export async function GET() {
  const az = await requireAccounting();
  if (!az.ok) return az.response;
  return Response.json({ owner: az.owner, months: await listMonths() }, { headers: NS });
}
