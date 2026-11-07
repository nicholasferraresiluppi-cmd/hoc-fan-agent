/**
 * /api/admin/hr/operator-links — collegamento in blocco schede CRM → Infloww
 * (people.manage: admin e People Partner). Logica in lib/person-operator.
 *
 * GET  → { rows: [{ personId, name, phase, suggestion, kind }], total, linked, withoutSuggestion }
 * POST { items: [{ personId, inflowwName }] } → { linked, skipped } (ognuna rivalidata)
 */
import { currentUser } from "@clerk/nextjs/server";
import { authorize, CAPABILITIES } from "@/lib/rbac";
import { bulkOperatorView, linkMany } from "@/lib/person-operator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  try {
    return Response.json(await bulkOperatorView());
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  const az = await authorize(CAPABILITIES.PEOPLE_MANAGE);
  if (!az.ok) return Response.json({ error: az.message }, { status: az.status });
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.items) || !body.items.length) return Response.json({ error: "Nessuna scheda da collegare" }, { status: 400 });
  const me = await currentUser().catch(() => null);
  const actor = { id: az.userId, name: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || null };
  return Response.json(await linkMany(body.items, actor));
}
